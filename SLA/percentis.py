import argparse
import sys
import math
import pandas as pd

def calcular_percentis_stream(caminho_csv: str, v1: float, v2: float, v3: float,
                              chunksize: int = 500_000, tol: float = 0.0):
    """
    Modo padrão:
    Lê o CSV (sep=';') em chunks.
    Assume timestamps numéricos em segundos e já em ordem dentro de cada sim_id.
    Calcula intervalos on-the-fly e conta quantos são < ou == (com tolerância) a cada valor alvo (3 valores).
    Não armazena nem ordena todos os intervalos.
    """
    def eq(a, b):
        return abs(a - b) <= tol

    last_ts_por_sim = {}
    total = 0

    lt1 = eq1 = 0
    lt2 = eq2 = 0
    lt3 = eq3 = 0

    usecols = ['sim_id', 'timestamp']
    dtypes = {'sim_id': str, 'timestamp': float}

    for chunk in pd.read_csv(caminho_csv, sep=';', usecols=usecols, dtype=dtypes, chunksize=chunksize):
        for sim_id, ts in zip(chunk['sim_id'].values, chunk['timestamp'].values):
            prev = last_ts_por_sim.get(sim_id)
            if prev is None:
                last_ts_por_sim[sim_id] = ts
                continue
            intervalo = ts - prev
            last_ts_por_sim[sim_id] = ts
            if intervalo < 0:
                print(f'Anomalia detectada: sim_id={sim_id}, intervalo={intervalo}')
                sys.exit(1)

            total += 1

            # v1
            if intervalo < v1:
                lt1 += 1
            elif eq(intervalo, v1):
                eq1 += 1
            # v2
            if intervalo < v2:
                lt2 += 1
            elif eq(intervalo, v2):
                eq2 += 1
            # v3
            if intervalo < v3:
                lt3 += 1
            elif eq(intervalo, v3):
                eq3 += 1

    return {
        'total': total,
        'v1': {'lt': lt1, 'eq': eq1},
        'v2': {'lt': lt2, 'eq': eq2},
        'v3': {'lt': lt3, 'eq': eq3},
    }

def extrair_intervalos_stream(caminho_csv: str, chunksize: int = 500_000):
    """
    Modo -perc:
    Extrai todos os intervalos para cálculo exato de quantis (consome memória).
    """
    last_ts_por_sim = {}
    intervalos = []

    usecols = ['sim_id', 'timestamp']
    dtypes = {'sim_id': str, 'timestamp': float}

    for chunk in pd.read_csv(caminho_csv, sep=';', usecols=usecols, dtype=dtypes, chunksize=chunksize):
        for sim_id, ts in zip(chunk['sim_id'].values, chunk['timestamp'].values):
            prev = last_ts_por_sim.get(sim_id)
            if prev is None:
                last_ts_por_sim[sim_id] = ts
                continue
            intervalo = ts - prev
            last_ts_por_sim[sim_id] = ts
            if intervalo < 0:
                print(f'Anomalia detectada: sim_id={sim_id}, intervalo={intervalo}')
                sys.exit(1)
            intervalos.append(intervalo)
    return intervalos

def calcular_percentil(count_lt: int, count_eq: int, total: int):
    if total == 0:
        return math.nan, False
    if count_eq > 0:
        pos = count_lt + 1
        return (pos / total) * 100.0, True
    else:
        return (count_lt / total) * 100.0, False

def valor_percentil_ordenado(intervalos, p):
    """
    Retorna o valor q tal que (aprox) p% dos valores são < q.
    Definição: índice k = ceil(p/100 * n) - 1 dentro do array ordenado.
    """
    n = len(intervalos)
    if n == 0:
        return math.nan
    if p <= 0 or p >= 100:
        return math.nan
    k = math.ceil((p / 100.0) * n) - 1
    if k < 0:
        k = 0
    if k >= n:
        k = n - 1
    return intervalos[k]

def format_percent(p: float, casas: int):
    if math.isnan(p):
        return 'N/A'
    return f'{p:.{casas}f}'.rstrip('0').rstrip('.')

