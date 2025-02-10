import math
import random
import numpy as np
from dotenv import load_dotenv
import os
import argparse


# ---------------------------------------------------------------------
# 1. Validador (Online/Offline)
# ---------------------------------------------------------------------
def validador_esta_online(prob_falha, media, desvio_padrao):
    """
    Decide se o validador está online.
    Se falhar, gera o tempo de queda (em segundos) com base numa distribuição normal.
    """
    if random.random() < prob_falha:
        rng = np.random.default_rng()
        # Gera tempo de falha em horas, converte para segundos
        tempo_falha = abs(rng.normal(media, desvio_padrao))
        return False, int(tempo_falha * 3600)
    else:
        return True, 0


# ---------------------------------------------------------------------
# 2. Reuniões de Validadores
# ---------------------------------------------------------------------
def reuniao(prob_comparecimento):
    """Define se o dono do validador comparece à reunião."""
    return random.random() < prob_comparecimento


def verificar_11h(sim_time):
    """
    Retorna True se o horário simulado for exatamente 11:00:00.
    Um dia tem 86400 segundos.
    """
    segundos_dia = 86400
    hora = (sim_time % segundos_dia) // 3600
    minuto = ((sim_time % segundos_dia) % 3600) // 60
    segundo = ((sim_time % segundos_dia) % 3600) % 60
    return (hora == 11) and (minuto == 0) and (segundo == 0)


def ja_passou_das_11(sim_time):
    """
    Retorna True se já passaram as 11 horas no dia da simulação.
    """
    segundos_dia = 86400
    hora = (sim_time % segundos_dia) // 3600
    return hora >= 11


# ---------------------------------------------------------------------
# 3. Atualização do Estado dos Validadores
# ---------------------------------------------------------------------
def atualizar_estado_validadores(validadores, prob_falha, media, desvio_padrao, delta_t):
    """
    Atualiza o estado de cada validador:
      - Se offline, decrementa seu tempo de falha (delta_t segundos);
        se o tempo de falha chega a zero, o validador volta a ficar online.
      - Se online, sorteia se ele falha agora e, se sim, define seu tempo de queda.
    Retorna o número de validadores online.
    """
    online_count = 0
    for v in validadores:
        if not v["online"]:
            v["time_failure"] -= delta_t
            if v["time_failure"] <= 0:
                v["online"] = True
                v["time_failure"] = 0
        else:
            online, tempo_falha = validador_esta_online(prob_falha, media, desvio_padrao)
            v["online"] = online
            v["time_failure"] = tempo_falha if not online else 0

        if v["online"]:
            online_count += 1
    return online_count


# ---------------------------------------------------------------------
# 4. Remoção e Readição de Validadores
# ---------------------------------------------------------------------
def remover_validador_offline(validadores, removed_validators, sim_time, eventos, debug):
    """
    Durante a reunião, remove (apenas um) validador offline e o move para a lista de removidos.
    """
    for i, v in enumerate(validadores):
        if not v["online"]:
            if debug:
                print(f"[{format_time(sim_time)}] Removendo validador {v['id']} (offline).")

            eventos.append(f"[{format_time(sim_time)}] Removendo validador {v['id']} (offline).")

            removed_validators.append(v)

            del validadores[i]
            break


def adicionar_validador_online(validadores, removed_validators, sim_time, eventos, debug):
    """
    Durante a reunião, se um validador removido já estiver online, ele é re-adicionado à rede.
    """

    for v in removed_validators:
        if v["online"]:
            if debug:
                print(f"[{format_time(sim_time)}] Re-adicionando validador {v['id']} (online).")
            eventos.append(f"[{format_time(sim_time)}] Re-adicionando validador {v['id']} (online).")
            validadores.append(v)
            removed_validators.remove(v)


# ---------------------------------------------------------------------
# 5. Reinício da Rede
# ---------------------------------------------------------------------
def reiniciar_rede(validadores, sim_time):
    """
    Reinicia a rede: todos os validadores passam a estar online e o tempo de queda é resetado.
    """
    for v in validadores:
        v["online"] = True
        v["time_failure"] = 0


# ---------------------------------------------------------------------
# Função utilitária para formatar o tempo (em segundos) como hh:mm:ss. Bem melhor do que fazer a conversão na marra.
# ---------------------------------------------------------------------
def format_time(sim_time):
    horas = sim_time // 3600
    minutos = (sim_time % 3600) // 60
    segundos = sim_time % 60
    return f"{horas:02d}:{minutos:02d}:{segundos:02d}"


