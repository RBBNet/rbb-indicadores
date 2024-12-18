const axios = require('axios');
const ethers = require('ethers');
const helpers = require('./helpers.js');
const nodeFunctions = require('./nodeFunctions.js');

async function blockProductionMetrics(first_block_number, last_block_number, nodesByIdMap) {
    try {
        let url = 'http://localhost:8545';
        const response = await axios.post(url, {
            jsonrpc: "2.0",
            method: "qbft_getSignerMetrics",
            params: [`${first_block_number}`, `${last_block_number}`],
            id: 1
        });

        const metrics = response.data.result;
        let responseBody = await nodeFunctions.translateMetrics(metrics, nodesByIdMap);
        return responseBody;
    } catch (e) {
        console.log(e);
        throw e; // Re-throw the error for the caller to handle
    }
}

async function getMetrics(){
    //obtendo parametros
    let date_first = process.argv[2];
    let date_last = process.argv[3];
    let json_rpc_address = process.argv[4];
    let first_block_number, last_block_number;

    try{
        //estabelecendo conexão com a rede
        const provider = new ethers.JsonRpcProvider(json_rpc_address);
    
        //validando datas de inicio e fim
        date_first = helpers.string_to_date(date_first);
        if (helpers.validate_date(date_first) === false) {
            throw new Error("Por favor, insira uma data válida. O formato esperado é DD/MM/AAAA");
        } 
    
        date_last = helpers.string_to_date(date_last);
        if (helpers.validate_date(date_last) === false) {
            throw new Error("Por favor, insira uma data válida. O formato esperado é DD/MM/AAAA");
        } 
    
        if (date_last < date_first){
            throw new Error("Por favor, insira uma data final que seja após a primeira data.");
        }

        date_last = helpers.update_date_last(date_last);

        console.log("\n------------------ Obtendo Informações para o seguinte período --------------------\n");
        console.log(`\tINICIO: ${date_first} \n\tFIM: ${date_last}\n`);

        first_block_number = await helpers.gets_block_number_by_date(date_first, provider);
        last_block_number = (await helpers.gets_block_number_by_date(date_last, provider));

        console.log("\n------------------ Número de Blocos Obtidos --------------------\n");
        console.log(`\t| ${first_block_number} || ${date_first} | \n\t| ${last_block_number} || ${date_last} |`);
 
    } catch (e) {
        console.log("Erro na execução do script. ");
        if (e.code === 'ERR_INVALID_ARG_TYPE'){
            console.log("Verifique se todos os parâmetros estão presentes.");
        }
        if (e.reason === 'could not detect network') {
            console.log("Verifique se o endereço JSON-RPC está correto.");
        }
    
        else {
            console.log(e);
        }
    }

    console.log('\nCarregando dados dos nós...');
    const nodesJsonPiloto = helpers.lerArquivo('../nodes_piloto.json');
    const nodesJsonLab = helpers.lerArquivo('../nodes_lab.json');
    const nodesByPubKeyMap = new Map();
    const nodesByIdMap = new Map();
    nodeFunctions.mapNodes(nodesJsonPiloto, 'piloto', nodesByPubKeyMap, nodesByIdMap);
    nodeFunctions.mapNodes(nodesJsonLab, 'lab', nodesByPubKeyMap, nodesByIdMap);

    console.log('\nObtendo Métricas de Produção de Blocos...');

    const result = await blockProductionMetrics(first_block_number, last_block_number, nodesByIdMap);

    console.log("\n------------------ Métricas --------------------\n");

    let blocksProducedREAL = last_block_number-first_block_number+1;
    
    //obtendo valor em ms e passando para segundos
    let date_first_seconds = date_first.valueOf()/1000;    
    let date_last_seconds = date_last.valueOf()/1000;
    let blocksProducedIDEAL = parseInt((date_last_seconds - date_first_seconds + 1)/4)
    let blocksProductionRate = blocksProducedREAL/blocksProducedIDEAL;

    console.log(`Blocos Produzidos de fato: ${blocksProducedREAL}`);
    console.log(`Blocos Produzidos ideal: ${blocksProducedIDEAL}\n`);
    console.log(`Taxa de Produção de Blocos: ${blocksProductionRate.toFixed(2)*100}%`);

    let productionAvgIdeal = blocksProducedIDEAL/result.length;
    let productionAvgREAL = blocksProducedREAL/result.length;
    let individualProductionRate = (productionAvgIdeal + productionAvgREAL)/2;

    console.log(`Taxa Individual de Produção de Blocos no período: ${individualProductionRate.toFixed(0)}`);

    console.log("\n------------------ Lista de Nós --------------------\n");
    
    //sorting by proposedBlockCount descending and organization ascending
    result.sort((a, b) => {
        let comp = b.proposedBlockCount - a.proposedBlockCount;
        if(comp == 0) {
            comp = a.organization.localeCompare(b.organization);
        }
        return comp;
    });

    //printing as table
    console.table(result.map(node => ({
        organization: node.organization,
        proposedBlockCount: node.proposedBlockCount
    })));
  
}

getMetrics();
