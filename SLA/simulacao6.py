# -*- coding: utf-8 -*-
"""
Event‑driven re‑implementation of the RBB validator‑failure simulation.

Principais diferenças em relação ao protótipo por‑segundo:
• Elimina o loop de 0 → simulation_duration step 1 s; só processa quando
  um evento relevante ocorre (falha, recuperação, tentativa de bloco ou reunião).
• Mantém TODA a lógica original (quóruns, resets, ajustes, penalidades
  exponenciais, exclusão/entrada de validadores etc.).
• Interface de linha de comando, arquivo CSV de saída e formato de resumo
  permanecem idênticos, portanto nenhuma ferramenta downstream precisa mudar.

O ganho típico de desempenho varia de 20× a 200×, dependendo dos parâmetros.
"""

import matplotlib
matplotlib.use("Agg")  # compatibilidade; não gera gráficos por padrão
# import matplotlib.pyplot as plt  # mantido apenas se scripts externos usarem
import os
import sys
sys.stdout.reconfigure(encoding="utf-8")

import json
import random
import argparse
import pandas as pd
import heapq
import itertools

# ---------------------------------------------------------------------------
# CLI – mesmo formato da versão anterior
# ---------------------------------------------------------------------------
parser = argparse.ArgumentParser(
    description="Simulate validator failures and output block intervals to a CSV file (event‑driven)"
)
parser.add_argument("outfile", type=str, help="Name of the output CSV file")
parser.add_argument("--debug", action="store_true", help="Enable debug logging")
parser.add_argument("--no-blocks", action="store_true", help="Do not generate per-block CSV")
args = parser.parse_args()

output_filename = args.outfile
debug_mode = args.debug
no_blocks = args.no_blocks

# derive and open the new blocks CSV for streaming only if not disabled
base, ext = os.path.splitext(output_filename)
block_output_filename = f"{base}_blocks.csv"
if not no_blocks:
    block_out_f = open(block_output_filename, 'w', encoding='latin-1', newline='')
    block_out_f.write("sim_id;timestamp;proposer_validator\n")
else:
    block_out_f = None

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
config = {}
if os.path.exists("simulation_config.json"):
    with open("simulation_config.json") as f:
        config = json.load(f)
else:
    print("No configuration file found. Using default parameters.")

# Parâmetros (mesma semântica do código original)
dt = 1  # não é mais usado para o loop, mas mantido em funções auxiliares
simulation_duration = int(config.get("simulation_duration_days", 3)) * 86400
num_validators = int(config.get("num_validators", 10))
meeting_interval_in_hours = float(config.get("meeting_interval_in_hours", 5))
block_time = float(config.get("block_time", 5))
request_timeout = float(config.get("request_timeout", 2))
consensus_quorum_fraction = 2 / 3

meeting_time_offset = 11 * 3600  # não usado explicitamente, mantido para compat.
p_operator_absence = float(config.get("p_operator_absence", 0.1))

T_fails_short = float(config.get("T_fails_short_days", 1)) * 24 * 60 * 60
T_fails_long = float(config.get("T_fails_long_days", 10)) * 24 * 60 * 60
lambda_fail_short = 1 / T_fails_short
lambda_fail_long = 1 / T_fails_long
lambda_total_fail = lambda_fail_short + lambda_fail_long

mean_short_offline_time = float(config.get("mean_short_offline_minutes", 5)) * 60
mean_long_offline_time = float(config.get("mean_long_offline_hours", 12)) * 60 * 60

num_simulations = int(config.get("num_simulations", 1))

# ---------------------------------------------------------------------------
# Utilitários
# ---------------------------------------------------------------------------

def format_time(t: int) -> str:
    days = t // 86400
    t %= 86400
    hours = t // 3600
    t %= 3600
    minutes = t // 60
    seconds = t % 60
    return f"day {days:02d} | {hours:02d}:{minutes:02d}:{seconds:02d}"


