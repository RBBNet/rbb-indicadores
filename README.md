# RBB indicadores
As ferramentas presentes nesse repositório servem de apoio à equipe da Rede Blockchain Brasil (RBB) para acompanhamento da operação e níveis de serviço da rede e evolução de atividades dos projetos do ecossistema.

As ferramentas realizam consultas aos nós da RBB, para a coleta de índices de Produção de Blocos, e consultas à API do GitHub para acompanhamento do progresso de atividades (issues) nos projetos da rede.

## Requisitos
As ferramentas possuem os seguintes requisitos em comum:
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

## Ferramentas

- [Blocks](Blocks/README.md) - Gera indicadores sobre a produção de blocos.
- [Issues](Issues/README.md) - Coleta dados sobre o tratamento de incidentes.
- [Projects](Projects/README.md) - Gera indicadores sobre o andamento das atividades do projeto de Maturação do Piloto.

## Preparação do ambiente

Para instalar as dependências desse projeto basta utilizar o seguinte comando na pasta raiz:
```javascript
npm install
```
Para instalar as dependências python para a ferramenta Projects, basta utilizar o seguinte comando em sua console de preferência:
```bash
pip install pandas openpyxl
```