# ---------------------------------------------------------------------
# 6. Produção de Blocos e Simulação Geral (sem laços aninhados)
# ---------------------------------------------------------------------
def main(days, offline_probability, total_validators, block_period, request_timeout_base,
         mean, desvio_padrao, meeting_probability, debug):
    """
    Executa a simulação do sistema blockchain QBFT.

    Parâmetros:
      - days: dias a serem simulados.
      - offline_probability: probabilidade de falha dos validadores.
      - total_validators: número total de validadores inicialmente.
      - block_period: intervalo (em segundos) entre produções de blocos.
      - request_timeout_base: timeout base (em segundos) para tentativa de produção de bloco.
      - mean: média (em horas) do tempo de queda dos validadores.
      - desvio_padrao: desvio padrão (em horas) do tempo de queda.
      - meeting_probability: probabilidade de comparecimento à reunião.

    Retorna:
      - sim_time: tempo total de simulação (em segundos).
      - blocos_totais: número de blocos produzidos.
    """
    # Inicialização dos validadores
    validadores = [{"id": i, "online": True, "time_failure": 0} for i in range(total_validators)]
    removed_validators = []  # validadores removidos em reuniões

    blocos_totais = 0
    sim_time = 0
    segundos_por_dia = 86400
    quorum = math.floor(len(validadores) * 2 / 3)

    # Variáveis para controle de timeout e seleção round-robin
    request_timeout = request_timeout_base
    attempts = 0  # número de tentativas consecutivas sem produzir bloco
    next_validator_index = 0

    eventos = []

    #
    while sim_time < days * segundos_por_dia:
        online_count = atualizar_estado_validadores(validadores, offline_probability, mean, desvio_padrao, block_period)

        for v in removed_validators:
            if not v["online"]:
                v["time_failure"] -= block_period
                if v["time_failure"] <= 0:
                    v["online"] = True
                    v["time_failure"] = 0

        if verificar_11h(sim_time):
            presencas = [reuniao(meeting_probability) for _ in validadores]
            if (sum(presencas) / len(validadores)) >= 0.5:
                if any(not v["online"] for v in validadores):
                    remover_validador_offline(validadores, removed_validators, sim_time, eventos, debug)
                adicionar_validador_online(validadores, removed_validators, sim_time, eventos, debug)

        # Se houver quórum suficiente, tenta produzir um bloco. ISSO É ROUND ROBIN!!!!
        # A produção de blocos, dessa forma, está atrelada aos outros eventos.
        if online_count >= quorum and len(validadores) > 0:
            candidato = validadores[next_validator_index % len(validadores)]
            next_validator_index += 1

            if candidato["online"]:
                blocos_totais += 1
                sim_time += block_period
                attempts = 0
                request_timeout = request_timeout_base
                if debug:
                    print(f"Bloco {blocos_totais} produzido por validador {candidato['id']}")
            else:
                attempts += 1  # Útil para calcular o request_timeout. É um outro approach, mas funciona.
                incremento = request_timeout * (2 ** (attempts - 1))
                sim_time += block_period + incremento
                if debug:
                    print(f"[{format_time(sim_time)}] Validador {candidato['id']} offline. Não produziu bloco.")
                eventos.append(f"[{format_time(sim_time)}] Validador {candidato['id']} offline.")
        else:
            # Sem quórum
            if (len(validadores) - online_count) > (len(validadores) // 3):
                request_timeout *= 2
            if debug:
                print(f"[{format_time(sim_time)}] Quorum insuficiente (online: {online_count} de {len(validadores)}). Aguardando {request_timeout} segundos.")
            eventos.append(
                f"[{format_time(sim_time)}] Quorum insuficiente (online: {online_count} de {len(validadores)}). Aguardando {request_timeout} segundos.")
            sim_time += request_timeout
            if ja_passou_das_11(sim_time) or verificar_11h(sim_time):
                presencas = [reuniao(meeting_probability) for _ in validadores]
                if (sum(presencas) / len(validadores)) >= 0.5:
                    reiniciar_rede(validadores, sim_time)
                    if debug:
                        print(f"[{format_time(sim_time)}] Reinício da rede")
                    eventos.append(f"[{format_time(sim_time)}] Reinício da rede")
                    request_timeout = request_timeout_base

    print("\n=== Resultado da Simulação ===")
    print(f"Tempo total simulado: {format_time(sim_time)}")
    print(f"Blocos produzidos: {blocos_totais}")
    print("Eventos ocorridos: ", eventos)
    return sim_time, blocos_totais, eventos


# ---------------------------------------------------------------------
# 7. Execução da simulação via .env
# ---------------------------------------------------------------------
if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Simulação de blockchain QBFT com tempo de simulação próprio.")
    parser.add_argument("--debug", type=bool, required=False, help="Logs de eventos da rede")
    args = parser.parse_args()
    load_dotenv()

    debug = getattr(args, 'debug', False)

    days = int(os.getenv("DAYS"))
    offline_probability = float(os.getenv("OFFLINE_PROBABILITY"))
    validators = int(os.getenv("VALIDATORS"))
    block_period = int(os.getenv("BLOCK_PERIOD"))
    request_timeout = int(os.getenv("REQUEST_TIMEOUT"))
    mean = float(os.getenv("MEAN"))  # em horas
    standart_deviation = float(os.getenv("STANDART_DEVIATION"))  # em horas
    meeting_probability = float(os.getenv("MEETING_PROBABILITY"))
    sim_range = int(os.getenv("RANGE"))





    resultados = []
    for i in range(sim_range):
        print(f"\n========== Iteração {i + 1} ==========")
        sim_time, blocos, eventos = main(
            days=days,
            offline_probability=offline_probability,
            total_validators=validators,
            block_period=block_period,
            request_timeout_base=request_timeout,
            mean=mean,
            desvio_padrao=standart_deviation,
            meeting_probability=meeting_probability,
            debug=debug,
        )
        resultados.append((sim_time, blocos, eventos))

    tempos = [res[0] for res in resultados]
    blocos_totais = [res[1] for res in resultados]
    eventos = [res[2] for res in resultados]
    media_tempo = sum(tempos) / len(tempos)
    media_blocos = sum(blocos_totais) / len(blocos_totais)

    print("\n========== Estatísticas das Iterações ==========")
    print(f"Média de tempo de produção de blocos: {media_tempo / media_blocos} segundos")
    print(f"Média de blocos produzidos: {media_blocos:.2f}")
    print("Porcentagem de blocos válidos:")
    for i in range(len(blocos_totais)):
        print(f"Iteração {i} - {blocos_totais[i]/blocos_esperados}")