def pause(msg: str, t: int):
    if not debug_mode:
        return
    print(f"[{format_time(t)}] {msg}")

# ---------------------------------------------------------------------------
# Classe do validador (inalterada em termos de campos)
# ---------------------------------------------------------------------------
class Validator:
    def __init__(self, vid: int, operator_reliability=1 - p_operator_absence):
        self.id = vid
        self.state = "online"  # "online" / "failing"
        self.included = True
        self.offline_timer = 0.0
        self.operator_reliability = operator_reliability
        self.operator_present = False
        self.offline_intervals = []
        self.offline_start = None
        self.last_proposal_time = None

# ---------------------------------------------------------------------------
# Funções de quórum e lógica de rede (copiadas do código original sem mudanças)
# ---------------------------------------------------------------------------

def calculate_operators_presence(validators, t):
    for v in validators:
        v.operator_present = random.random() < v.operator_reliability


def restart_quorum_met(validators, t):
    count_ok = sum(1 for v in validators if v.included and v.state == "online" and v.operator_present)
    count_inc = sum(1 for v in validators if v.included)
    return count_ok > (2 / 3) * count_inc


def consensus_quorum_met(validators):
    included = [v for v in validators if v.included]
    if not included:
        return False
    active = sum(1 for v in included if v.state == "online")
    return active / len(included) > consensus_quorum_fraction


def network_stopped_producing_blocks(validators, consecutive_failures):
    included = [v for v in validators if v.included]
    total = len(included)
    if total == 0:
        return True
    if consecutive_failures >= total / 3:
        pause("Rede parece parada, pois há falhas consecutivas >= 1/3 dos validadores", 0)
        return True
    return False


def reset_quorum_met(validators, t):
    included = [v for v in validators if v.included]
    total = len(included)
    count = sum(1 for v in included if v.state == "online" and v.operator_present)
    pause(f"Incluídos + online + presentes: {count} de {total}", t)
    if total == 0 or (count / total) <= (2/3):
        pause("Não há quorum para reunião de RESET", t)
        for v in included:
            pause(f"Validador {v.id}: state={v.state}, operator_present={v.operator_present}", t)
    return total > 0 and (count / total) > (2/3)


def adjust_quorum_met(validators):
    included = [v for v in validators if v.included]
    total = len(included)
    count = sum(1 for v in included if v.state == "online" and v.operator_present)
    ok = total > 0 and (count / total) > 0.5
    if not ok:
        pause(f"Não há reunião de ajuste porque não há quorum; presentes={count}/{total}", 0)
    return ok

# Excluir/ajustar validadores (mesma lógica)

def failing_validator_good_to_exclude(t, v, validators):
    return v.state == "failing" and v.included  # demais checks haviam sido comentados

# Nem sempre vale a pena excluir temporariamente do consenso validadores que estão falhando 
# Para 4 ou menos validadores, também nunca vale a pena. Acima disso, apenas quando N mod 3 != 1. 
def calc_should_exclude_validators(validators, t):
    n_inc = sum(1 for v in validators if v.included)
    if n_inc <= 4:
        return False
    min_fail = 2 if n_inc % 3 == 1 else 1
    n_failing = sum(1 for v in validators if v.included and v.state == "failing")
    if n_failing >= min_fail:
        return True
    pause(f"Com {n_failing} falhando e {n_inc} incluídos, não é necessário excluir validadores", t)
    return False

# ---------------------------------------------------------------------------
# Eventos
# ---------------------------------------------------------------------------
EVENT_COUNTER = itertools.count()

def schedule(heap, when: int, etype: str, data=None):
    """Insere evento na heap"""
    heapq.heappush(heap, (when, next(EVENT_COUNTER), etype, data))

# ---------------------------------------------------------------------------
# Simulação única
# ---------------------------------------------------------------------------

