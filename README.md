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
5. Issues em Producao
6. Publicar indicadores na pasta final
7. Gerar HTML Operacional
8. Help
9. Sair

Observacoes:

- O dump local e as metricas de blocos usam tunel SSH com ambiente Lab ou Prd configurado no `config.json`.
- A opcao 3 pede apenas o mes de referencia em `MM/AAAA`, usa internamente o primeiro e o ultimo dia do mes e grava `result/AAAA-MM/lab/Blocos_lab.csv` para Lab ou `result/AAAA-MM/prd/Blocos.csv` para Prd.
- O dump local mensal e salvo em `result/dump/lab/AAAA-MM/blocksAAAA-MM.csv` ou `result/dump/prd/AAAA-MM/blocksAAAA-MM.csv`.
- A opcao 2 publica o dump bruto para as pastas de infra `DUMP_RBB_LAB_BASE_DIR/AAAA-MM` e `DUMP_RBB_PRD_BASE_DIR/AAAA-MM`, copiando apenas os arquivos efetivamente presentes e renomeando arquivos legados para o padrao `tipoAAAA-MM.csv`.
- A opcao 4 continua usando por default o CSV de blocos de producao em `DUMP_RBB_PRD_BASE_DIR/AAAA-MM/blocksAAAA-MM.csv`, grava o temporario em `result/AAAA-MM/prd/temp/blocksAAAA-MM.csv` e salva o resultado final em `result/AAAA-MM/prd/Blocos-estat.txt`.
- A opcao 5 consulta a API do GitHub no repositorio `RBBNet/incidentes`, usa `GITHUB_RBB_TOKEN` do `config.json`, pede apenas `MM/AAAA` e grava `result/AAAA-MM/prd/Incidentes.csv`.
- A opcao 6 publica os arquivos finais de `result/AAAA-MM/lab` e `result/AAAA-MM/prd` na raiz de `INDICADORES_BASE_DIR/AAAA-MM`, ignora `result/AAAA-MM/prd/temp` e tambem copia `result/nodes_lab.json` e `result/nodes_piloto.json`, depois de mostrar ao usuario as listas local e de destino.
- A opcao 7 gera o HTML operacional a partir dos arquivos em `INDICADORES_BASE_DIR/AAAA-MM`, monta uma tabela de producao para Prd com `Blocos.csv` e outra para Lab com `Blocos_lab.csv`, usa `Incidentes.csv` do ultimo mes da faixa quando existir, grava `Indicadores-operacao.html` em `result/AAAA-MM-final` e, se ja houver arquivo de mesmo nome em `INDICADORES_BASE_DIR/AAAA-MM-final`, pede confirmacao antes de sobrescrever a copia final.
- As celulas de percentagem de producao no HTML sao coloridas conforme `BLOCK_PRODUCTION_OLA_THRESHOLDS` do `config.json`, usando a quantidade de partícipes/validadores presente no CSV do ambiente para escolher os limiares de alerta amarelo e vermelho.
- Se nao houver OLA configurado para a quantidade de partícipes encontrada em um mes, o HTML continua sendo gerado sem coloracao para aquele caso e com aviso no terminal.
- Se faltar `Blocos.csv` ou `Blocos-estat.txt` em algum mes do periodo, esse mes e ignorado na consolidacao do HTML operacional.

## Perfil Evolucao

Use `node run-evolucao.js` para acessar:

1. Acompanhamento das Iniciativas de Maturacao do Piloto
2. Gerar HTML de Evolucao
3. Sair

Observacoes:

- O perfil de evolucao nao requer configuracao de SSH.
- O HTML de evolucao gera `result/Indicadores-evolucao.html`.
- O HTML de evolucao usa um arquivo `Iniciativas_YYYY-MM.csv` da pasta `result`.

## Seletor de Perfil

`node run.js` abre um menu simples para encaminhar o usuario ao perfil correto sem misturar as opcoes.

## Valores Padrao

- Datas: primeiro e ultimo dia do mes anterior
- Periodos mensais: mes anterior
- Username SSH: usuario logado no sistema
- Caminhos de arquivo: sugestoes baseadas na estrutura atual do projeto

Para aceitar um valor padrao, basta pressionar ENTER sem digitar nada.
