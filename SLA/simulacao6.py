# -*- coding: utf-8 -*-

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

# derive and open the new blocks CSV for streaming
base, ext = os.path.splitext(output_filename)
block_output_filename = f"{base}_blocks.csv"
block_out_f = None
if not no_blocks:
    block_out_f = open(block_output_filename, 'w', encoding='latin-1', newline='')
    block_out_f.write("sim_id;timestamp;proposer_validator\n")

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
block_time = int(config.get("block_time", 5))
request_timeout = int(config.get("request_timeout", 2))
consensus_quorum_fraction = 2 / 3

reset_meeting_interval_in_hours = float(config.get("reset_meeting_interval_in_hours", 0))
reset_meeting_p_operator_absence = float(config.get("reset_meeting_p_operator_absence", 0.1))

adjust_procedure_interval_in_blocks = int(
    config.get("adjust_procedure_interval_in_blocks", 420)
)
adjust_procedure_call_failure_probability = float(
    config.get("adjust_procedure_call_failure_probability", 0.5)
)

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


def debug(msg: str, t: int):
    if not debug_mode:
        return
    print(f"[{format_time(t)}] {msg}")

# ---------------------------------------------------------------------------
# Classe do validador (inalterada em termos de campos)
# ---------------------------------------------------------------------------
class Validator:
    def __init__(self, vid: int, operator_reliability=1 - reset_meeting_p_operator_absence):
        self.id = vid
        self.state = "online"  # "online" / "failing"
        self.included = True
        self.offline_timer = 0.0
        self.operator_reliability = operator_reliability
        self.operator_present = False
        self.offline_intervals = []
        self.offline_start = None
        self.last_proposal_time = None
        self.proposed_blocks_in_adjust_period = False

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


def network_stopped_producing_blocks(validators, consecutive_failures, t):
    included = [v for v in validators if v.included]
    total = len(included)
    if total == 0:
        return True
    if consecutive_failures >= total / 3:
        debug("Rede parece parada, pois há falhas consecutivas >= 1/3 dos validadores", t)
        return True
    return False


def reset_quorum_met(validators, t):
    included = [v for v in validators if v.included]
    total = len(included)
    count = sum(1 for v in included if v.state == "online" and v.operator_present)
    debug(f"Incluídos + online + presentes: {count} de {total}", t)
    if total == 0 or (count / total) <= (2/3):
        debug("Não há quorum para reunião de RESET", t)
        for v in included:
            debug(f"Validador {v.id}: state={v.state}, operator_present={v.operator_present}", t)
    return total > 0 and (count / total) > (2/3)


def adjust_quorum_met(validators):
    included = [v for v in validators if v.included]
    total = len(included)
    count = sum(1 for v in included if v.state == "online" and v.operator_present)
    ok = total > 0 and (count / total) > 0.5
    if not ok:
        debug(f"Não há reunião de ajuste porque não há quorum; presentes={count}/{total}", 0)
    return ok

# Excluir/ajustar validadores (mesma lógica)

def failing_validator_good_to_exclude(t, v, validators):
    return v.state == "failing" and v.included  # demais checks haviam sido comentados


def calc_should_exclude_validators(validators, t):
    n_inc = sum(1 for v in validators if v.included)
    if n_inc <= 4:
        return False
    min_fail = 2 if n_inc % 3 == 1 else 1
    n_failing = sum(1 for v in validators if v.included and v.state == "failing")
    if n_failing >= min_fail:
        return True
    debug(f"Com {n_failing} falhando e {n_inc} incluídos, não é necessário excluir validadores", t)
    return False

def proposer_register_failed(validators, failure_probability):
    # Para falhar, todos os validadores incluídos e online têm que falhar
    return all(random.random() < failure_probability for v in validators if v.included and v.state == "online")

