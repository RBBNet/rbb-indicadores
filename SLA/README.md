# Ferramentas de Simulação de SLA

Esta pasta reúne scripts em Python utilizados para simular a operação da rede e analisar a produção de blocos. Os programas permitem gerar dados sintéticos de falha de validadores e extrair métricas a partir de arquivos CSV.

## Dependências

- Python 3.10 ou superior
- `pandas` e `matplotlib` (para instalá-las: `pip install pandas matplotlib`)

## Arquivos

- **`simulation_config.json`** – Parâmetros básicos utilizados pelas simulações (número de validadores, tempos médios de falha, duração, etc.).
- **`round2.py`** – Extrai padrões de falha de um CSV de blocos e gera um `*-fails.csv`.
- **`simulacao6.py`** – Simulador de falhas orientado a eventos. Lê `simulation_config.json` e produz arquivos CSV com os intervalos entre blocos.
- **`run.py`** – Executa várias simulações em sequência utilizando o `simulacao6.py`, alterando automaticamente `num_validators` e `meeting_interval_in_hours`. Os resultados são armazenados em `data/batch/`.
- **`graficos_perc_minima.py`** – Gera gráficos relacionando a menor participação percentual de validadores com estatísticas de intervalo entre blocos.

## Uso

Uma execução típica segue a sequência abaixo:

1. **Identificar falhas reais**

   ```bash
   python round2.py <blocks.csv> [--config simulation_config.json] [--output fails.csv]
   ```

   O `fails.csv` resultante pode ser utilizado para estimar distribuições de tempos de falha e alimentar o `simulation_config.json`.

2. **Rodar uma simulação**

   ```bash
   python simulacao6.py <saida.csv> [--debug]
   ```

   São gerados `<saida.csv>` com estatísticas agregadas e `<saida_blocks.csv>` com dados de cada bloco.

3. **Executar em lote**

   ```bash
   python run.py
   ```

   O script ajusta parâmetros no `simulation_config.json` e repete a simulação várias vezes, gravando os arquivos em `data/batch/`.

4. **Gerar gráficos**

   ```bash
   python graficos_perc_minima.py <blocks.csv> <tamanho_chunk_horas> <limiar_intervalo_segundos> <tamanho_janela>
   ```

   Três gráficos de dispersão mostram a relação entre participação mínima e os intervalos entre blocos.

