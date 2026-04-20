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
2. Publica dump RBB para pasta da rede
3. Metricas de Producao de Blocos
4. Estatisticas do Tempo de Producao de Blocos
5. Issues em Producao
6. Gerar HTML Operacional
7. Help
8. Sair

Observacoes:

- O dump local e as metricas de blocos usam tunel SSH com ambiente Lab ou Prd configurado no `config.json`.
- O dump local mensal e salvo em `result/dump/lab/AAAA-MM/blocksAAAA-MM.csv` ou `result/dump/prd/AAAA-MM/blocksAAAA-MM.csv`.
- A publicacao para rede procura os dumps locais do mes informado, copia para a raiz de `DUMP_RBB_LAB_BASE_DIR/AAAA-MM` e `DUMP_RBB_PRD_BASE_DIR/AAAA-MM` apenas os arquivos efetivamente presentes e renomeia arquivos legados para o padrao `tipoAAAA-MM.csv`.
- O HTML operacional gera `result/Indicadores-operacao.html`.
- O HTML operacional usa o historico em `INDICADORES_BASE_DIR` e inclui incidentes quando `result/Incidentes.csv` estiver disponivel.
- Se `result/Incidentes.csv` nao existir, o HTML e gerado sem a secao de incidentes e o aviso aparece no terminal.
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