def adjust_procedure(validators, t): 
    debug(f"[Sim {sim_id}] *** Executando procedimento de ajuste ***", t)
    n_validadores_incluidos = sum(1 for v in validators if v.included) 
    change = False
    for v in validators:
        # Se validador está incluído e não propôs bloco no período, exclui, mas só se houver mais que 4 incluídos
        if v.included and not v.proposed_blocks_in_adjust_period:
            if n_validadores_incluidos > 4:
                v.included = False
                change = True
                debug(f"Validador {v.id} foi excluído por não propor bloco no período de ajuste", t)
            else:
                debug(f"Validador {v.id} não propôs bloco no período de ajuste, mas não foi excluído, pois há apenas {n_validadores_incluidos} incluídos", t)
        # Se um validador que não está incluído está online, inclui
        elif not v.included and v.state == "online":
            change = True
            v.included = True
            debug(f"Validador {v.id} foi incluído por estar online", t)

    if not change:
        debug(f"[Sim {sim_id}] Nenhuma mudança nos validadores durante o ajuste", t)

    # Reset das flags para o próximo período
    for v in validators:
        v.proposed_blocks_in_adjust_period = False

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

    if reset_meeting_interval_in_hours != 0:
        reset_meeting_interval_seconds = int(reset_meeting_interval_in_hours * 3600)
        schedule(events, reset_meeting_interval_seconds, "meeting_reset", None)

    # schedule(events, reset_meeting_interval_seconds, "meeting_adjust", None)

    # Progresso
    progress_step = max(1, simulation_duration // 100)
    schedule(events, progress_step, "progress", None)

    # Primeiro bloco
    schedule(events, next_block_time, "block_attempt", None)
    # Inicializa contador de blocos para o procedimento de ajuste
    adjust_procedure_blocks_count = 0

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
            v.state = "failing"
            v.offline_start = t
            mean_off = mean_short_offline_time if ftype == "short" else mean_long_offline_time
            offline_dur = random.expovariate(1 / mean_off)
            v.offline_timer = offline_dur
            debug(f"Validator {vid} failing ({ftype.upper()})", t)
            # agenda recuperação
            schedule(events, int(t + offline_dur), "validator_recover", vid)

        elif etype == "validator_recover":
            vid = data
            v = validators[vid]
            if v.state != "failing":
                continue
            v.state = "online"
            if v.offline_start is not None:
                v.offline_intervals.append((v.offline_start, t))
                v.offline_start = None
            debug(f"Validator {vid} recovered", t)
            schedule_next_fail(v, t)

        elif etype == "block_attempt":
            if t != next_block_time:
                continue
            included = [v for v in validators if v.included]
            if not included:
                debug("No validators included, stopping simulation", t)
                break
            included.sort(key=lambda v: v.id)
            proposer = included[proposer_index % len(included)]
            if consensus_quorum_met(validators) and proposer.state == "online":
                # record block
                block_timestamps.append(t)
                if not no_blocks:
                    block_out_f.write(f"{sim_id};{t};{proposer.id}\n")
                debug(f"[Sim {sim_id}] Bloco proposto por {proposer.id}", t)
                proposer.last_proposal_time = t
                proposals_count[proposer.id] += 1
                consecutive_failure_count = 0
                next_block_time = t + block_time

                # Registra que validador fez uma proposta no período de ajuste
                if not proposer_register_failed(validators, adjust_procedure_call_failure_probability):
                    proposer.proposed_blocks_in_adjust_period = True
                    adjust_procedure_blocks_count += 1
                    debug(f"[Sim {sim_id}] Bloco numero {adjust_procedure_blocks_count} no periodo de ajuste", t)
                    if adjust_procedure_interval_in_blocks > 0 and adjust_procedure_blocks_count >= adjust_procedure_interval_in_blocks:
                        adjust_procedure(validators, t)
                        adjust_procedure_blocks_count = 0  # zera apenas quando roda o ajuste
                else:
                    debug(f"[Sim {sim_id}] Bloco sem transacao para registro de bloco proposto por proponente", t)
            else:
                consecutive_failure_count += 1
                penalty = (2 ** (consecutive_failure_count - 1)) * request_timeout
                next_block_time = t + penalty
                debug(
                    f"[Sim {sim_id}] No block produced (consecutive failures: {consecutive_failure_count})",
                    t,
                )
            proposer_index = (proposer_index + 1) % len(included)
            schedule(events, int(next_block_time), "block_attempt", None)

        elif etype == "meeting_reset":
            debug(f"[Sim {sim_id}] Reuniao de RESET", t)
            if network_stopped_producing_blocks(validators, consecutive_failure_count, t):
                calculate_operators_presence(validators, t)
                if reset_quorum_met(validators, t):
                    debug(f"[Sim {sim_id}] Resetando produção de blocos", t)
                    consecutive_failure_count = 0
                    next_block_time = t + block_time
                    schedule(events, int(next_block_time), "block_attempt", None)
                else:
                    debug(f"[Sim {sim_id}] Não foi possível resetar produção de blocos", t)
            else:
                debug(f"[Sim {sim_id}] Produção de blocos parece normal. Não é necessário resetar", t)
            schedule(events, t + reset_meeting_interval_seconds, "meeting_reset", None)

        elif etype == "meeting_adjust":
            debug(f"[Sim {sim_id}] Reuniao de AJUSTE", t)
            calculate_operators_presence(validators, t)
            if not network_stopped_producing_blocks(validators, consecutive_failure_count, t) and adjust_quorum_met(validators):
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
                        debug(f"[Sim {sim_id}] Excluindo validador {v.id}", t)
                    for v in to_include:
                        v.included = True
                        debug(f"[Sim {sim_id}] Incluindo validador {v.id}", t)
                else:
                    debug(f"[Sim {sim_id}] Houve quorum, mas não houve alteração de validadores", t)
            else:
                if network_stopped_producing_blocks(validators, consecutive_failure_count, t):
                    debug(f"[Sim {sim_id}] Não houve ajuste de validadores. A rede está parada", t)
                else:
                    debug(f"[Sim {sim_id}] Não houve ajuste de validadores. Falta quorum", t)
            schedule(events, t + reset_meeting_interval_seconds, "meeting_adjust", None)

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
    "reset_meeting_p_operator_absence",
    "T_fails_short_days",
    "T_fails_long_days",
    "mean_short_offline_minutes",
    "mean_long_offline_hours",
    "simulation_duration_days",
    "num_validators",
    "reset_meeting_interval_in_hours",
    "adjust_procedure_interval_in_blocks",
    "adjust_procedure_call_failure_probability",
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
print(f"Per-block CSV generated: '{block_output_filename}'")