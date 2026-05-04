# RBB Indicadores

As ferramentas deste repositório apoiam a equipe da Rede Blockchain Brasil (RBB) no acompanhamento da operação da rede e da evolução das iniciativas do ecossistema.

O projeto foi separado em dois perfis de uso:

- Operacao: foco em blocos, incidentes e exportacao tecnica.
- Evolucao: foco em iniciativas e acompanhamento do andamento do projeto.

## Requisitos

- Node.js 22.11
- NPM 10.9.0
- Python com pip no PATH
- Arquivo `config.json`, criado a partir de `config.json.example`

```bash
copy config.json.example config.json
```

Ou no PowerShell:

```powershell
Copy-Item config.json.example config.json
```

Durante o `npm install`, o projeto tenta instalar automaticamente o pacote Python `ethereum-etl` via `postinstall`.

## Configuracao por Perfil

Campos comuns aos dois perfis:

- `GITHUB_RBB_TOKEN`
- `PROXY_URL` quando houver proxy

Campos do perfil Evolucao:

- `ORG`
- `PROJECT_NUMBER`

Campos do perfil Operacao:

- `INDICADORES_BASE_DIR`
- `DUMP_RBB_PRD_BASE_DIR`
- `DUMP_RBB_LAB_BASE_DIR`
- `BLOCK_PRODUCTION_OLA_THRESHOLDS`
- `SSH.LAB`
- `SSH.PROD`

O token do GitHub deve ter os seguintes escopos para acesso aos repositorios privados:

- `repo`
- `read:project`

## Ferramentas

- [Blocks/README.md](Blocks/README.md) - indicadores de producao de blocos.
- [Issues/README.md](Issues/README.md) - acompanhamento de incidentes em producao.
- [Projects/README.md](Projects/README.md) - acompanhamento das iniciativas do projeto.

## Instalacao

```bash
npm install
```

## Execucao

Pontos de entrada disponiveis:

- `node run.js` - seletor de perfil
- `node run-operacao.js` - menu do gestor de operacao
- `node run-evolucao.js` - menu do gestor de evolucao
- `npm run menu`
- `npm run menu:operacao`
- `npm run menu:evolucao`

## Perfil Operacao

Use `node run-operacao.js` para acessar:

1. Dump RBB (ethereum-etl) para pasta local
2. Publica dump RBB para pasta de infra
3. Proposicao de Blocos por Participe
4. Estatisticas do Tempo de Producao de Blocos
5. Votos de Consenso por extraData
6. Issues em Producao
7. Publicar indicadores na pasta final
8. Gerar HTML Operacional
9. Help
10. Sair

Observacoes:

