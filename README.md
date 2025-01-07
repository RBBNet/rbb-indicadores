# Ferramenta para coleta de inidicadores de participação
Essa ferramenta permite que sejam feitas consultas à RBB quanto as métricas dos partícipes em relação a sua produção de blocos individual, e geral em um determinado período de tempo. Além disso o relatório gerado é salvo em arquivo `.csv`, permitindo integração com ferramentas de análise de dados.

## Preparação do ambiente
Para utilizar essa ferramenta é necessário:
- Acesso a algum nó da RBB
- Arquivo com metadados dos nós
- **NodeJS** na versão **22.11** 
- **NPM** na versão **10.9.0**

Para instalar as dependências desse projeto basta utilizar o seguinte comando na pasta raiz dessa aplicação:
```javascript
npm install
```

## 1. Métricas de Produção de Blocos

Os parâmetros que a ferramenta utiliza são passados por linha de comando nos seguintes formatos e ordem:
```bash
node Blocks\block-metrics.js <data inicial> <data final> <provider> <endereço_do_nodes.json>
```
Onde:
- `<data inicial>` e `<data final>` determinam o período de tempo a ser analizado. Sendo necessariamente, a `<data inicial>` anterior a `<data final>`
    - Ambas as datas devem ser passadas obrigatoriamente no formato **DD/MM/AAAA**.
    
- `<provider>` é o endereço http para o qual se pode enviar chamadas JSON-RPC aos nós BESU. Normalmente `http://localhost:8545`

- `<endereço_do_nodes.json>` refere-se ao **path** até o arquivo contendo os metadados dos nós. O arquivo json deve ter o nome no formato `nodes_rede.json`.

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
## 2. Issues em Produção
Para utilizar esta ferramenta é necessário **possuir previamente o acesso ao repositório acessado**. Além disso, é preciso **criar o arquivo** `config.json` na pasta raiz contendo o token de acesso à API do github e, caso a ferramenta seja utilizada em ambiente com proxy, a URL desse, conforme o exemplo abaixo:

```json
{
    "GITHUB_RBB_TOKEN": "<token>",
    "PROXY_URL": "http://<host>:port"
}
```
Caso não haja proxy, basta adicionar o Token de acesso ao github, conforme o exemplo:
```json
{
    "GITHUB_RBB_TOKEN": "<token>"
}
```

- Em caso de dúvidas sobre como gerar o Token de acesso à API do Github, confira o [link para o Tutorial](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens#creating-a-personal-access-token-classic).

Uma vez criado o arquivo, basta utilizar o comando abaixo:
```bash
node Issues/issue-metrics.js
```

O qual retornaria, por exemplo:

```text
RETRIEVING ISSUES WITH TOKEN OWNED BY <TOKEN OWNER> - @<TOKEN OWNER LOGIN>

--------------------------------------------------
ISSUES FOR incidente + PRD
--------------------------------------------------
[
  {
    url: 'https://.....',
    title: 'Lorem Ipsilum',
    number: xx,
    id: xxxxxxxxxx,
    labels: [ 'incidente', 'PRD' ],
    state: 'closed',
    assignees: [],
    created_by: '@randomuser',
    created_at: '30/10/2024',
    updated_at: '10/12/2024',
    closed_by: '@anotheruser',
    closed_at: '10/12/2024',
    DaysOpen: 'xx'
  },
  ...
]

--------------------------------------------------
ISSUES FOR incidente-critico + PRD
--------------------------------------------------
No issues found for label: incidente-critico + PRD

--------------------------------------------------
ISSUES FOR vulnerabilidade + PRD
--------------------------------------------------
No issues found for label: vulnerabilidade + PRD

--------------------------------------------------
ISSUES FOR vulnerabilidade-critica + PRD
--------------------------------------------------
No issues found for label: vulnerabilidade-critica + PRD
```

## Observação:
1. Para utilizar essa ferramenta é necessário possuir o acesso ao repositório.
