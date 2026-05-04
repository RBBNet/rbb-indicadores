# Proposição de Blocos por Partícipe

Essa ferramenta realiza consultas a um nó da RBB para extração de métricas relativas à produção de blocos em um determinado período de tempo. Um relatório é gerado e salvo em arquivo `.csv`, permitindo integração com ferramentas de análise de dados.

Quando executada pelo menu operacional, a ferramenta pede um mes de referencia em `MM/AAAA`, converte esse valor internamente para o primeiro e o ultimo dia do mes e grava a saida em `result/AAAA-MM/lab/Blocos_lab.csv` para o ambiente Lab ou em `result/AAAA-MM/prd/Blocos.csv` para o ambiente Prd.

Na geracao do HTML operacional, os percentuais dessas tabelas podem receber coloracao de alerta conforme a chave `BLOCK_PRODUCTION_OLA_THRESHOLDS` do `config.json`. A regra usa a quantidade de partícipes/validadores presente no CSV do ambiente para escolher os limiares amarelo e vermelho. Valores abaixo de `red` ficam em alerta vermelho; valores abaixo de `yellow` ficam em alerta amarelo; sem configuracao para aquela quantidade, o HTML segue sem coloracao para aquele caso.

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
node Blocks\block-metrics.js <data inicial> <data final> <provider> <endereço_do_nodes.json> [pasta-mensal] [ambiente]
```

Onde:

- `<data inicial>` e `<data final>` determinam o período de tempo a ser analizado.
  - `<data inicial>` deve ser anterior ou igual a `<data final>`.
  - `<data final>` deve ser anterior ou igual à data corrente.
  - Ambas as datas devem ser passadas obrigatoriamente no formato **DD/MM/AAAA**.

- `<provider>` é o endereço http para o qual se pode enviar chamadas JSON-RPC aos nós BESU. Normalmente `http://localhost:8545`

- `<endereço_do_nodes.json>` refere-se ao **path** até os arquivos contendo os metadados dos nós. Os arquivos json devem ter o nome no formato `nodes_<rede>.json`.
- `[pasta-mensal]` é opcional e define a subpasta sob `result`, normalmente no formato `AAAA-MM`.
- `[ambiente]` é opcional e controla a subpasta final e o nome do arquivo de saída. Use `lab` para gerar `result/AAAA-MM/lab/Blocos_lab.csv`; omitindo a pasta mensal ou o ambiente, a saida continua compativel com `result/Blocos.csv`.

Dessa forma, uma possível execução dessa ferramenta seria:

```bash
node Blocks\block-metrics.js 01/03/2026 31/03/2026 http://localhost:8545 ../nodesFolder 2026-03 lab
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
Arquivo Blocos_lab.csv gerado com sucesso no caminho: result\2026-03\lab\Blocos_lab.csv
```

## Métricas de Análise de Blocos

A ferramenta `block-analytics.js` realiza a análise de um arquivo CSV contendo dados de blocos, calculando estatísticas como tempo máximo, mínimo, médio e desvio padrão do tempo de produção dos blocos.

## Votos de Consenso por extraData

A ferramenta `block-consensus-votes.js` examina o arquivo mensal de blocos gerado pelo `ethereum-etl`, decodifica o campo `extra_data` de cada bloco e registra apenas os votos explicitamente observados no cabeçalho dos blocos para inclusão ou exclusão do consenso.

### Utilização

Os parâmetros que a ferramenta utiliza são passados por linha de comando no seguinte formato:

```bash
node Blocks\block-consensus-votes.js <caminho-do-blocks.csv> <pasta-mensal-result> <ambiente> <arquivo-saida.csv>
```

Onde:

- `<caminho-do-blocks.csv>` aponta para `blocksAAAA-MM.csv` do ambiente analisado.
- `<pasta-mensal-result>` normalmente aponta para `result\AAAA-MM`, onde o script procura `nodes_lab.json` e `nodes_piloto.json` para traduzir endereços em instituições.
- `<ambiente>` deve ser `lab` ou `prd`.
- `<arquivo-saida.csv>` define o arquivo CSV final, por exemplo `result\2026-03\Votos-consenso-prd.csv`.

Exemplo:

```bash
node Blocks\block-consensus-votes.js result\dump\prd\2026-03\blocks2026-03.csv result\2026-03 prd result\2026-03\Votos-consenso-prd.csv
```

### Saída via Menu Interativo

Ao executar através do menu interativo de Operacao (`node run-operacao.js`), o processo fica assim:

1. O script solicita o mês de referência em `MM/AAAA`
2. Solicita o ambiente Lab ou Prd
3. Procura primeiro `blocksAAAA-MM.csv` em `result\dump\{lab|prd}\AAAA-MM`
4. Se não encontrar localmente, faz fallback para `DUMP_RBB_LAB_BASE_DIR\AAAA-MM\blocksAAAA-MM.csv` ou `DUMP_RBB_PRD_BASE_DIR\AAAA-MM\blocksAAAA-MM.csv`
5. Em ambos os casos, mostra a origem escolhida e pede confirmação
6. Quando a origem é a rede, copia o arquivo para `result\dump\{lab|prd}\AAAA-MM\blocksAAAA-MM.csv`
7. Garante a presença de `nodes_lab.json` e `nodes_piloto.json` em `result\AAAA-MM`, baixando-os quando necessário
8. Decodifica o `extra_data` dos blocos para procurar votos observados
9. Gera `result\AAAA-MM\Votos-consenso-lab.csv` ou `result\AAAA-MM\Votos-consenso-prd.csv`, com datas em horário de Brasília

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

Ao executar através do menu interativo de Operacao (`node run-operacao.js`), o processo é facilitado:

1. O script solicita o mês (MM) e ano (AAAA) de referência
2. Solicita o ambiente Lab ou Prd
3. Procura primeiro `blocksAAAA-MM.csv` em `result\dump\{lab|prd}\AAAA-MM`
4. Se não encontrar localmente, faz fallback para `DUMP_RBB_LAB_BASE_DIR\AAAA-MM\blocksAAAA-MM.csv` ou `DUMP_RBB_PRD_BASE_DIR\AAAA-MM\blocksAAAA-MM.csv`
5. Em ambos os casos, mostra a origem escolhida e pede confirmação
6. Quando a origem é a rede, copia o arquivo para `result\dump\{lab|prd}\AAAA-MM\blocksAAAA-MM.csv`
7. Processa as estatísticas
8. Salva o resultado em `result\AAAA-MM\{lab|prd}\Blocos-estat.txt`

**Exemplo de interação:**
```
Digite o mes de referencia (MM): 11
Digite o ano de referencia (AAAA): 2025
Escolha o ambiente (1-2): 2

Ambiente selecionado: Prd
Origem escolhida: pasta local de dump
Arquivo de blocos: result\dump\prd\2025-11\blocks2025-11.csv
Confirmar uso desta origem? (s/n): s
Usando arquivo local ja existente no dump.
Processando estatisticas...

Processamento concluido!
Resultado salvo em: result\2025-11\prd\Blocos-estat.txt
Arquivo de blocos utilizado: result\dump\prd\2025-11\blocks2025-11.csv
```
