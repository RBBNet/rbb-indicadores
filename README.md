# RBB indicadores
As ferramentas presentes nesse repositório servem de apoio à equipe da Rede Blockchain Brasil (RBB) nos processos de Maturação da Rede, permitindo que sejam feitas consultas aos nós da RBB para a coleta de índices de Produção de Blocos, além de consultas à API do GITHUB para acompanhamento de issues e do Progresso nos projetos da Rede.

## Requisitos
Todas as ferramentas possuem os seguintes requisitos em comum quanto à versão do NodeJS que utilizam:
- **NodeJS** na versão **22.11** 
- **NPM** na versão **10.9.0**
- Arquivo **config.json** criado na pasta raiz do repositório com os campos:
  - Não havendo proxy, pode-se criar o arquivo sem o campo `PROXY_URL`
```json
{   
    "GITHUB_RBB_TOKEN":"<github_api_token>",
    "PROXY_URL": "http://host:port",
    "ORG": "<organization_name>",
    "PROJECT_NUMBER": <project_number>
}
```

### Requisitos Específicos
### Blocks [🔗](Blocks/README.md)
- **Acesso à algum nó** da RBB
- Arquivo com **metadados dos nós**

### ISSUES [🔗](Issues/README.md)
- **Acesso ao repositório** consultado
- **Token de acesso** à api do Github com os seguintes escopos:
  - read:user
  - repo

### Projects [🔗](Projects/README.md)
- **Token de acesso** à api do Github com os seguintes escopos:
  - read:user
  - repo
  - read:org
  - project
- **Python 3.11** ou superior instalado

## Preparação do ambiente

Para instalar as dependências desse projeto basta utilizar o seguinte comando na pasta raiz dessa aplicação:
```javascript
npm install
```

Para instalar as dependências python para a ferramenta Projects, basta utilizar o seguinte comando em sua console de preferência:
```bash
pip install pandas openpyxl
```