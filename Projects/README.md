# Acompanhamento das Iniciativas de Maturação do Piloto

Essa ferramenta realiza consultas ao GitHub, através de sua API, para extração de dados relativos ao projeto de Maturação do Piloto, para acompanhamento das atividades.

## Requisitos

Para utilizar essa ferramenta é necessário:

- Satisfazer as condições gerais de utilização presentes no [README do projeto](../README.md)
- **Possuir acesso ao projeto** (Kanbam) requisitado.
  - É necessário configurar um **token de acesso** à API do GitHub com os seguintes escopos:
    - `read:user`
    - `repo`
    - `read:org`
    - `project`
- Configurar os parâmetros `ORG` e `PROJECT_NUMBER` ao arquivo `config.json`, contendo a organização da qual deseja-se acessar e o identificador do projeto em questão. De maneira geral, esses parâmetros serão configurados com:
  - `ORG`: `RBBNet`
  - `PROJECT_NUMBER`: `4`

## Utilização

Os parâmetros que a ferramenta utiliza são passados por linha de comando nos seguintes formatos e ordem:

```bash
node Project\project-metrics.js <mes-referencia>/<ano-referencia> <caminho-csv-iniciativas>
```

Onde:
- `<mes-referencia>` e `<ano-referencia>` determinam o período de tempo a ser analizado.
  - `<mes-referencia>` deve ser anterior ou igual ao mês corrente.
  - `<ano-referencia>` deve ser anterior ou igual ao ano corrente.
  - Ambas as datas devem ser passadas obrigatoriamente no formato **MM/AAAA**.
- `<caminho-csv-iniciativas>` indica o caminho para o arquivo CSV de entrada com os dados das iniciativas da Maturação do Piloto a serem acompanhadas.

O CSV de iniciativas deve serguir o seguinte formato:

| ID                                       | Iniciativa                   | Responsáveis | `<01/MM/AAAA>` | `<01/MM/AAAA>` | `<01/MM/AAAA>` | ... |
| ---------------------------------------- | ---------------------------- | ------------ | -------------- | -------------- | -------------- | --- |
| \[Revisão do Permissionamento\]\[BNDES\] | Ajustes Permissionamento     | BNDES        | Andamento      | ...            | ...            | ... |
| \[Rotação de Validadores\]\[BNDES\]      | Rotação de Validadores       |              | Sem_andamento  | ...            | ...            | ... |
| \[Ferramentas\]\[Indicadores\]           | Ferramentas para Indicadores |              | Andamento      | ...            | ...            | ... |
| \[observer-boot\]\[BNDES\]               | Observer boot                | BNDES        | Encerrado      | ...            | ...            | ... |
| \[`<ID>`\]\[`<ID>`\]                     | ...                          | ...          | `<situacao>`   | `<situacao>`   | `<situacao>`   | ... |
| ...                                      | ...                          | ...          | ...            | ...            | ...            | ... |

Onde:
- \[`<ID>`\]: São os identificadores com os quais são marcadas as *issues* do projeto, em seu título, para que se possa vinculá-las ao acompanhamento.
  - Os indentificadores têm que estar entre colchetes.
  - Espera-se a marcação de dois identificadores nas *issues*, onde o segundo geralmente indica a organização responsável.
- `<01/MM/AAA>`: Indica o mês de referência para acompanhamento.
  - A data deve ser sempre no dia 1º do mês indicado.
- `<situacao>`: Indica a situação da iniciativa naquele mês:
  - `Andamento`: Houve progresso para a iniciativa no mês
  - `Sem_andamento`: A iniciativa já foi iniciada em algum momento passado, mas não houve progresso no mês
  - `Nao_iniciado`: A iniciativa ainda não foi iniciada.
  - `Encerrado`: A iniciativa já foi encerrada.

Ao ser executada, a ferramenta:
- Consultará o projeto informado (`PROJECT_NUMBER`) no GitHub, para que sejam buscados os *cards* das colunas `In Progress` e `Done`.
  - Somente serão considerados *cards* que correspondam a *issues* cadastradas em algum repositório.
  - Somente serão consideradas as issues que tenham em seu título identificadores registrados no CSV de entrada.
- Para cada *issue* obtida serão buscados comentários que contenham em seu corpo a *tag* `#andamento` e tenham sido registrados no período informado.

Ao final da execução, a ferramenta gerará os seguintes arquivos, em formato CSV, na pasta `result`:
- `Issues.csv`: Contendo as *issues* identificadas para o projeto.
- `Comentarios.csv`: Contendo todos os comentários encontrados para as *issues* no período informado.
- `Iniciativas_updated.csv`: Contendo as iniciativas, conforme reportadas no arquivo de entrada, porém com a atualização da situação na coluna correspondente ao período informado.
