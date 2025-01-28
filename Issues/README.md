## Issues em Produção
Para utilizar esta ferramenta é necessário **possuir previamente o acesso ao repositório**. Além disso, é preciso **criar o arquivo** `config.json` na pasta raiz contendo o token de acesso à API do github e, caso a ferramenta seja utilizada em ambiente com proxy, a URL desse, conforme o exemplo abaixo:

```json
{
    "GITHUB_RBB_TOKEN": "<token>",
    "PROXY_URL": "http://<host>:<port>"
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
RETRIEVING ISSUES WITH TOKEN OWNED BY <TOKEN_OWNER> - @<TOKEN_OWNER_LOGIN>

--------------------------------------------------
ISSUES FOR incidente + PRD
--------------------------------------------------
┌─────────┬─────────┬────────────────────────┬───────────────┬──────────┐
│ (index) │ title   │ labels                 │ assignees     │ DaysOpen │
├─────────┼─────────|────────────────────────┼───────────────┼──────────┤
│ 0       │ 'title' │ [ 'incidente', 'PRD' ] │ [ '@assignee] │ '41'     │
└─────────┴─────────┴────────────────────────┴───────────────┴──────────┘

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

Gerando Arquivo issues.csv...
 - Arquivo issues.csv gerado com sucesso no caminho: Issues\results\issues.csv.
```