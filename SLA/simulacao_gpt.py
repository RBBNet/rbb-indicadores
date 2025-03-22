import numpy as np
import pandas as pd
import matplotlib.pyplot as plt

# Definir o período de simulação (por exemplo, 3 meses)
start_date = pd.Timestamp('2021-01-01')
end_date   = pd.Timestamp('2021-04-01')
total_minutes = (end_date - start_date).total_seconds() / 60

# Número esperado de eventos no período real (para calibrar a taxa)
expected_events = 450
# Taxa de eventos por minuto (processo de Poisson)
rate = expected_events / total_minutes

# Lista para armazenar os eventos simulados
events = []
current_time = start_date

# Enquanto o tempo simulado não ultrapassar o fim do período
while current_time < end_date:
    # Gera o tempo até o próximo evento (interarrival) usando distribuição exponencial
    interarrival = np.random.exponential(scale=1/rate)
    current_time += pd.to_timedelta(interarrival, unit='m')
    if current_time >= end_date:
        break
    # Gera a duração do downtime usando um modelo de mistura:
    # - Com probabilidade p_short, o downtime é curto (exponencial com média ~1 minuto)
    # - Caso contrário, o downtime é longo (exponencial com média ~330 minutos)
    p_short = 0.8
    if np.random.rand() < p_short:
        downtime = np.random.exponential(scale=1.0)
    else:
        downtime = np.random.exponential(scale=330.0)
        
    event = {
        'Data inicial': current_time,
        'downtime_minutes': downtime,
        'Data final': current_time + pd.to_timedelta(downtime, unit='m')
    }
    events.append(event)

# Cria o DataFrame com os dados simulados
simulated_data = pd.DataFrame(events)

# Exibe estatísticas do downtime simulado
stats = simulated_data['downtime_minutes'].describe()
print("Estatísticas simuladas do downtime (minutos):")
print(stats)
# Histograma da distribuição dos downtimes simulados
plt.figure(figsize=(10,6))
plt.hist(simulated_data['downtime_minutes'], bins=50, edgecolor='black')
plt.xlabel('Tempo de inoperância (minutos)')
plt.ylabel('Frequência')
plt.title('Distribuição simulada do downtime dos nós')
plt.grid(True)
plt.tight_layout()

plt.savefig("simulated_downtime_hist.png")
plt.close()
print("Histogram saved to 'simulated_downtime_hist.png'")

# Histograma dos horários de início dos eventos simulados
plt.figure(figsize=(10,6))
plt.hist(simulated_data['Data inicial'], bins=50, edgecolor='black')
plt.xlabel('Data inicial')
plt.ylabel('Número de eventos')
plt.title('Distribuição dos inícios dos downtimes ao longo do tempo')
plt.grid(True)
plt.tight_layout()

plt.savefig("simulated_start_events_hist.png")
plt.close()
print("Histogram saved to 'simulated_start_events_hist.png'")

# Exibe as primeiras linhas dos dados simulados
print("\nAmostra dos dados simulados:")
print(simulated_data.head())