def main():
    parser = argparse.ArgumentParser(
        description='Modo padrão: dados três valores de intervalo, calcula o percentil (primeira ocorrência) de cada sem ordenar tudo. '
                    'Modo -perc: dados três percentuais (0.00001–99.9999), calcula os valores dos quantis.'
    )
    parser.add_argument('arquivo', help='Arquivo CSV ; com colunas: sim_id;timestamp;proposer_validator')
    parser.add_argument('valor1', type=float, help='Modo padrão: intervalo alvo 1. Modo -perc: percentil 1 (ex: 95).')
    parser.add_argument('valor2', type=float, help='Modo padrão: intervalo alvo 2. Modo -perc: percentil 2 (ex: 99).')
    parser.add_argument('valor3', type=float, help='Modo padrão: intervalo alvo 3. Modo -perc: percentil 3 (ex: 99.9).')
    parser.add_argument('--chunksize', type=int, default=500_000, help='Tamanho do chunk de leitura (default 500k).')
    parser.add_argument('--tol', type=float, default=0.0, help='Tolerância para comparação de floats (default 0).')
    parser.add_argument('--casas', type=int, default=4, help='Casas decimais na saída (default 4).')
    parser.add_argument('-perc', action='store_true',
                        help='Interpreta valor1..valor3 como percentuais e calcula os respectivos quantis (carrega intervalos em memória).')
    args = parser.parse_args()

    if args.perc:
        for pv in (args.valor1, args.valor2, args.valor3):
            if not (0.00001 <= pv <= 99.9999):
                print(f'Percentil inválido {pv}. Use entre 0.00001 e 99.9999 (exclusivo de 0 e 100).', file=sys.stderr)
                sys.exit(2)
        try:
            intervalos = extrair_intervalos_stream(args.arquivo, chunksize=args.chunksize)
        except Exception as e:
            print(f'Erro ao processar: {e}', file=sys.stderr)
            sys.exit(1)

        total = len(intervalos)
        if total == 0:
            print('Nenhum intervalo calculado (talvez cada sim_id tenha só um timestamp).')
            sys.exit(0)

        intervalos.sort()
        q1 = valor_percentil_ordenado(intervalos, args.valor1)
        q2 = valor_percentil_ordenado(intervalos, args.valor2)
        q3 = valor_percentil_ordenado(intervalos, args.valor3)

        print(f'Total de intervalos: {total}')
        print(f'Percentil {format_percent(args.valor1, args.casas)}% => valor: {q1}')
        print(f'Percentil {format_percent(args.valor2, args.casas)}% => valor: {q2}')
        print(f'Percentil {format_percent(args.valor3, args.casas)}% => valor: {q3}')
        sys.exit(0)

    # Modo padrão
    try:
        stats = calcular_percentis_stream(
            args.arquivo,
            args.valor1,
            args.valor2,
            args.valor3,
            chunksize=args.chunksize,
            tol=args.tol
        )
    except Exception as e:
        print(f'Erro ao processar: {e}', file=sys.stderr)
        sys.exit(1)

    total = stats['total']
    if total == 0:
        print('Nenhum intervalo calculado (talvez cada sim_id tenha só um timestamp).')
        sys.exit(0)

    p1, found1 = calcular_percentil(stats['v1']['lt'], stats['v1']['eq'], total)
    p2, found2 = calcular_percentil(stats['v2']['lt'], stats['v2']['eq'], total)
    p3, found3 = calcular_percentil(stats['v3']['lt'], stats['v3']['eq'], total)

    print(f'Total de intervalos: {total}')
    print(f'Valor {args.valor1} => {"percentil" if found1 else "percentil aproximado"}: {format_percent(p1, args.casas)}%')
    print(f'Valor {args.valor2} => {"percentil" if found2 else "percentil aproximado"}: {format_percent(p2, args.casas)}%')
    print(f'Valor {args.valor3} => {"percentil" if found3 else "percentil aproximado"}: {format_percent(p3, args.casas)}%')

if __name__ == '__main__':
    main()