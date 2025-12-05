# Métricas de Produção de Blocos

Essa ferramenta realiza consultas a um nó da RBB para extração de métricas relativas à produção de blocos em um determinado período de tempo. Um relatório é gerado e salvo em arquivo `.csv`, permitindo integração com ferramentas de análise de dados.

## Requisitos

Para utilizar essa ferramenta é necessário:

- Instalar as dependências do projeto (ver [README](../README.md) do projeto).
- Ter acesso à API JSON-RPC de algum nó da RBB
- Ter arquivos com metadados dos nós (`nodes_lab.json` e `nodes_piloto.json`) em uma mesma pasta
- **NodeJS** na versão **22.11**
- **NPM** na versão **10.9.0**

## Utilização

Os parâmetros que a ferramenta utiliza são passados por linha de comando nos seguintes formatos e ordem:

```bash
node Blocks\block-metrics.js <data inicial> <data final> <provider> <endereço_do_nodes.json>
```

Onde:

- `<data inicial>` e `<data final>` determinam o período de tempo a ser analizado.
  - `<data inicial>` deve ser anterior ou igual a `<data final>`.
  - `<data final>` deve ser anterior ou igual à data corrente.
  - Ambas as datas devem ser passadas obrigatoriamente no formato **DD/MM/AAAA**.

- `<provider>` é o endereço http para o qual se pode enviar chamadas JSON-RPC aos nós BESU. Normalmente `http://localhost:8545`

- `<endereço_do_nodes.json>` refere-se ao **path** até os arquivos contendo os metadados dos nós. Os arquivos json devem ter o nome no formato `nodes_<rede>.json`.

Dessa forma, uma possível execução dessa ferramenta seria:

```bash
node Blocks\block-metrics.js 27/11/2024 11/12/2024 http://localhost:8545 ../nodesFolder
```

A qual retornaria, por exemplo:

```bash
Data inicial: DD/MM/AAAA 
Data final: DD/MM/AAAA
Bloco inicial:     xxxx
Bloco final:       xxxx
Acessando arquivo de configuração:
 - LAB
 - PILOTO
Blocos produzidos: xxxx
Qtd máx ideal:     xxxx
Rendimento:        xx%
┌─────────┬─────────────┬───────────────────┐
│ (index) │ Organização │ Blocos produzidos │
├─────────┼─────────────┼───────────────────┤
│ 0       │'organizacao'│ xxxx              │
│ 1       │'Unknown'    │ xxxx              │
│ ...     │ '....'      │ ....              │
└─────────┴─────────────┴───────────────────┘
Arquivo CSV gerado com sucesso
```

## Métricas de Análise de Blocos

A ferramenta `block-analytics.js` realiza a análise de um arquivo CSV contendo dados de blocos, calculando estatísticas como tempo máximo, mínimo, médio e desvio padrão do tempo de produção dos blocos.

### Utilização

Os parâmetros que a ferramenta utiliza são passados por linha de comando no seguinte formato:

```bash
node Blocks\block-analytics.js <caminho_do_arquivo_csv>
```

Onde:

- `<caminho_do_arquivo_csv>` refere-se ao **path** até o arquivo CSV contendo os dados dos blocos.

Dessa forma, uma possível execução dessa ferramenta seria:

```bash
node Blocks\block-analytics.js C://DadosCSV/2025-01/blocks2025-01.csv
```

A qual retornaria, por exemplo:

```bash
Blocos produzidos: xxxx
Tempo mínimo: xxxx s
Tempo médio: xxxx s
Tempo máximo: xxxx s
Mediana: xxxx s
Desvio padrão: xxxx s
Quantil 99%: xxxx s
```

### Saída via Menu Interativo

Ao executar através do menu interativo (`run.bat`), o resultado é automaticamente salvo no arquivo `result/Blocos-estat.txt`.
