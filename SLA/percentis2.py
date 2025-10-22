#!/usr/bin/env python3
# -----------------------------------------------------------------------------
# percentis2.py
#
# ENTRADA:
#   - Arquivo texto (UTF-8) contendo UM valor numérico por linha (float).
#   - O arquivo DEVE estar ORDENADO em ordem crescente (pré-processado, ex: por ordena.py).
#   - Linhas em branco ou não numéricas são ignoradas.
#   - Formatos aceitos: decimal (10.5), inteiro (7), notação científica (1.2e-3). Vírgula não aceita.
#
# MODOS:
#   1) Modo padrão (default):
#        python percentis2.py arquivo.txt v1 v2 [--tol T] [--inmem]
#      - v1, v2 = valores-alvo (intervalos).
#      - Calcula percentil (ou aproximado) de cada valor:
#          * Se existir ao menos um valor igual dentro da tolerância |x - v| <= tol:
#                percentil = (posição 1-based da primeira ocorrência) / total * 100
#          * Caso contrário:
#                percentil aproximado = (qtd valores < v) / total * 100
#      - Streaming (linha a linha) por padrão com early-exit; --inmem carrega tudo e usa bisect.
#
#   2) Modo -perc:
#        python percentis2.py arquivo.txt p1 p2 -perc [--inmem]
#      - p1, p2 = percentis (0.00001 a 99.9999).
#      - Retorna valores dos quantis (usa definição k = ceil(p/100 * n) - 1).
#      - Duas implementações:
#          * Default: duas passagens (conta e depois busca).
#          * --inmem: carrega tudo em lista e indexa direto (mais rápido, usa RAM).
#
# PARÂMETROS:
#   arquivo   : caminho do arquivo ordenado.
#   valor1/valor2 : valores-alvo (modo padrão) ou percentis (modo -perc).
#   --tol     : tolerância absoluta para igualdade (default 0.0).
#   --casas   : casas decimais para impressão de percentuais (default 4).
#   --inmem   : força modo em memória.
#   -perc     : ativa modo de quantis (interpreta valor1/valor2 como percentuais).
#
# SAÍDA:
#   - Sempre em stdout, texto simples.
#   - Modo padrão:
#       Total de intervalos: N
#       Valor v1 => (percentil|percentil aproximado): P%
#       Valor v2 => ...
#   - Modo -perc:
#       Total de intervalos: N
#       Percentil P1% => valor: X
#       Percentil P2% => valor: Y
#
# NOTAS:
#   - total = número de valores válidos após ignorar linhas vazias/inválidas.
#   - Se total = 0, mensagem e saída limpa.
#   - Em streaming, a contagem para cada alvo é independente (não supõe valores distintos).
#   - Early-exit no streaming: para alvos v1,v2 e tolerância tol, ao ultrapassar max(v1,v2)+tol
#     não surgem novas igualdades e pode parar.
# -----------------------------------------------------------------------------
import argparse
import sys
import math
import bisect

def format_percent(p: float, casas: int):
    if math.isnan(p):
        return 'N/A'
    return f'{p:.{casas}f}'.rstrip('0').rstrip('.')

def calcular_percentil(count_lt: int, count_eq: int, total: int):
    if total == 0:
        return math.nan, False
    if count_eq > 0:
        pos = count_lt + 1
        return (pos / total) * 100.0, True
    else:
        return (count_lt / total) * 100.0, False

def indice_quantil(n: int, p: float):
    k = math.ceil((p / 100.0) * n) - 1
    if k < 0:
        k = 0
    if k >= n:
        k = n - 1
    return k

def ler_valor(linha: str):
    linha = linha.strip()
    if not linha:
        return None
    try:
        return float(linha)
    except ValueError:
        return None

def modo_intervalos_stream(arquivo: str, v1: float, v2: float, tol: float):
    # Leitura sequencial com early-exit (arquivo ordenado crescente)
    lt1 = eq1 = 0
    lt2 = eq2 = 0
    total = 0

    max_target = v1 if v1 >= v2 else v2
    limit_break = max_target + tol  # após ultrapassar isso nenhuma igualdade possível

    with open(arquivo, 'r', encoding='utf-8') as f:
        append = False
        for linha in f:
            val = ler_valor(linha)
            if val is None:
                continue
            total += 1

            # Atualiza contagens para v1
            if val < v1:
                lt1 += 1
            elif abs(val - v1) <= tol:
                eq1 += 1
            # Atualiza contagens para v2
            if val < v2:
                lt2 += 1
            elif abs(val - v2) <= tol:
                eq2 += 1

            # Early-exit: já passamos de ambos (sem chance de novos ==)
            if val > limit_break:
                break

    p1, found1 = calcular_percentil(lt1, eq1, total)
    p2, found2 = calcular_percentil(lt2, eq2, total)
    return total, (p1, found1), (p2, found2)

