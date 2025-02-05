import math
import random
import argparse
import numpy as np


# ---------------------------------------------------------------------
# Função para simular se o validador está online ou offline e, se offline,
# por quanto tempo ficará fora de operação.
def validador_esta_online(prob_falha, media, desvio_padrao):
    if random.random() < prob_falha:
        rng = np.random.default_rng()
        tempo_falha = int(rng.normal(media, desvio_padrao))
        tempo_falha = abs(tempo_falha)
        return False, tempo_falha * 3600  # conversão para segundos
    else:
        return True, 0


# ---------------------------------------------------------------------
# Função para simular se o "dono" do validador compareceu à reunião.
def reuniao(prob_comparecimento):
    return random.random() < prob_comparecimento


# ---------------------------------------------------------------------
# Função que verifica se já passou das 11 horas (horário de simulação)
def ja_passou_das_11(contador):
    if contador < 1e18:
        resultado_div = contador / 3600
    else:
        return False

    if resultado_div % 24 >= 11:
        return True
    return False


# ---------------------------------------------------------------------
# Verifica se exatamente é 11h (para agendamento exato da reunião)
def verificar_11h(contador):
    if contador < 1e18:
        resultado_div = contador / 3600
    else:
        return False

    if resultado_div % 24 == 11 and contador % 3600 == 0:
        return True
    return False


# ---------------------------------------------------------------------
# Atualiza o estado de cada validador: se estiver offline, decrementa o tempo
# de falha; se estiver online, sorteia uma nova condição (online/offline).
def atualizar_estado_validadores(validadores, prob_falha, media, desvio_padrao, block_period):
    online_validators = 0

    for validador in validadores:
        if not validador["online"]:
            if validador["tempo_falha"] <= 0:
                validador["online"] = True
                validador["tempo_falha"] = 0
            else:
                validador["tempo_falha"] -= block_period
        else:
            online, tempo_falha = validador_esta_online(prob_falha, media, desvio_padrao)
            validador["online"] = online
            validador["tempo_falha"] = tempo_falha if not online else 0

        if validador["online"]:
            online_validators += 1

    return online_validators


# ---------------------------------------------------------------------
# Função para remover validadores offline em reunião
def remover_validador_offline(validadores, validadores_removidos, horario_atual):
    for i in range(len(validadores)):
        if not validadores[i]["online"]:
            print(
                f"Validador {validadores[i]['id']} sendo removido - {horario_atual // 3600}:{(horario_atual % 3600) // 60}:{horario_atual % 60}")
            validadores_removidos.append(validadores[i])
            del validadores[i]
            break


# ---------------------------------------------------------------------
# Função para adicionar validadores removidos, se estiverem online
def adicionar_validador_online(validadores, validadores_removidos, horario_atual):
    for validador in validadores_removidos[:]:
        if validador["online"]:
            print(
                f"Validador {validador['id']} sendo adicionado de volta - {horario_atual // 3600}:{(horario_atual % 3600) // 60}:{horario_atual % 60}")
            validadores.append(validador)
            validadores_removidos.remove(validador)


# ---------------------------------------------------------------------
# Reinicia a rede, colocando todos os validadores online e registrando o evento.
def reiniciar_rede(validadores, eventos_importantes, horario_atual):
    eventos_importantes.append(
        {'Restart': f"{horario_atual // 3600}:{(horario_atual % 3600) // 60}:{horario_atual % 60}"}
    )
    for validador in validadores:
        validador["online"] = True


