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

## Utilização
Os parâmetros que a ferramenta utiliza são passados por linha de comando nos seguintes formatos e ordem:
```bash
node metrics.js <data inicial> <data final> <provider> <nome da rede> <endereço_do_nodes.json>
```
Onde:
- `<data inicial>` e `<data final>` determinam o período de tempo a ser analizado. Sendo necessariamente, a `<data inicial>` anterior a `<data final>`
    - Ambas as datas devem ser passadas obrigatoriamente no formato **DD/MM/AAAA**.
    
- `<provider>` é o endereço http para o qual se pode enviar chamadas JSON-RPC aos nós BESU. Normalmente `http://localhost:8545`

- `<nome da rede>` determina para qual rede as métricas são solicitadas, podendo ser `lab` ou `piloto`

- `<endereço_do_nodes.json>` refere-se ao **path** até o arquivo contendo os metadados dos nós

Dessa forma, uma possível execução dessa ferramenta seria:
```bash
node metrics.js 27/11/2024 11/12/2024 http://localhost:8545 piloto ./nodes.json
```

A qual retornaria, por exemplo:
```bash
Data inicial:      Tue Nov 26 2024 21:00:00 GMT-0300 (Horário Padrão de Brasília)
Data final:        Wed Dec 11 2024 21:00:00 GMT-0300 (Horário Padrão de Brasília)
Bloco inicial:     8625648
Bloco final:       8869664
Blocos produzidos: 244017
Qtd máx ideal:     324000
Rendimento:        75%
┌─────────┬─────────────┬───────────────────┐
│ (index) │ Organização │ Blocos produzidos │
├─────────┼─────────────┼───────────────────┤
│ 0       │'organizacao'│ 12345             │
│ ...     │ '....'      │ ....              │
└─────────┴─────────────┴───────────────────┘
Arquivo CSV gerado com sucesso
```