def modo_intervalos_inmem(arquivo: str, v1: float, v2: float, tol: float):
    # Carrega tudo (arquivo já ordenado) e usa bisect
    vals = []
    with open(arquivo, 'r', encoding='utf-8') as f:
        append = vals.append
        for linha in f:
            v = ler_valor(linha)
            if v is not None:
                append(v)
    n = len(vals)
    if n == 0:
        return 0, (math.nan, False), (math.nan, False)

    # Para igualdade com tolerância, localizamos faixa [v - tol, v + tol]
    def stats_para(valor: float):
        left = bisect.bisect_left(vals, valor - tol)
        right = bisect.bisect_right(vals, valor + tol)
        # elementos < valor considerando tolerância estrita (< valor - tol)
        lt = bisect.bisect_left(vals, valor - tol)
        eq = max(0, right - left)
        return calcular_percentil(lt, eq, n)

    p1 = stats_para(v1)
    p2 = stats_para(v2)
    return n, p1, p2

def modo_percentis_duas_passagens(arquivo: str, p1: float, p2: float):
    # Passagem 1: contar
    n = 0
    with open(arquivo, 'r', encoding='utf-8') as f:
        for linha in f:
            if ler_valor(linha) is not None:
                n += 1
    if n == 0:
        return 0, math.nan, math.nan
    k1 = indice_quantil(n, p1)
    k2 = indice_quantil(n, p2)
    kmax = k1 if k1 >= k2 else k2

    # Passagem 2: pegar valores
    v1 = v2 = math.nan
    idx = 0
    with open(arquivo, 'r', encoding='utf-8') as f:
        for linha in f:
            val = ler_valor(linha)
            if val is None:
                continue
            if idx == k1:
                v1 = val
            if idx == k2:
                v2 = val
            if idx >= kmax:
                break
            idx += 1
    return n, v1, v2

def modo_percentis_inmem(arquivo: str, p1: float, p2: float):
    vals = []
    with open(arquivo, 'r', encoding='utf-8') as f:
        append = vals.append
        for linha in f:
            v = ler_valor(linha)
            if v is not None:
                append(v)
    n = len(vals)
    if n == 0:
        return 0, math.nan, math.nan
    k1 = indice_quantil(n, p1)
    k2 = indice_quantil(n, p2)
    return n, vals[k1], vals[k2]

def main():
    parser = argparse.ArgumentParser(
        description='Processa arquivo de intervalos ORDENADOS. '
                    'Modo padrão: valores -> percentis. Modo -perc: percentis -> valores.'
    )
    parser.add_argument('arquivo', help='Arquivo de entrada (um float por linha, crescente).')
    parser.add_argument('valor1', type=float, help='Valor alvo 1 (ou percentil 1 em -perc).')
    parser.add_argument('valor2', type=float, help='Valor alvo 2 (ou percentil 2 em -perc).')
    parser.add_argument('--tol', type=float, default=0.0, help='Tolerância para igualdade.')
    parser.add_argument('--casas', type=int, default=4, help='Casas decimais para percentuais.')
    parser.add_argument('-perc', action='store_true', help='Interpreta valor1/valor2 como percentis.')
    parser.add_argument('--inmem', action='store_true', help='Força processamento em memória.')
    args = parser.parse_args()

    if args.perc:
        for pv in (args.valor1, args.valor2):
            if not (0.00001 <= pv <= 99.9999):
                print(f'Percentil inválido {pv}. Use entre 0.00001 e 99.9999.', file=sys.stderr)
                sys.exit(2)
        try:
            if args.inmem:
                total, q1, q2 = modo_percentis_inmem(args.arquivo, args.valor1, args.valor2)
            else:
                total, q1, q2 = modo_percentis_duas_passagens(args.arquivo, args.valor1, args.valor2)
        except FileNotFoundError:
            print(f'Arquivo não encontrado: {args.arquivo}', file=sys.stderr)
            sys.exit(2)
        except Exception as e:
            print(f'Erro ao processar: {e}', file=sys.stderr)
            sys.exit(1)

        if total == 0:
            print('Nenhum intervalo disponível.')
            sys.exit(0)

        print(f'Total de intervalos: {total}')
        print(f'Percentil {format_percent(args.valor1, args.casas)}% => valor: {q1}')
        print(f'Percentil {format_percent(args.valor2, args.casas)}% => valor: {q2}')
        sys.exit(0)

    try:
        if args.inmem:
            total, r1, r2 = modo_intervalos_inmem(args.arquivo, args.valor1, args.valor2, args.tol)
        else:
            total, r1, r2 = modo_intervalos_stream(args.arquivo, args.valor1, args.valor2, args.tol)
    except FileNotFoundError:
        print(f'Arquivo não encontrado: {args.arquivo}', file=sys.stderr)
        sys.exit(2)
    except Exception as e:
        print(f'Erro ao processar: {e}', file=sys.stderr)
        sys.exit(1)

    if total == 0:
        print('Nenhum intervalo disponível.')
        sys.exit(0)

    p1, found1 = r1
    p2, found2 = r2

    print(f'Total de intervalos: {total}')
    print(f'Valor {args.valor1} => {"percentil" if found1 else "percentil aproximado"}: {format_percent(p1, args.casas)}%')
    print(f'Valor {args.valor2} => {"percentil" if found2 else "percentil aproximado"}: {format_percent(p2, args.casas)}%')

if __name__ == '__main__':
    main()