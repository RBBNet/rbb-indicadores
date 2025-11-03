#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Análise mensal de intervalos entre blocos e eficiência (otimizado para arquivos grandes).

ENTRADA:
  - CSV separado por ponto-e-vírgula (;) com colunas: sim_id;timestamp;proposer_validator
  - Arquivo de configuração JSON (simulation_config.json) contendo block_time
  - Timestamps devem estar em segundos (int ou float)
  - Na maioria dos casos, há apenas um sim_id (simulação longa)

PROCESSAMENTO:
  - Streaming verdadeiro: não armazena todos os dados em memória
  - Agrupa timestamps por mês (30 dias = 2.592.000 segundos)
  - Para cada mês:
    * Calcula intervalos entre blocos consecutivos
    * Calcula percentis 99% e 99.9% dos intervalos usando algoritmo online
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
import heapq
import random
from collections import defaultdict
from typing import Dict, List, Optional
import pandas as pd

class QuantileEstimator:
    """Estimador de quantis usando reservoir sampling para economizar memória."""
    
    def __init__(self, target_quantiles: List[float], max_samples: int = 10000):
        self.target_quantiles = sorted(target_quantiles)
        self.max_samples = max_samples
        self.samples = []
        self.total_count = 0
        
    def add(self, value: float):
        self.total_count += 1
        
        if len(self.samples) < self.max_samples:
            # Ainda temos espaço, adiciona diretamente
            self.samples.append(value)
        else:
            # Usar reservoir sampling para manter amostra representativa
            # Substitui uma amostra aleatória com probabilidade max_samples/total_count
            if random.randint(1, self.total_count) <= self.max_samples:
                replace_idx = random.randint(0, self.max_samples - 1)
                self.samples[replace_idx] = value
    
    def get_quantiles(self) -> Dict[float, float]:
        if not self.samples:
            return {q: float('nan') for q in self.target_quantiles}
        
        # Ordena as amostras para calcular percentis
        sorted_samples = sorted(self.samples)
        n = len(sorted_samples)
        result = {}
        
        for q in self.target_quantiles:
            # Usa interpolação linear para percentis mais precisos
            rank = (q / 100.0) * (n - 1)
            lower_idx = int(math.floor(rank))
            upper_idx = int(math.ceil(rank))
            
            if lower_idx == upper_idx:
                result[q] = sorted_samples[lower_idx]
            else:
                # Interpolação linear
                lower_val = sorted_samples[lower_idx]
                upper_val = sorted_samples[upper_idx]
                weight = rank - lower_idx
                result[q] = lower_val + weight * (upper_val - lower_val)
                
        return result

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

class MensalData:
    """Estrutura para dados mensais otimizada para memória."""
    
    def __init__(self, max_samples: int = 10000):
        self.quantile_estimator = QuantileEstimator([99.0, 99.9], max_samples)
        self.blocos_count = 0
        self.primeiro_timestamp: Optional[float] = None
        self.ultimo_timestamp: Optional[float] = None
        
    def add_bloco(self, timestamp: float):
        self.blocos_count += 1
        if self.primeiro_timestamp is None:
            self.primeiro_timestamp = timestamp
        self.ultimo_timestamp = timestamp
        
    def add_intervalo(self, intervalo: float):
        self.quantile_estimator.add(intervalo)
        
    def get_metrics(self, block_time: float) -> Dict[str, float]:
        # Calcular tempo total e eficiência
        if self.primeiro_timestamp is not None and self.ultimo_timestamp is not None:
            tempo_total = self.ultimo_timestamp - self.primeiro_timestamp
        else:
            tempo_total = block_time
            
        blocos_ideais = tempo_total / block_time if block_time > 0 and tempo_total > 0 else self.blocos_count
        eficiencia = (self.blocos_count / blocos_ideais * 100) if blocos_ideais > 0 else 100
        
        # Obter quantis
        quantiles = self.quantile_estimator.get_quantiles()
        
        return {
            'percentil99': quantiles[99.0],
            'percentil99_9': quantiles[99.9],
            'eficiencia': eficiencia,
            'blocos_produzidos': self.blocos_count,
            'blocos_ideais': blocos_ideais,
            'intervalos_count': self.quantile_estimator.total_count
        }

