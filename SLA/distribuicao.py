#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Simulador de distribuição de falhas para UM único validador.

Lê parâmetros em simulation_config.json (mesmos nomes usados em simulacao6.py):
  - num_simulations                (int) Número de execuções independentes
  - simulation_duration_days       (int) Duração padrão (em dias) SE --hours não for usado
  - T_fails_short_days             (float) Tempo médio entre falhas curtas (dias)
  - T_fails_long_days              (float) Tempo médio entre falhas longas (dias)
  - mean_short_offline_minutes     (float) Média de duração de falha curta (minutos)
  - mean_long_offline_hours        (float) Média de duração de falha longa (horas)
  - (demais campos são ignorados aqui)

Modelo de geração (mesmo padrão do código original para mistura de falhas):
  - Processo composto com taxas λ_short = 1/T_fails_short e λ_long = 1/T_fails_long.
  - λ_total = λ_short + λ_long.
  - Tempo até a próxima falha ~ Exp(λ_total).
  - Tipo da falha: curta com prob λ_short/λ_total, senão longa.
  - Duração da falha: Exp(1/mean_short_offline_time) ou Exp(1/mean_long_offline_time) (i.e. média = valor configurado).

Saída: CSV separado por ponto-e-vírgula (;) com colunas:
  sim_id;timestamp;duration
	sim_id   - inteiro iniciando em 1
	timestamp- instante (segundos) da OCORRÊNCIA da falha dentro da simulação (reinicia em 0 para cada sim)
	duration - duração (segundos) da falha (inteiro)

Observações:
  - Se a próxima falha ultrapassar a duração da simulação, é descartada.
  - Duração é truncada por padrão para não ultrapassar o final da simulação. Para não truncar, use --no-clip.
  - Duração mínima = 1s (evita zeros por médias nulas ou arredondamento).