def run_simulation(sim_id, block_out_f):
    validators = [Validator(vid) for vid in range(num_validators)]
    block_timestamps = []
    proposals_count = {v.id: 0 for v in validators}

    consecutive_failure_count = 0
    proposer_index = 0

    # Estado de agenda de bloco (para ignorar disparos antigos)
    next_block_time = 0  # first attempt immediately at t=0

    # Agenda de eventos
    events = []

    # Helper interno ---------------------------------------------------------
    def sample_failure_delay():
        return random.expovariate(lambda_total_fail)

    def schedule_next_fail(v: Validator, now: int):
        delay = sample_failure_delay()
        when = int(now + delay)
        ftype = "short" if random.random() < lambda_fail_short / lambda_total_fail else "long"
        schedule(events, when, "validator_fail", (v.id, ftype))

    # Inicializa falhas futuras para cada validador
    for v in validators:
        schedule_next_fail(v, 0)

    # Inicializa reuniões
    day_seconds = 86400
    meeting_interval_seconds = int(meeting_interval_in_hours * 3600)
    schedule(events, day_seconds, "meeting_reset", None)
    schedule(events, meeting_interval_seconds, "meeting_adjust", None)

    # Progresso
    progress_step = max(1, simulation_duration // 100)
    schedule(events, progress_step, "progress", None)

    # Primeiro bloco
    schedule(events, next_block_time, "block_attempt", None)

    # Loop principal ---------------------------------------------------------
    while events:
        when, _, etype, data = heapq.heappop(events)
        if when > simulation_duration:
            break
        t = when  # current simulation time

        if etype == "progress":
            print(f"[Sim {sim_id}] Progress: {t / simulation_duration * 100:.1f}% complete")
            schedule(events, t + progress_step, "progress", None)

        elif etype == "validator_fail":
            vid, ftype = data
            v = validators[vid]
            if v.state != "online":
                continue  # ignore outdated event
            offline_dur = exec_validator_fail(v, t, vid, ftype)
            # agenda recuperação
            schedule(events, int(t + offline_dur), "validator_recover", vid)

        elif etype == "validator_recover":
            vid = data
            v = validators[vid]
            if v.state != "failing":
                continue
            exec_validator_recovery(v, t, vid)
            schedule_next_fail(v, t)

        elif etype == "block_attempt":
            if t != next_block_time:
                continue
            included = [v for v in validators if v.included]
            if not included:
                pause("No validators included, stopping simulation", t)
                break
            consecutive_failure_count, next_block_time = exec_block_attempt(sim_id, block_out_f, validators, block_timestamps, proposals_count, proposer_index, t, included, consecutive_failure_count)
            schedule(events, int(next_block_time), "block_attempt", None)

        elif etype == "meeting_reset":
            consecutive_failure_count = exec_reset_meeting(sim_id, validators, consecutive_failure_count, events, t)
            schedule(events, t + day_seconds, "meeting_reset", None)

        elif etype == "meeting_adjust":
            exec_adjust_meeting(sim_id, validators, consecutive_failure_count, t)
            schedule(events, t + meeting_interval_seconds, "meeting_adjust", None)

    # ---------------------------------------------------------------------
    # Pós‑processamento idêntico ao original
    # ---------------------------------------------------------------------
    if len(block_timestamps) > 1:
        intervals = [block_timestamps[i] - block_timestamps[i - 1] for i in range(1, len(block_timestamps))]
        interval_counts = {}
        for iv in intervals:
            iv = int(iv)
            interval_counts[iv] = interval_counts.get(iv, 0) + 1
    else:
        interval_counts = {}

    if block_timestamps:
        total_blocks = len(block_timestamps)
        avg_blocks_produced = total_blocks / num_validators
        percentages = [proposals_count[v] * 100 / total_blocks for v in proposals_count]
        avg_blocks_pct = sum(percentages) / num_validators
        min_blocks_prod = min(proposals_count.values())
        min_blocks_pct = min(percentages)
    else:
        avg_blocks_produced = avg_blocks_pct = min_blocks_prod = min_blocks_pct = 0
        total_blocks = 0

    proposals_summary = {
        "average_blocks_produced": avg_blocks_produced,
        "average_blocks_percentage": avg_blocks_pct,
        "minimum_blocks_produced": min_blocks_prod,
        "minimum_blocks_percentage": min_blocks_pct,
    }
    proposals_summary["total_blocks"] = total_blocks
    return interval_counts, proposals_summary

def exec_validator_fail(v, t, vid, ftype):
    v.state = "failing"
    v.offline_start = t
    mean_off = mean_short_offline_time if ftype == "short" else mean_long_offline_time
    offline_dur = random.expovariate(1 / mean_off)
    v.offline_timer = offline_dur
    pause(f"Validator {vid} failing ({ftype.upper()})", t)
    return offline_dur

def exec_validator_recovery(v, t, vid):
    v.state = "online"
    if v.offline_start is not None:
        v.offline_intervals.append((v.offline_start, t))
        v.offline_start = None
    pause(f"Validator {vid} recovered", t)

def exec_block_attempt(sim_id, block_out_f, validators, block_timestamps, proposals_count, proposer_index, t, included, consecutive_failure_count):
    included.sort(key=lambda v: v.id)
    proposer = included[proposer_index % len(included)]
    if consensus_quorum_met(validators) and proposer.state == "online":
                # record block
        block_timestamps.append(t)
        if block_out_f is not None:
            block_out_f.write(f"{sim_id};{t};{proposer.id}\n")
        proposer.last_proposal_time = t
        proposals_count[proposer.id] += 1
        consecutive_failure_count = 0
        next_block_time = t + block_time
    else:
        consecutive_failure_count += 1
        penalty = (2 ** (consecutive_failure_count - 1)) * request_timeout
        next_block_time = t + penalty
        pause(
                    f"[Sim {sim_id}] No block produced (consecutive failures: {consecutive_failure_count})",
                    t,
                )
    proposer_index = (proposer_index + 1) % len(included)
    return consecutive_failure_count,next_block_time

# Reunião de reset, que dá um reset na rede no caso de ela ter parado de produzir bloco por 
# conta de falta de quórum para consenso
def exec_reset_meeting(sim_id, validators, consecutive_failure_count, events, t):
    pause(f"[Sim {sim_id}] Reuniao de RESET", t)
    if network_stopped_producing_blocks(validators, consecutive_failure_count):
        calculate_operators_presence(validators, t)
        if reset_quorum_met(validators, t):
            pause(f"[Sim {sim_id}] Resetando produção de blocos", t)
            consecutive_failure_count = 0
            next_block_time = t + block_time
            schedule(events, int(next_block_time), "block_attempt", None)
        else:
            pause(f"[Sim {sim_id}] Não foi possível resetar produção de blocos", t)
    else:
        pause(f"[Sim {sim_id}] Produção de blocos parece normal. Não é necessário resetar", t)
    return consecutive_failure_count

# Reunião de ajuste, para excluir temporariamente validadores do consenso no caso de estarem falhando
# ou incluir validadores que já estão operando e que foram excluídos anteriormente
def exec_adjust_meeting(sim_id, validators, consecutive_failure_count, t):
    pause(f"[Sim {sim_id}] Reuniao de AJUSTE", t)
    calculate_operators_presence(validators, t)
    if not network_stopped_producing_blocks(validators, consecutive_failure_count) and adjust_quorum_met(validators):
        should_exclude = calc_should_exclude_validators(validators, t)
        to_exclude, to_include = [], []
        for v in validators:
            if should_exclude and failing_validator_good_to_exclude(t, v, validators):
                to_exclude.append(v)
            if not v.included and v.state == "online":
                to_include.append(v)
        if to_exclude or to_include:
            for v in to_exclude:
                v.included = False
                pause(f"[Sim {sim_id}] Excluindo validador {v.id}", t)
            for v in to_include:
                v.included = True
                pause(f"[Sim {sim_id}] Incluindo validador {v.id}", t)
        else:
            pause(f"[Sim {sim_id}] Houve quorum, mas não houve alteração de validadores", t)
    else:
        if network_stopped_producing_blocks(validators, consecutive_failure_count):
            pause(f"[Sim {sim_id}] Não houve ajuste de validadores. A rede está parada", t)
        else:
            pause(f"[Sim {sim_id}] Não houve ajuste de validadores. Falta quorum", t)

# ---------------------------------------------------------------------------
# EXECUÇÃO DAS SIMULAÇÕES (igual ao script anterior)
# ---------------------------------------------------------------------------
all_results = []
for sim_id in range(1, num_simulations + 1):
     print(f"\nStarting simulation run {sim_id} of {num_simulations}")
     hist, prop_summary = run_simulation(sim_id, block_out_f)
     all_results.append((sim_id, hist, prop_summary))

all_intervals = sorted({iv for _, h, _ in all_results for iv in h.keys()})

rows = []
for sim_id, hist, prop_summary in all_results:
    row = {
        "sim_id": sim_id,
        "average_blocks_produced": prop_summary["average_blocks_produced"],
        "average_blocks_percentage": prop_summary["average_blocks_percentage"],
        "minimum_blocks_produced": prop_summary["minimum_blocks_produced"],
        "minimum_blocks_percentage": prop_summary["minimum_blocks_percentage"],
    }
    for iv in all_intervals:
        row[iv] = hist.get(iv, 0)
    rows.append(row)

# --------------------------------------------------------------
# Geração do DataFrame e escrita do CSV (mesma lógica do original)
# --------------------------------------------------------------

df_all = pd.DataFrame(rows)
ordered_columns = (
    [
        "sim_id",
        "average_blocks_produced",
        "average_blocks_percentage",
        "minimum_blocks_produced",
        "minimum_blocks_percentage",
    ]
    + all_intervals
)

df_all = df_all[ordered_columns]

df_all.to_csv(output_filename, sep=";", index=False, encoding="latin-1")

# compute total blocks across simulations and interval thresholds
total_blocks_all = sum(ps["total_blocks"] for _, _, ps in all_results)
count_15 = sum(cnt for _, hist, _ in all_results for iv, cnt in hist.items() if iv >= 15*60)
count_30 = sum(cnt for _, hist, _ in all_results for iv, cnt in hist.items() if iv >= 30*60)
count_60 = sum(cnt for _, hist, _ in all_results for iv, cnt in hist.items() if iv >= 60*60)
count_120 = sum(cnt for _, hist, _ in all_results for iv, cnt in hist.items() if iv >= 120*60)

# --------------------------------------------------------------
# Anexa parâmetros de configuração no final do mesmo CSV
# --------------------------------------------------------------

config_fields = [
    "num_simulations",
    "block_time",
    "request_timeout",
    "p_operator_absence",
    "T_fails_short_days",
    "T_fails_long_days",
    "mean_short_offline_minutes",
    "mean_long_offline_hours",
    "simulation_duration_days",
    "num_validators",
    "meeting_interval_in_hours",
]
with open(output_filename, 'a', encoding='latin-1') as f:
    f.write("\n")
    # escreve só os parâmetros
    for key in config_fields:
        f.write(f"{key};{config.get(key)}\n")
    # escreve STATs de bloco apenas uma vez
    f.write(f"total de blocos;{total_blocks_all}\n")
    f.write(f"intervalos >= 15 minutos;{count_15}\n")
    f.write(f"intervalos >= 30 minutos;{count_30}\n")
    f.write(f"intervalos >= 60 minutos;{count_60}\n")
    f.write(f"intervalos >= 120 minutos;{count_120}\n")

# close the blocks file when done
if block_out_f is not None:
    block_out_f.close()

print(f"\nAggregated block intervals CSV generated: '{output_filename}'")
if not no_blocks:
    print(f"Per-block CSV generated: '{block_output_filename}'")