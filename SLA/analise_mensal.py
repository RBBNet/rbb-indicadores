#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Análise mensal de intervalos entre blocos e eficiência.

ENTRADA:
  - CSV separado por ponto-e-vírgula (;) com colunas: sim_id;timestamp;proposer_validator
  - Arquivo de configuração JSON (simulation_config.json) contendo block_time
  - Timestamps devem estar em segundos (int ou float)
  - Na maioria dos casos, há apenas um sim_id (simulação longa)

PROCESSAMENTO:
  - Agrupa timestamps por mês (30 dias = 2.592.000 segundos)
  - Para cada mês:
    * Calcula intervalos entre blocos consecutivos
    * Calcula percentis 99% e 99.9% dos intervalos
    * Calcula eficiência: blocos_produzidos / blocos_ideais * 100
    * blocos_ideais = tempo_do_mes / block_time

SAÍDA:
  - CSV separado por vírgula (,) com colunas: mes_id,percentil99,percentil99_9,eficiencia
  - mes_id: número do mês (1, 2, 3, ...)
  - percentil99: valor do percentil 99% dos intervalos do mês
  - percentil99_9: valor do percentil 99.9% dos intervalos do mês
  - eficiencia: percentual de eficiência do mês

EXEMPLO DE USO:
  python analise_mensal.py dados.csv --config simulation_config.json --output resultado.csv
