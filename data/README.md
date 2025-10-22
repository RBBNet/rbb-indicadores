# Diretório de Dados

Este diretório é usado para armazenar arquivos CSV de entrada para as análises de SLA.

## Arquivos Esperados

- **`v8-d6000-b105_blocks.csv`** - Arquivo de blocos para análise mensal de percentis e eficiência
  - Formato: `sim_id;timestamp;proposer_validator`
  - Separador: ponto-e-vírgula (`;`)
  - `sim_id`: identificador da simulação
  - `timestamp`: timestamp em segundos (int ou float)
  - `proposer_validator`: identificador do validador que propôs o bloco

## Uso

Os arquivos CSV neste diretório são usados como entrada para os scripts de análise em `../SLA/`, como:

```bash
cd ../SLA
python analise_mensal.py ../data/v8-d6000-b105_blocks.csv --config simulation_config.json --output resultado.csv
```

## Nota

Arquivos `.csv` são ignorados pelo Git (conforme `.gitignore`), portanto você deve adicionar seus arquivos de dados manualmente a este diretório.
