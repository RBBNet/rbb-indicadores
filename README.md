# RBB Indicadores

As ferramentas presentes nesse repositório servem de apoio à equipe da Rede Blockchain Brasil (RBB) para acompanhamento da operação e níveis de serviço da rede e evolução de atividades dos projetos do ecossistema.

As ferramentas realizam consultas aos nós da RBB, para a coleta de índices de Produção de Blocos, e consultas à API do GitHub para acompanhamento de incidentes e progresso de atividades de projetos.

## Requisitos

As ferramentas possuem os seguintes requisitos em comum:

- **NodeJS** na versão **22.11**
- **NPM** na versão **10.9.0**
- Arquivo **config.json**, que deve ser criado na pasta raiz deste projeto, com os seguintes parâmetros:
  - Não havendo proxy, pode-se criar o arquivo sem o parâmetro `PROXY_URL`
  - O token do GitHub deve ter os seguintes escopos para acesso aos repositórios privados:
    - **`repo`** (acesso completo a repositórios privados)
    - **`read:project`** (leitura de projetos)

```json
{   
    "GITHUB_RBB_TOKEN":"<github_api_token>",
    "PROXY_URL": "http://host:port",
    "ORG": "<organization_name>",
    "PROJECT_NUMBER": <project_number>
}
```

**Como gerar o token do GitHub com os escopos corretos:**

1. Acesse: https://github.com/settings/tokens
2. Clique em "Generate new token" → "Generate new token (classic)"
3. Dê um nome descritivo (ex: "RBB Indicadores")
4. Selecione os escopos:
   - ✅ **repo** (Full control of private repositories)
   - ✅ **read:project** (Read project data)
5. Clique em "Generate token"
6. **Copie o token imediatamente** (ele só será exibido uma vez)
7. Cole no arquivo `config.json` no campo `GITHUB_RBB_TOKEN`

## Ferramentas

- [Blocks](Blocks/README.md) - Gera indicadores sobre a produção de blocos.
- [Issues](Issues/README.md) - Coleta dados sobre o tratamento de incidentes.
- [Projects](Projects/README.md) - Gera indicadores sobre o andamento das atividades do projeto de Maturação do Piloto.

## Preparação do Ambiente

Para instalar as dependências desse projeto basta utilizar o seguinte comando na pasta raiz:

```javascript
npm install
```

## Execução das Ferramentas

Para facilitar a execução das ferramentas, você pode utilizar os scripts de menu interativo disponíveis:

### Windows (Batch)

```bat
run.bat
```

### Multiplataforma (Node.js)

```bash
node run.js
```

ou (se tiver permissões de execução no Linux/Mac):

```bash
./run.js
```

Ambos os scripts fornecem o mesmo menu interativo para escolher e executar as diferentes ferramentas disponíveis:

1. Métricas de Produção de Blocos
2. Estatísticas do Tempo de Produção de Blocos
3. Acompanhamento das Iniciativas de Maturação do Piloto
4. Issues em Produção
5. Sair

### Linux

Para executar o script no Linux, utilize o seguinte comando na pasta raiz do projeto:

```sh
./run.sh
```

### Menu de Ferramentas

O menu interativo permite escolher entre as seguintes opções:

1. **Métricas de Produção de Blocos**: Gera indicadores sobre a produção de blocos.
   - **Túnel SSH Automático**: Esta opção automaticamente estabelece um túnel SSH para o nó da RBB antes de coletar métricas.
   - Você pode escolher entre:
     - **Lab** (rbb-writer01.hom.bndes.net - 172.17.64.21)
     - **Prod** (vrt2675.bndes.net - 172.17.64.34)
     - **Customizado** (especificar manualmente IP, porta e host SSH)
   - O túnel é automaticamente encerrado após a coleta de dados.
   - Requer acesso SSH aos servidores da RBB.

2. **Estatisticas do Tempo de Producao de Blocos**: Calcula estatísticas do tempo de produção dos blocos.
3. **Acompanhamento das Iniciativas de Maturação do Piloto**: Gera indicadores sobre o andamento das atividades do projeto de Maturação do Piloto.
4. **Issues em Produção**: Coleta dados sobre o tratamento de incidentes.
5. **Sair**: Encerra o script.

**Siga as instruções no menu para fornecer os parâmetros necessários para cada ferramenta.**

### Valores Padrão Inteligentes

O script `run.js` oferece valores padrão inteligentes para facilitar a execução:

- **Datas**: Para todas as ferramentas que solicitam datas, o padrão é o primeiro e último dia do mês anterior.
- **Username SSH**: O padrão é o usuário logado no sistema (variável `%USERNAME%`).
- **Caminhos de arquivo**: Valores padrão baseados na estrutura do projeto.

Para aceitar um valor padrão, basta pressionar **ENTER** sem digitar nada.