"""

import argparse
import json
import sys
import math
import csv
from collections import defaultdict
from typing import Dict, List, Tuple
import pandas as pd

def load_config(config_path: str) -> dict:
    """Carrega configuração do JSON."""
    try:
        with open(config_path, 'r', encoding='utf-8') as f:
            return json.load(f)
    except FileNotFoundError:
        print(f'Erro: Arquivo de configuração não encontrado: {config_path}', file=sys.stderr)
        sys.exit(1)
    except json.JSONDecodeError as e:
        print(f'Erro: JSON inválido em {config_path}: {e}', file=sys.stderr)
        sys.exit(1)

def calcular_percentil(valores: List[float], percentil: float) -> float:
    """Calcula percentil de uma lista de valores."""
    if not valores:
        return float('nan')
    
    valores_ordenados = sorted(valores)
    n = len(valores_ordenados)
    
    # Usa definição: k = ceil(p/100 * n) - 1
    k = math.ceil((percentil / 100.0) * n) - 1
    if k < 0:
        k = 0
    if k >= n:
        k = n - 1
    
    return valores_ordenados[k]

def processar_dados(csv_path: str, block_time: float, chunksize: int = 500_000) -> Dict[int, Dict]:
    """
    Processa o CSV e organiza dados por mês.
    
    Returns:
        Dict[mes_id, {'intervalos': List[float], 'blocos_produzidos': int, 'tempo_total': float}]
    """
    SEGUNDOS_POR_MES = 30 * 24 * 3600  # 30 dias
    
    last_ts_por_sim = {}
    dados_por_mes = defaultdict(lambda: {'intervalos': [], 'timestamps': []})
    
    usecols = ['sim_id', 'timestamp']
    dtypes = {'sim_id': str, 'timestamp': float}
    
    print(f"Processando arquivo: {csv_path}")
    
    try:
        for chunk in pd.read_csv(csv_path, sep=';', usecols=usecols, dtype=dtypes, chunksize=chunksize):
            for sim_id, ts in zip(chunk['sim_id'].values, chunk['timestamp'].values):
                # Determinar mês (baseado em períodos de 30 dias)
                mes_id = int(ts // SEGUNDOS_POR_MES) + 1
                dados_por_mes[mes_id]['timestamps'].append(ts)
                
                # Calcular intervalo se não for o primeiro timestamp deste sim_id
                prev = last_ts_por_sim.get(sim_id)
                if prev is not None:
                    intervalo = ts - prev
                    if intervalo < 0:
                        print(f'Aviso: Timestamp fora de ordem para sim_id={sim_id}, intervalo={intervalo}')
                        continue
                    
                    # Atribuir intervalo ao mês do timestamp atual
                    dados_por_mes[mes_id]['intervalos'].append(intervalo)
                
                last_ts_por_sim[sim_id] = ts
                
    except Exception as e:
        print(f'Erro ao processar CSV: {e}', file=sys.stderr)
        sys.exit(1)
    
    # Calcular métricas para cada mês
    resultado = {}
    for mes_id, dados in dados_por_mes.items():
        timestamps = sorted(dados['timestamps'])
        intervalos = dados['intervalos']
        
        if not timestamps:
            continue
            
        # Calcular tempo total real baseado nos timestamps do mês
        blocos_produzidos = len(timestamps)
        
        if len(timestamps) > 1:
            # Usar o tempo real entre primeiro e último bloco do mês
            tempo_total = timestamps[-1] - timestamps[0]
        else:
            # Se só há um bloco, assumir que representa o block_time
            tempo_total = block_time
        
        # Blocos ideais = tempo_total / block_time (quantos blocos caberiam nesse tempo)
        blocos_ideais = tempo_total / block_time if block_time > 0 and tempo_total > 0 else blocos_produzidos
        eficiencia = (blocos_produzidos / blocos_ideais * 100) if blocos_ideais > 0 else 100
        
        # Calcular percentis
        p99 = calcular_percentil(intervalos, 99.0) if intervalos else float('nan')
        p99_9 = calcular_percentil(intervalos, 99.9) if intervalos else float('nan')
        
        resultado[mes_id] = {
            'percentil99': p99,
            'percentil99_9': p99_9,
            'eficiencia': eficiencia,
            'blocos_produzidos': blocos_produzidos,
            'blocos_ideais': blocos_ideais,
            'intervalos_count': len(intervalos)
        }
        
        print(f"Mês {mes_id}: {blocos_produzidos} blocos, {len(intervalos)} intervalos, eficiência: {eficiencia:.2f}%")
    
    return resultado

def escrever_resultado(dados: Dict[int, Dict], output_path: str):
    """Escreve o resultado em CSV."""
    with open(output_path, 'w', newline='', encoding='utf-8') as f:
        writer = csv.writer(f)
        writer.writerow(['mes_id', 'percentil99', 'percentil99_9', 'eficiencia'])
        
        for mes_id in sorted(dados.keys()):
            row = dados[mes_id]
            writer.writerow([
                mes_id,
                f"{row['percentil99']:.6f}" if not math.isnan(row['percentil99']) else 'NaN',
                f"{row['percentil99_9']:.6f}" if not math.isnan(row['percentil99_9']) else 'NaN',
                f"{row['eficiencia']:.6f}"
            ])

def main():
    parser = argparse.ArgumentParser(
        description='Análise mensal de intervalos entre blocos e eficiência.'
    )
    parser.add_argument('arquivo', help='Arquivo CSV de entrada (sim_id;timestamp;proposer_validator)')
    parser.add_argument('--config', default='simulation_config.json', 
                        help='Arquivo de configuração JSON (default: simulation_config.json)')
    parser.add_argument('--output', default='analise_mensal.csv',
                        help='Arquivo CSV de saída (default: analise_mensal.csv)')
    parser.add_argument('--chunksize', type=int, default=500_000,
                        help='Tamanho do chunk para leitura (default: 500k)')
    parser.add_argument('--verbose', action='store_true',
                        help='Mostrar informações detalhadas')
    
    args = parser.parse_args()
    
    # Carregar configuração
    config = load_config(args.config)
    block_time = float(config.get('block_time', 5))  # default 5 segundos
    
    if args.verbose:
        print(f"Block time configurado: {block_time} segundos")
        print(f"Arquivo de entrada: {args.arquivo}")
        print(f"Arquivo de saída: {args.output}")
    
    # Processar dados
    dados = processar_dados(args.arquivo, block_time, args.chunksize)
    
    if not dados:
        print("Nenhum dado foi processado. Verifique o arquivo de entrada.")
        sys.exit(1)
    
    # Escrever resultado
    escrever_resultado(dados, args.output)
    
    print(f"\nAnálise concluída!")
    print(f"Resultado salvo em: {args.output}")
    print(f"Total de meses analisados: {len(dados)}")
    
    if args.verbose:
        print("\nResumo por mês:")
        for mes_id in sorted(dados.keys()):
            row = dados[mes_id]
            print(f"  Mês {mes_id}: {row['blocos_produzidos']} blocos, "
                  f"eficiência {row['eficiencia']:.2f}%, "
                  f"P99: {row['percentil99']:.2f}, "
                  f"P99.9: {row['percentil99_9']:.2f}")

if __name__ == '__main__':
    main()
