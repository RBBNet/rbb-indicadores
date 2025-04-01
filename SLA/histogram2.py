import argparse
import os
import matplotlib
matplotlib.use("Qt5Agg")
import pandas as pd
import matplotlib.pyplot as plt

# Parse command line arguments
parser = argparse.ArgumentParser(description="Generate histograms from downtime CSV data")
parser.add_argument("--file", required=True, help="CSV file with downtime data (e.g., quedas_totais.csv)")
parser.add_argument("--ymdate", type=float, default=None, help="Maximum Y value for Data Inicial histogram")
parser.add_argument("--ymdowntimeshort", type=float, default=None, help="Maximum Y value for short downtime histogram")
parser.add_argument("--ymdowntime", type=float, default=None, help="Maximum Y value for long downtime histogram")
parser.add_argument("--ymdowntimelong", type=float, default=None, help="Maximum Y value for long downtime histogram")
args = parser.parse_args()
# Derive the base filename (without path and extension)
base_name = os.path.splitext(os.path.basename(args.file))[0]

# Read the CSV file (fields separated by ;)
data = pd.read_csv(args.file, sep=';', encoding='latin-1')
print("Total de registros (antes da conversão):", len(data))

# Convert the date fields (expecting format: DD/MM/YYYY HH:MM:SS)
data['Data Inicial'] = pd.to_datetime(data['Data inicial'], errors='coerce', format='%d/%m/%Y %H:%M:%S')
data['Data final']   = pd.to_datetime(data['Data final'], errors='coerce', format='%d/%m/%Y %H:%M:%S')
data = data.dropna(subset=['Data Inicial', 'Data final'])
print("Total de registros (após a conversão):", len(data))
# Generate histogram of "Data Inicial" events
plt.figure(figsize=(10,6))
plt.hist(data['Data Inicial'], bins=50, edgecolor='black')
plt.xlabel('Data Inicial')
plt.ylabel('Número de eventos')
plt.title('Distribuição dos inícios dos downtimes (formato ISO)')
plt.grid(True)
if args.ymdate is not None:
    plt.ylim(0, args.ymdate)
plt.tight_layout()

hist_dates_filename = f"{base_name}_hist_dates.png"
plt.savefig(hist_dates_filename)
plt.close()
print(f"Histograma salvo em '{hist_dates_filename}'")

# Calculate total downtime in seconds from the differences between "Data final" and "Data Inicial"
data['Downtime_total'] = (data['Data final'] - data['Data Inicial']).dt.total_seconds()

# Generate histogram of total downtime durations (all downtimes)
plt.figure(figsize=(10,6))
plt.hist(data['Downtime_total'], bins=50, edgecolor='black')
plt.xlabel('Downtime (segundos)')
plt.ylabel('Número de eventos')
plt.title('Distribuição dos tempos de downtime (total)')
plt.grid(True)
plt.tight_layout()

hist_total_filename = f"{base_name}_hist_downtime_total.png"
plt.savefig(hist_total_filename)
plt.close()
print(f"Histograma salvo em '{hist_total_filename}'")

short_downtime = data[data['Downtime_total'] <= 1000]
plt.figure(figsize=(10,6))
plt.hist(short_downtime['Downtime_total'], bins=50, range=(0,1000), edgecolor='black')
plt.xlabel('Downtime (segundos)')
plt.ylabel('Número de eventos')
plt.title('Distribuição dos tempos de downtime (até 1000 seg)')
plt.grid(True)
if args.ymdowntimeshort is not None:
    plt.ylim(0, args.ymdowntimeshort)
plt.tight_layout()

hist_short_filename = f"{base_name}_hist_downtime_short.png"
plt.savefig(hist_short_filename)
plt.close()
print(f"Histograma salvo em '{hist_short_filename}'")

long_downtime = data[data['Downtime_total'] > 1000]
plt.figure(figsize=(10,6))
plt.hist(long_downtime['Downtime_total'], bins=50, range=(1000,350000), edgecolor='black')
plt.xlabel('Downtime (segundos)')
plt.ylabel('Número de eventos')
plt.title('Distribuição dos tempos de downtime (acima de 1000 seg)')
plt.grid(True)
if args.ymdowntime is not None:
    plt.ylim(0, args.ymdowntime)
plt.tight_layout()
hist_long_filename = f"{base_name}_hist_downtime_long.png"
plt.savefig(hist_long_filename)
plt.close()
print(f"Histograma salvo em '{hist_long_filename}'")
fig, axs = plt.subplots(2, 2, figsize=(15, 10))

# Primeiro gráfico: Downtime curto (até 1000 segundos)
axs[0, 0].hist(short_downtime['Downtime_total'], bins=50, range=(0, 1000), edgecolor='black')
axs[0, 0].set_xlabel('Downtime (segundos)')
axs[0, 0].set_ylabel('Número de eventos')
axs[0, 0].set_title('Distribuição dos tempos de downtime (até 1000 seg)')
axs[0, 0].grid(True)
if args.ymdowntimeshort is not None:
    axs[0, 0].set_ylim(0, args.ymdowntimeshort)

# Segundo gráfico: Downtime longo (acima de 1000 segundos)
axs[0, 1].hist(long_downtime['Downtime_total'], bins=50, range=(1000, 350000), edgecolor='black')
axs[0, 1].set_xlabel('Downtime (segundos)')
axs[0, 1].set_ylabel('Número de eventos')
axs[0, 1].set_title('Distribuição dos tempos de downtime (acima de 1000 seg)')
axs[0, 1].grid(True)
if args.ymdowntime is not None:
    axs[0, 1].set_ylim(0, args.ymdowntime)

# Terceiro gráfico: Inícios de downtimes até 1000 segundos
axs[1, 0].hist(short_downtime['Data Inicial'], bins=50, edgecolor='black')
axs[1, 0].set_xlabel('Data Inicial')
axs[1, 0].set_ylabel('Número de eventos')
axs[1, 0].set_title('Distribuição dos inícios dos downtimes (até 1000 seg)')
axs[1, 0].grid(True)
if args.ymdate is not None:
    axs[1, 0].set_ylim(0, args.ymdate)

# Quarto gráfico: Inícios de downtimes acima de 1000 segundos
axs[1, 1].hist(long_downtime['Data Inicial'], bins=50, edgecolor='black')
axs[1, 1].set_xlabel('Data Inicial')
axs[1, 1].set_ylabel('Número de eventos')
axs[1, 1].set_title('Distribuição dos inícios dos downtimes (acima de 1000 seg)')
axs[1, 1].grid(True)
if args.ymdowntimelong is not None:
    axs[1, 1].set_ylim(0, args.ymdowntimelong)

plt.tight_layout()

combined_hist_filename = f"{base_name}_combined_histograms.png"
plt.savefig(combined_hist_filename)
plt.show()
print(f"Histograma combinado salvo em '{combined_hist_filename}'")