- O dump local e as metricas de blocos usam tunel SSH com ambiente Lab ou Prd configurado no `config.json`.
- A opcao 3 pede apenas o mes de referencia em `MM/AAAA`, usa internamente o primeiro e o ultimo dia do mes e grava `result/AAAA-MM/lab/Blocos_lab.csv` para Lab ou `result/AAAA-MM/prd/Blocos.csv` para Prd.
- O dump local mensal e salvo em `result/dump/lab/AAAA-MM` ou `result/dump/prd/AAAA-MM`, contendo os arquivos `blocksAAAA-MM.csv`, `transactionsAAAA-MM.csv`, `receiptsAAAA-MM.csv`, `logsAAAA-MM.csv`, `contractsAAAA-MM.csv`, `tokensAAAA-MM.csv` e `token_transfersAAAA-MM.csv`.
- A opcao 2 publica o dump bruto para as pastas de infra `DUMP_RBB_LAB_BASE_DIR/AAAA-MM` e `DUMP_RBB_PRD_BASE_DIR/AAAA-MM`, varrendo recursivamente o dump local do mes, copiando os arquivos encontrados para a raiz do destino e renomeando arquivos legados para o padrao `tipoAAAA-MM.csv`.
- A opcao 4 agora permite Lab e Prd, procura primeiro `blocksAAAA-MM.csv` em `result/dump/{lab|prd}/AAAA-MM`, faz fallback para `DUMP_RBB_LAB_BASE_DIR/AAAA-MM` ou `DUMP_RBB_PRD_BASE_DIR/AAAA-MM` quando necessario, pede confirmacao da origem em ambos os casos e, se a origem for a rede, copia o arquivo para `result/dump/{lab|prd}/AAAA-MM` antes de gerar `result/AAAA-MM/{lab|prd}/Blocos-estat.txt`.
- A opcao 5 analisa `blocksAAAA-MM.csv` do ambiente escolhido, garante a presenca de `nodes_lab.json` e `nodes_piloto.json` em `result/AAAA-MM`, decodifica o `extra_data` dos blocos para procurar votos observados de inclusao ou exclusao de consenso e grava `result/AAAA-MM/Votos-consenso-lab.csv` ou `result/AAAA-MM/Votos-consenso-prd.csv` com as datas em horario de Brasilia.
- A opcao 6 consulta a API do GitHub no repositorio `RBBNet/incidentes`, usa `GITHUB_RBB_TOKEN` do `config.json`, pede apenas `MM/AAAA` e grava `result/AAAA-MM/Incidentes.csv`.
- A opcao 3 tambem baixa ou reutiliza `nodes_lab.json` e `nodes_piloto.json` em `result/AAAA-MM`.
- A opcao 7 publica para `INDICADORES_BASE_DIR/AAAA-MM` apenas os arquivos do escopo operacional: `lab/Blocos_lab.csv`, `prd/Blocos.csv`, `prd/Blocos-estat.txt`, `Incidentes.csv`, `Comentarios.csv`, `nodes_lab.json` e `nodes_piloto.json`, depois de mostrar ao usuario as listas local e de destino.
- A opcao 8 gera o HTML operacional a partir dos arquivos em `INDICADORES_BASE_DIR/AAAA-MM`, monta uma tabela de producao para Prd com `Blocos.csv` e outra para Lab com `Blocos_lab.csv`, usa `Incidentes.csv` do ultimo mes da faixa quando existir, grava `Indicadores-operacao.html` em `result/AAAA-MM-final` e, se ja houver arquivo de mesmo nome em `INDICADORES_BASE_DIR/AAAA-MM`, pede confirmacao antes de sobrescrever a copia final.
- As celulas de percentagem de producao no HTML sao coloridas conforme `BLOCK_PRODUCTION_OLA_THRESHOLDS` do `config.json`, usando a quantidade de partícipes/validadores presente no CSV do ambiente para escolher os limiares de alerta amarelo e vermelho.
- Se nao houver OLA configurado para a quantidade de partícipes encontrada em um mes, o HTML continua sendo gerado sem coloracao para aquele caso e com aviso no terminal.
- Se faltar `Blocos.csv` ou `Blocos-estat.txt` em algum mes do periodo, esse mes e ignorado na consolidacao do HTML operacional.

## Perfil Evolucao

Use `node run-evolucao.js` para acessar:

1. Acompanhamento das Iniciativas de Maturacao do Piloto
2. Publicar indicadores na pasta final
3. Gerar HTML de Evolucao
4. Sair

Observacoes:

- O perfil de evolucao nao requer configuracao de SSH.
- A opcao 1 grava `Comentarios.csv`, `Issues.csv` e `Iniciativas_AAAA-MM.csv` em `result/AAAA-MM`.
- A opcao 2 publica para `INDICADORES_BASE_DIR/AAAA-MM` apenas `Iniciativas_AAAA-MM.csv` e `Issues.csv` do mes selecionado.
- A opcao 3 usa o arquivo `Iniciativas_AAAA-MM.csv` de `result/AAAA-MM`, gera `Indicadores-evolucao.html` em `result/AAAA-MM-final` e copia o mesmo HTML para `INDICADORES_BASE_DIR/AAAA-MM`, pedindo confirmacao antes de sobrescrever a copia final quando necessario.

## Seletor de Perfil

`node run.js` abre um menu simples para encaminhar o usuario ao perfil correto sem misturar as opcoes.

## Valores Padrao

- Datas: primeiro e ultimo dia do mes anterior
- Periodos mensais: mes anterior
- Username SSH: usuario logado no sistema
- Caminhos de arquivo: sugestoes baseadas na estrutura atual do projeto

Para aceitar um valor padrao, basta pressionar ENTER sem digitar nada.
