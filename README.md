# RBB Indicadores

As ferramentas presentes nesse repositório servem de apoio à equipe da Rede Blockchain Brasil (RBB) para acompanhamento da operação e níveis de serviço da rede e evolução de atividades dos projetos do ecossistema.

As ferramentas realizam consultas aos nós da RBB, para a coleta de índices de Produção de Blocos, e consultas à API do GitHub para acompanhamento de incidentes e progresso de atividades de projetos.

## Requisitos

As ferramentas possuem os seguintes requisitos em comum:

- **NodeJS** na versão **22.11**
- **NPM** na versão **10.9.0**
- **Python** com **pip** disponível no PATH (usado para instalar e executar `ethereum-etl`)
- Arquivo **config.json**, que deve ser criado na pasta raiz deste projeto a partir de **config.json.example**:

```bash
cp config.json.example config.json
```

No Windows (PowerShell):

```powershell
Copy-Item config.json.example config.json
```

Após criar o arquivo, preencha os seguintes parâmetros:
  - Não havendo proxy, pode-se criar o arquivo sem o parâmetro `PROXY_URL`
  - Para a opção de métricas de blocos com túnel SSH (Lab/Prod), preencha também `SSH.LAB` e `SSH.PROD`
  - O token do GitHub deve ter os seguintes escopos para acesso aos repositórios privados:
    - **`repo`** (acesso completo a repositórios privados)
    - **`read:project`** (leitura de projetos)

```json
{   
    "GITHUB_RBB_TOKEN":"<github_api_token>",
    "PROXY_URL": "http://host:port",
    "ORG": "<organization_name>",
  "PROJECT_NUMBER": <project_number>,
  "SSH": {
    "LAB": {
      "REMOTE_HOST": "<lab_remote_ip_or_host>",
      "REMOTE_PORT": "8545",
      "SSH_HOST": "<lab_ssh_host>"
    },
    "PROD": {
      "REMOTE_HOST": "<prod_remote_ip_or_host>",
      "REMOTE_PORT": "8545",
      "SSH_HOST": "<prod_ssh_host>"
    }
  }
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

Durante o `npm install`, o projeto também tenta instalar automaticamente o pacote Python `ethereum-etl` via `postinstall`.

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
5. Gerar HTML de Blocos
6. Exportar Blocos (ethereum-etl)
7. Sair

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
     - **Lab** (definido no `config.json`)
     - **Prod** (definido no `config.json`)
     - **Customizado** (especificar manualmente IP, porta e host SSH)
   - O túnel é automaticamente encerrado após a coleta de dados.
   - Requer acesso SSH aos servidores da RBB.

2. **Estatisticas do Tempo de Producao de Blocos**: Calcula estatísticas do tempo de produção dos blocos.
3. **Acompanhamento das Iniciativas de Maturação do Piloto**: Gera indicadores sobre o andamento das atividades do projeto de Maturação do Piloto.
4. **Issues em Produção**: Coleta dados sobre o tratamento de incidentes.
5. **Gerar HTML de Blocos**: Gera o relatório HTML de indicadores na pasta `result`.
6. **Exportar Blocos (ethereum-etl)**: Exporta dados de blocos para `result/blocos` usando `ethereumetl export_all`.
  - Datas padrão: primeiro e último dia do mês anterior.
  - Provider utilizado: `http://127.0.0.1:8545` (requer túnel SSH ativo).
7. **Sair**: Encerra o script.

**Siga as instruções no menu para fornecer os parâmetros necessários para cada ferramenta.**

### Valores Padrão Inteligentes

O script `run.js` oferece valores padrão inteligentes para facilitar a execução:

- **Datas**: Para todas as ferramentas que solicitam datas, o padrão é o primeiro e último dia do mês anterior.
- **Username SSH**: O padrão é o usuário logado no sistema (variável `%USERNAME%`).
- **Caminhos de arquivo**: Valores padrão baseados na estrutura do projeto.

Para aceitar um valor padrão, basta pressionar **ENTER** sem digitar nada.