"""

from __future__ import annotations

import argparse
import json
import math
import os
import random
import sys
from typing import List, Tuple

sys.stdout.reconfigure(encoding="utf-8")


def load_config(path: str) -> dict:
	if not os.path.exists(path):
		raise FileNotFoundError(f"Config file not found: {path}")
	with open(path, "r", encoding="utf-8") as f:
		return json.load(f)


def positive(value: str) -> float:
	v = float(value)
	if v <= 0:
		raise argparse.ArgumentTypeError("value must be > 0")
	return v


def build_arg_parser() -> argparse.ArgumentParser:
	p = argparse.ArgumentParser(description="Simula falhas de um único validador baseado em parâmetros estatísticos")
	p.add_argument("outfile", help="Arquivo CSV de saída (será sobrescrito)")
	p.add_argument("--config", default="simulation_config.json", help="Caminho do arquivo de configuração JSON")
	p.add_argument("--runs", type=int, help="Sobrescreve num_simulations do arquivo de configuração")
	p.add_argument("--hours", type=positive, help="Duração da simulação em horas (sobrepõe simulation_duration_days)")
	p.add_argument("--seed", type=int, help="Semente para RNG (reprodutibilidade)")
	# Clip ativado por padrão; permite desativar com --no-clip
	p.add_argument("--clip", action="store_true", default=True,
				   help="Trunca a duração da falha para não ultrapassar o final da simulação (padrão: ligado)")
	p.add_argument("--no-clip", dest="clip", action="store_false",
				   help="Não truncar a duração; falhas podem ultrapassar o final da simulação")
	p.add_argument("--verbose", action="store_true", help="Mostra contagem de falhas por simulação")
	return p


def simulate_one(
	sim_id: int,
	duration_seconds: int,
	lambda_short: float,
	lambda_long: float,
	mean_short: float,
	mean_long: float,
	clip: bool = False,
) -> Tuple[List[Tuple[int, int, int]], float]:
	"""Roda uma simulação retornando lista de (sim_id, timestamp, duration) e percentual de inoperância."""
	records: List[Tuple[int, int, int]] = []
	lam_total = lambda_short + lambda_long
	if lam_total <= 0:
		return records, 0.0
	t = 0.0
	total_downtime = 0.0
	while True:
		# Tempo até próxima falha
		wait = random.expovariate(lam_total)
		t += wait
		if t >= duration_seconds:
			break
		# Decide tipo
		is_short = random.random() < (lambda_short / lam_total)
		if is_short:
			dur = random.expovariate(1.0 / mean_short) if mean_short > 0 else 0.0
		else:
			dur = random.expovariate(1.0 / mean_long) if mean_long > 0 else 0.0

		# Ajusta duração (inteiro) garantindo mínimo de 1s e respeitando clip
		start_int = int(t)
		remaining = duration_seconds - start_int
		if remaining <= 0:
			break  # proteção extra

		# arredonda para cima e aplica mínimo 1s (evita zeros)
		if dur <= 0:
			dur_int = 1
		else:
			dur_int = int(math.ceil(dur))
			if dur_int < 1:
				dur_int = 1

		if clip:
			dur_int = min(dur_int, remaining)

		if dur_int <= 0:
			continue  # não emitir falha de 0s

		records.append((sim_id, start_int, dur_int))
		total_downtime += dur_int
	
	# Calcular percentual de inoperância
	percentual_inoperancia = (total_downtime / duration_seconds * 100) if duration_seconds > 0 else 0.0
	
	return records, percentual_inoperancia


def main():
	parser = build_arg_parser()
	args = parser.parse_args()

	if args.seed is not None:
		random.seed(args.seed)

	cfg = load_config(args.config)

	# Lê parâmetros (com defaults se ausentes)
	num_simulations = int(args.runs if args.runs is not None else cfg.get("num_simulations", 1))
	# Duração
	if args.hours is not None:
		duration_seconds = int(args.hours * 3600)
	else:
		duration_days = float(cfg.get("simulation_duration_days", 1))
		duration_seconds = int(duration_days * 86400)

	# Taxas de chegada das falhas
	T_short_days = float(cfg.get("T_fails_short_days", 1))
	T_long_days = float(cfg.get("T_fails_long_days", 10))
	# evitar divisão por zero
	lambda_short = 1.0 / (T_short_days * 86400) if T_short_days > 0 else 0.0
	lambda_long = 1.0 / (T_long_days * 86400) if T_long_days > 0 else 0.0

	mean_short = float(cfg.get("mean_short_offline_minutes", 5)) * 60
	mean_long = float(cfg.get("mean_long_offline_hours", 12)) * 3600

	if args.verbose:
		print("Parâmetros carregados:")
		print(f"  num_simulations = {num_simulations}")
		print(f"  duration_seconds = {duration_seconds}")
		print(f"  lambda_short = {lambda_short:.8f}  (T_short_days={T_short_days})")
		print(f"  lambda_long  = {lambda_long:.8f}  (T_long_days={T_long_days})")
		print(f"  mean_short = {mean_short} s")
		print(f"  mean_long  = {mean_long} s")
		print(f"  clip = {'on' if args.clip else 'off'}")

	all_records: List[Tuple[int, int, int]] = []
	percentuais_inoperancia: List[float] = []
	for sim_id in range(1, num_simulations + 1):
		recs, percentual = simulate_one(
			sim_id,
			duration_seconds,
			lambda_short,
			lambda_long,
			mean_short,
			mean_long,
			clip=args.clip,
		)
		all_records.extend(recs)
		percentuais_inoperancia.append(percentual)
		if args.verbose:
			print(f"Sim {sim_id}: {len(recs)} falhas, inoperância: {percentual:.2f}%")

	# Escreve CSV
	with open(args.outfile, "w", encoding="utf-8", newline="") as f:
		f.write("sim_id;timestamp;duration\n")
		for sim_id, ts, dur in all_records:
			f.write(f"{sim_id};{ts};{dur}\n")

	# Calcula percentual médio de inoperância
	percentual_medio_inoperancia = sum(percentuais_inoperancia) / len(percentuais_inoperancia) if percentuais_inoperancia else 0.0

	# Anexa parâmetros de configuração no final do mesmo CSV
	config_fields = [
		"num_simulations",
		"T_fails_short_days", 
		"T_fails_long_days",
		"mean_short_offline_minutes",
		"mean_long_offline_hours",
		"simulation_duration_days"
	]
	
	with open(args.outfile, 'a', encoding='utf-8') as f:
		f.write("\n")
		# escreve os parâmetros usados
		for key in config_fields:
			value = cfg.get(key, 'N/A')
			f.write(f"{key};{value}\n")
		# escreve estatísticas calculadas
		f.write(f"total_de_falhas;{len(all_records)}\n")
		f.write(f"percentual_medio_inoperancia;{percentual_medio_inoperancia:.6f}\n")

	print(f"Gerado arquivo: {args.outfile}")
	print(f"Total de falhas: {len(all_records)} (todas as simulações)")
	print(f"Percentual médio de inoperância: {percentual_medio_inoperancia:.2f}%")


if __name__ == "__main__":
	main()