def processar_dados_streaming(csv_path: str, block_time: float, chunksize: int = 100_000, max_samples: int = 10000) -> Dict[int, Dict]:
    """
    Processa o CSV em modo streaming para economizar memória.
    """
    SEGUNDOS_POR_MES = 30 * 24 * 3600  # 30 dias
    
    last_ts_por_sim = {}
    dados_por_mes: Dict[int, MensalData] = defaultdict(lambda: MensalData(max_samples))
    
    usecols = ['sim_id', 'timestamp']
    dtypes = {'sim_id': str, 'timestamp': float}
    
    print(f"Processando arquivo: {csv_path}")
    print(f"Chunk size: {chunksize:,}")
    print(f"Max samples por mês: {max_samples:,}")
    
    chunks_processados = 0
    linhas_processadas = 0
    
    try:
        for chunk in pd.read_csv(csv_path, sep=';', usecols=usecols, dtype=dtypes, chunksize=chunksize):
            chunks_processados += 1
            chunk_size = len(chunk)
            linhas_processadas += chunk_size
            
            if chunks_processados % 10 == 0:
                print(f"  Processados {chunks_processados} chunks, {linhas_processadas:,} linhas")
            
            for sim_id, ts in zip(chunk['sim_id'].values, chunk['timestamp'].values):
                # Determinar mês
                mes_id = int(ts // SEGUNDOS_POR_MES) + 1
                dados_por_mes[mes_id].add_bloco(ts)
                
                # Calcular intervalo se não for o primeiro timestamp deste sim_id
                prev = last_ts_por_sim.get(sim_id)
                if prev is not None:
                    intervalo = ts - prev
                    if intervalo < 0:
                        print(f'Aviso: Timestamp fora de ordem para sim_id={sim_id}, intervalo={intervalo}')
                        continue
                    
                    # Adicionar intervalo ao mês do timestamp atual
                    dados_por_mes[mes_id].add_intervalo(intervalo)
                
                last_ts_por_sim[sim_id] = ts
                
    except Exception as e:
        print(f'Erro ao processar CSV: {e}', file=sys.stderr)
        sys.exit(1)
    
    print(f"\nProcessamento concluído: {linhas_processadas:,} linhas em {chunks_processados} chunks")
    
    # Converter para formato final
    resultado = {}
    for mes_id, dados in dados_por_mes.items():
        metrics = dados.get_metrics(block_time)
        resultado[mes_id] = metrics
        
        print(f"Mês {mes_id}: {metrics['blocos_produzidos']:,} blocos, "
              f"{metrics['intervalos_count']:,} intervalos, "
              f"eficiência: {metrics['eficiencia']:.2f}%")
    
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
        description='Análise mensal de intervalos entre blocos e eficiência (otimizado para arquivos grandes).'
    )
    parser.add_argument('arquivo', help='Arquivo CSV de entrada (sim_id;timestamp;proposer_validator)')
    parser.add_argument('--config', default='simulation_config.json', 
                        help='Arquivo de configuração JSON (default: simulation_config.json)')
    parser.add_argument('--output', default='analise_mensal.csv',
                        help='Arquivo CSV de saída (default: analise_mensal.csv)')
    parser.add_argument('--chunksize', type=int, default=100_000,
                        help='Tamanho do chunk para leitura (default: 100k, diminua se der OOM)')
    parser.add_argument('--max-samples', type=int, default=10_000,
                        help='Máximo de amostras por mês para estimativa de percentis (default: 10k)')
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
        print(f"Max samples por mês: {args.max_samples:,}")
    
    # Processar dados
    dados = processar_dados_streaming(args.arquivo, block_time, args.chunksize, args.max_samples)
    
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
            print(f"  Mês {mes_id}: {row['blocos_produzidos']:,} blocos, "
                  f"eficiência {row['eficiencia']:.2f}%, "
                  f"P99: {row['percentil99']:.2f}, "
                  f"P99.9: {row['percentil99_9']:.2f}")

if __name__ == '__main__':
    main()
