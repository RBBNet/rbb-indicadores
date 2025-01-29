# Acompanhamento das Iniciativas de Maturação do Piloto
Essa ferramenta realiza consultas ao GitHub, através de sua API, para extração de dados relativos ao projeto de Maturação do Piloto, para acompanhamento das atividades.

# Requisitos
Para utilizar essa ferramenta é necessário: 
- Satisfazer as condições gerais de utilização presentes no [README do projeto](../README.md)
- **Possuir acesso ao projeto** (Kanbam) requisitado.
  - É necessário configurar um **token de acesso** à API do GitHub com os seguintes escopos:
    - `read:user`
    - `repo`
    - `read:org`
    - `project`
- **Python 3.11** ou superior instalado
- Bibliotecas `pandas` e `openpyxl` instaladas para sua distribuição do Python
- Configurar os parâmetros `ORG` e `PROJECT_NUMBER` ao arquivo `config.json`, contendo a organização da qual deseja-se acessar e o identificador do projeto em questão. De maneira geral, esses parâmetros serão configurados com:
  - `ORG`: `RBBNet`
  - `PROJECT_NUMBER`: `4`

## Utilização
A ferramenta disponibiliza dois scripts de mesmo nome responsáveis por acioná-la, um para windows e outro para Linux, bastando o usuário atender as condições de utilização e acionar o script referente ao seu sistema operacional na pasta `Projects/`:

```bash
run-etl
```

## Funcionamento
### 1. Carga de dados
A primeira etapa consiste em duas consultas à API do Github, uma de acesso ao Kanbam, a fim de obter as issues associadas aos Cards, e outra para obter os eventos de timeline dessas issues. Durante a execução serão gerados dois arquivos no diretório `Projects/tmp`, uma para as issues associadas aos cards e outro para os eventos dessas issues.

### 2. Processamento das informações
Passada essa etapa, os arquivos serão processados a fim de registrar o status das iniciativas. Para isso, são utilizados três códigos, cada um representando uma situação:
 - **2**, se houve progresso no mês de registro
 - **1**, se houve progresso no mês anterior, mas não no mês de registro
 - **-1**,  se nunca houve progresso algum

 Essa etapa consiste em iterar a coluna dos IDs das iniciativas cadastradas, a fim de encontrar issues com esses IDs em seus títulos, já que a relação entre **Iniciativa X Issue** é da ordem de **1:N** . 
 Quando a ferramenta encontra uma issue que referencia o ID em questão, acessa os comentários dessa issue, a fim de buscar algum com a tag `#andamento`, o marcador de progresso, e atribuir o valor 2 a esse evento, conferindo progresso à issue.

 Caso haja alguma issue referenciando um ID, porém sem eventos, a ferramenta verifica se há algum registro anterior de progresso, o que, nesse caso, implica que a iniciativa recebrá o valor **1** para o mês em questão. Caso contrário, será atribuído o valor **-1** à iniciativa.

### 3. Busca por inconsistências

Em seguida, os resultados serão processados pela função `filter_merged_df()` para que sejam eliminados valores conflitantes em um mesmo período de tempo.

Essa etapa consiste em ordenar os eventos por issue, mês e valor de progresso atribuído de forma ascendente, exceto pelo progresso, para que, por fim, cada subconjunto de eventos com os mesmos identificador de issue e mês seja filtrado mantendo apenas o primeiro valor, o qual será o maior.

Por exemplo, se houver duas issues referenciando um mesmo ID, porém uma registra progresso em um mês e a outra não, permanecerá aquela no registro, e essa será eliminada.

### 4. Registro dos resultados
Por fim, os valores são atualizados na estrutura de dados que espelha a base de dados das Iniciativas, a qual, em seguida, é salva em arquivo `.csv`, que pode ser acessado pelo caminho: `Projects/result/iniciativas_updated.csv`.


