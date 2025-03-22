import pandas as pd
import matplotlib.pyplot as plt

# Lista dos arquivos com os novos nomes
files = [
    './quedas-2024-07.xlsx',
    './quedas-2024-08.xlsx',
    './quedas-2024-09.xlsx',
    './quedas-2024-10.xlsx',
    './quedas-2024-11.xlsx',
    './quedas-2024-12.xlsx',
    './quedas-2025-01.xlsx'
]

dfs = []
for file in files:
    try:
        df = pd.read_excel(file)
        dfs.append(df)
    except Exception as e:
        print(f"Erro ao ler o arquivo {file}: {e}")

# Concatena os dados em um único DataFrame
data = pd.concat(dfs, ignore_index=True)
print("Total de registros (antes da conversão):", len(data))

# Converte as colunas "Data inicial" e "Data final" para datetime (formato ISO)
data['Data inicial'] = pd.to_datetime(data['Data inicial'], errors='coerce')
data['Data final'] = pd.to_datetime(data['Data final'], errors='coerce')
data = data.dropna(subset=['Data inicial', 'Data final'])
print("Total de registros (após a conversão):", len(data))

# Gera o histograma dos horários de início dos eventos
plt.figure(figsize=(10,6))
plt.hist(data['Data inicial'], bins=50, edgecolor='black')
plt.xlabel('Data inicial')
plt.ylabel('Número de eventos')
plt.title('Distribuição dos inícios dos downtimes (formato ISO)')
plt.grid(True)

# Salva o histograma em um arquivo, similar a simulacao2.py
plt.savefig('histograma_datas_iniciais_real.png')
plt.close()

print("Histograma salvo em 'histograma_datas_iniciais_real.png'")

# Calcula o tempo total de downtime (em segundos) a partir dos campos "Data inicial" e "Data final"
data['Downtime_total'] = (data['Data final'] - data['Data inicial']).dt.total_seconds()

# Gera o histograma dos tempos de downtime
plt.figure(figsize=(10,6))
plt.hist(data['Downtime_total'], bins=50, edgecolor='black')
plt.xlabel('Downtime (segundos)')
plt.ylabel('Número de eventos')
plt.title('Distribuição dos tempos de downtime (total)')
plt.grid(True)
plt.tight_layout()

# Salva o histograma em um arquivo chamado "histograma_downtime_real_total.png"
plt.savefig('histograma_downtime_real_total.png')
plt.close()

print("Histograma salvo em 'histograma_downtime_real_total.png'")

# Filtra os downtime com duração menor ou igual a 1000 segundos
short_downtime = data[data['Downtime_total'] <= 1000]

# Gera o histograma dos tempos de downtime (até 1000 segundos)
plt.figure(figsize=(10,6))
plt.hist(short_downtime['Downtime_total'], bins=50, edgecolor='black')
plt.xlabel('Downtime (segundos)')
plt.ylabel('Número de eventos')
plt.title('Distribuição dos tempos de downtime (até 5000 seg)')
plt.grid(True)
plt.tight_layout()

plt.savefig('histograma_downtime_real_short.png')
plt.close()

print("Histograma salvo em 'histograma_downtime_real_short.png'")