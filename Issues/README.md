# Issues em Produção

Essa ferramenta realiza consultas ao GitHub, através de sua API, para extração de dados relativos aos incidentes (issues) de produção em um determinado período de tempo. Um relatório é gerado e salvo em arquivo `.csv`, permitindo integração com ferramentas de análise de dados.

A ferramenta retorna todas as issues já fechadas que foram atualizadas pela última vez no período solicitado.

## Requisitos

Para utilizar esta ferramenta é necessário:

- Instalar as dependências do projeto (ver [README](../README.md) do projeto).
- **Possuir acesso ao repositório `incidentes`** no GitHub.
  - É necessário configurar um **token de acesso** à API do GitHub com os seguintes escopos:
    - `read:user`
    - `repo`
- **Criar o arquivo** `config.json` (ver exemplo abaixo) na pasta raiz contendo o token de acesso à API do GitHub.
- Caso a ferramenta seja utilizada em ambiente com proxy, configurar a URL do mesmo (ver exemplo abaixo).

Exemplo de arquivo `config.json`:

```json
{
    "GITHUB_RBB_TOKEN": "<token>",
    "PROXY_URL": "http://<host>:<port>"
}
```

Em caso de dúvidas sobre como gerar o Token de acesso à API do GitHub, confira [este Tutorial](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens#creating-a-personal-access-token-classic).

## Utilização

Os parâmetros que a ferramenta utiliza são passados por linha de comando nos seguintes formatos e ordem:

```bash
node Issues/issue-metrics.js <data inicial> <data final> [pasta-mensal]
```

Onde:

- `<data inicial>` e `<data final>` determinam o período de tempo a ser analizado.
  - `<data inicial>` deve ser anterior ou igual a `<data final>`.
  - `<data final>` deve ser anterior ou igual à data corrente.
  - Ambas as datas devem ser passadas obrigatoriamente no formato **DD/MM/AAAA**.
- `[pasta-mensal]` é opcional e define a subpasta de saída sob `result`, normalmente no formato `AAAA-MM`. Quando informada, a saída é gravada em `result/AAAA-MM/prd/Incidentes.csv`.

A ferramenta retorna mensagens como as exemplificadas abaixo e gera um arquivo CSV, conforme indicado:

```text
RETRIEVING ISSUES WITH TOKEN OWNED BY <TOKEN_OWNER> - @<TOKEN_OWNER_LOGIN>

--------------------------------------------------
ISSUES FOR incidente + PRD
--------------------------------------------------
┌─────────┬─────────┬────────────────────────┬──────────────┬──────────┬──────────┐
│ (index) │ title   │ labels                 │ assignees    │ DaysOpen │ state    │
├─────────┼─────────┼────────────────────────┼──────────────┼──────────┼──────────┤
│ 0       │ 'title' │ [ 'incidente', 'PRD' ] │ [ '@assignee]│ '41'     │ 'open'   │
└─────────┴─────────┴────────────────────────┴──────────────┴──────────┴──────────┘
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

Gerando arquivo Incidentes.csv...
Arquivo Incidentes.csv gerado em: result\2025-11\prd\Incidentes.csv
```

### Saída via Menu Interativo

Ao executar através do menu interativo de Operacao (`node run-operacao.js`), o processo é facilitado:

1. O script solicita apenas o mês de referência em `MM/AAAA`
2. Deriva internamente o primeiro e o último dia do mês informado
3. Usa `GITHUB_RBB_TOKEN` do `config.json` para consultar a API do GitHub no repositório `RBBNet/incidentes`
4. Grava a saída final em `result\AAAA-MM\prd\Incidentes.csv`

Exemplo de saída esperada:

```text
Gerando arquivo Incidentes.csv...
Arquivo Incidentes.csv gerado em: result\2025-11\prd\Incidentes.csv
```
