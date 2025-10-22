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
- **`analise_mensal.py`** – Calcula percentis mensais (99% e 99.9%) dos intervalos entre blocos e a eficiência de produção. Lê um CSV de blocos e gera um relatório mensal.

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

5. **Análise mensal de intervalos e eficiência**

   ```bash
   python analise_mensal.py <arquivo.csv> [--config simulation_config.json] [--output analise_mensal.csv]
   ```

   O script lê um arquivo CSV com dados de blocos (formato: `sim_id;timestamp;proposer_validator`) e gera um relatório mensal contendo:
   - **mes_id**: Número do mês (1, 2, 3, ...) baseado em períodos de 30 dias
   - **percentil99**: Percentil 99% dos intervalos entre blocos do mês
   - **percentil99_9**: Percentil 99.9% dos intervalos entre blocos do mês
   - **eficiencia**: Eficiência de produção de blocos (blocos_produzidos / blocos_ideais * 100)

   Exemplo de uso com o arquivo correto:
   ```bash
   python analise_mensal.py ../data/v8-d6000-b105_blocks.csv --config simulation_config.json --output resultado_mensal.csv
   ```