# ---------------------------------------------------------------------
# Função principal de simulação. Infelizmente ainda é um Golias.
def main(days, offline_probability, validators, block_period, request_timeout_base, media, desvio_padrao,
         prob_comparecimento):
    # Inicializa os validadores
    validadores = [{"id": i, "online": True, "tempo_falha": 0} for i in range(validators)]
    quorum_para_bloco = math.floor(len(validadores) * 2 / 3)
    blocos_totais = 0
    tempo_total = 0
    segundos_por_dia = 24 * 3600
    horario_atual = 0
    eventos_importantes = []
    validadores_removidos = []
    request_timeout_mutavel = request_timeout_base
    # Contador de tentativas consecutivas de produção com validador offline (para timeout exponencial)
    contador_timeout = 0

    while True:
        # Atualiza o estado dos validadores ativos
        online_validators = atualizar_estado_validadores(validadores, offline_probability, media, desvio_padrao,
                                                         block_period)

        # Atualiza o estado dos validadores removidos (mesmo processo de decremento de tempo)
        for validador in validadores_removidos:
            if validador["tempo_falha"] > 0:
                validador["tempo_falha"] -= block_period
            if validador["tempo_falha"] <= 0:
                validador["online"] = True
                validador["tempo_falha"] = 0

        # Se houver algum validador offline e for horário de reunião (11h exato), tenta removê-los
        if any(not v["online"] for v in validadores) and verificar_11h(horario_atual):
            eventos_importantes.append(
                {'Reunião': f"{horario_atual // 3600}:{(horario_atual % 3600) // 60}:{horario_atual % 60}"}
            )
            comparecimento = [reuniao(prob_comparecimento) for _ in validadores]
            if sum(comparecimento) / len(comparecimento) >= 0.51:
                remover_validador_offline(validadores, validadores_removidos, horario_atual)

        # Se houver validadores removidos, em horário de reunião tenta re-adicioná-los
        if validadores_removidos and verificar_11h(horario_atual):
            comparecimento = [reuniao(prob_comparecimento) for _ in validadores]
            if sum(comparecimento) / len(comparecimento) >= 0.51:
                adicionar_validador_online(validadores, validadores_removidos, horario_atual)

        # Se o número de validadores offline for maior do que 2/3 da rede, aumenta o request timeout
        if len(validadores) - online_validators > len(validadores) // 3:
            request_timeout_mutavel *= 2

        # Se houver quórum para produção de bloco, tenta produzir o bloco
        if online_validators >= quorum_para_bloco:
            # Escolhe o produtor inicial baseado na rotação
            indice_inicial = blocos_totais % len(validadores)
            indice_atual = indice_inicial
            tentativa = 0
            bloco_produzido = False

            # Tenta, em ordem circular, encontrar um validador online para produzir o bloco.
            while tentativa < len(validadores):
                candidato = validadores[indice_atual]
                if candidato["online"]:
                    # Validador online encontrado: produz bloco.
                    contador_timeout = 0
                    request_timeout_mutavel = request_timeout_base
                    blocos_totais += 1
                    tempo_bloco = block_period
                    tempo_total += tempo_bloco
                    horario_atual += tempo_bloco
                    bloco_produzido = True
                    break
                else:
                    # Se o candidato estiver offline, incrementa timeout e tenta o próximo
                    contador_timeout += 1
                    timeout_incremento = request_timeout_mutavel * (2 ** (contador_timeout - 1))
                    tempo_incremento = block_period + timeout_incremento
                    tempo_total += tempo_incremento
                    horario_atual += tempo_incremento
                    # print(
                    #     f"Validador {candidato['id']} offline. Tentativa {tentativa + 1} com timeout {timeout_incremento} segundos. Novo horário: {horario_atual // 3600}:{(horario_atual % 3600) // 60}:{horario_atual % 60}")

                    # Passa para o próximo validador na ordem circular
                    indice_atual = (indice_atual + 1) % len(validadores)
                    tentativa += 1

            # Se nenhum validador online for encontrado (mesmo havendo quórum teoricamente), apenas espera
            if not bloco_produzido:
                print(
                    f"Nenhum validador disponível para produzir o bloco às {horario_atual // 3600}:{(horario_atual % 3600) // 60}:{horario_atual % 60}")
                horario_atual += request_timeout_mutavel

        else:
            # Sem quórum para produção de bloco: espera o timeout
            print(
                f"Sem quórum para produção de bloco às {horario_atual // 3600}:{(horario_atual % 3600) // 60}:{horario_atual % 60}")
            horario_atual += request_timeout_mutavel
            # Se já passou das 11h (ainda que não seja exato), pode reiniciar a rede
            if ja_passou_das_11(horario_atual):
                comparecimento = [reuniao(prob_comparecimento) for _ in validadores]
                if sum(comparecimento) / len(comparecimento) >= 0.51:
                    print(
                        f"Reinício da rede às {horario_atual // 3600}:{(horario_atual % 3600) // 60}:{horario_atual % 60}")
                    reiniciar_rede(validadores, eventos_importantes, horario_atual)
                    request_timeout_mutavel = request_timeout_base

        # Verificação de dias simulados
        dias_simulados = horario_atual // segundos_por_dia
        if dias_simulados >= days:
            break

    print(f"\nHorário de fim: {horario_atual // 3600}:{(horario_atual % 3600) // 60}:{horario_atual % 60}")
    blocos_esperados = (days * segundos_por_dia) / block_period
    print(f"Quantidade esperada de blocos: {blocos_esperados}")
    print(f"Quantidade real de blocos: {blocos_totais}")
    print(f"Taxa (blocos/s): {tempo_total/blocos_totais}")
    return [tempo_total/blocos_totais, eventos_importantes]


# ---------------------------------------------------------------------
# Execução via linha de comando
if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Simulação de blockchain QBFT com tempo de simulação próprio.")

    parser.add_argument("--days", type=int, required=True, help="Quantidade de dias a serem simulados.")
    parser.add_argument("--offline_probability", type=float, required=True,
                        help="Probabilidade de queda dos validadores.")
    parser.add_argument("--validators", type=int, required=True, help="Quantidade de validadores.")
    parser.add_argument("--block_period", type=int, required=True, help="Intervalo de produção de blocos em segundos.")
    parser.add_argument("--request_timeout", type=int, required=True,
                        help="Valor base de timeout em caso de falha na produção de bloco.")
    parser.add_argument("--mean", type=float, required=True, help="Média de tempo de queda dos validadores (em horas).")
    parser.add_argument("--standart_deviation", type=float, required=True,
                        help="Desvio padrão para tempo de queda (em horas).")
    parser.add_argument("--meeting_probability", type=float, required=True,
                        help="Probabilidade de comparecimento à reunião.")
    parser.add_argument("--range", type=int, required=True, help="Quantidade de iterações da simulação.")

    args = parser.parse_args()
    resultados = []
    for i in range(args.range):
        print(f"\n=== ITERAÇÃO {i} COM {args.offline_probability * 100}% DE PROBABILIDADE DE QUEDA ===")
        res_iteracao, eventos_importantes = main(
            args.days,
            args.offline_probability,
            args.validators,
            args.block_period,
            args.request_timeout,
            args.mean,
            args.standart_deviation,
            args.meeting_probability
        )
        resultados.append(res_iteracao)
        print("Eventos importantes:", eventos_importantes)

    media_tempo_bloco = np.mean(resultados)
    print(f"\nMédia de segundos para 1 bloco: {media_tempo_bloco}")
