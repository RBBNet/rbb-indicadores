const axios = require('axios');
const ethers = require('ethers');
const helpers = require('./helpers.js');
const nodeFunctions = require('./nodeFunctions.js');
const fs = require("fs");

async function blockProductionMetrics(url, first_block_number, last_block_number, nodesByIdMap) {
    const response = await axios.post(url, {
        jsonrpc: "2.0",
        method: "qbft_getSignerMetrics",
        params: [`${first_block_number}`, `${last_block_number}`],
        id: 1
    });
    const metrics = response.data.result;
    const responseBody = await nodeFunctions.translateMetrics(metrics, nodesByIdMap);
    return responseBody;
}

function mapNodes(nodesByIdMap, nodes_json_folder_path, rede) {
    const arquivo = nodes_json_folder_path + '/nodes_' + rede + '.json';
    if (fs.existsSync(arquivo)) {     
        nodesJsonLab = helpers.lerArquivo(arquivo);
        nodeFunctions.mapNodes(nodesJsonLab, rede, nodesByIdMap);
        console.log(` - ${rede}: ${arquivo}`);
    } 
}

async function getMetrics(){
    //obtendo parametros
    let first_block_number, last_block_number;
    let date_first, date_last;
    let json_rpc_address;
    let nodes_json_folder_path;

    if(process.argv.length != 6){
        console.error('Parâmetros incorretos.\nInsira conforme o exemplo: node metrics.js <data-inicial> <data-final> <url-json-rpc> <caminho-nodes-json>\n');
        return;
    }
    
    date_first = process.argv[2];
    date_last = process.argv[3];
    json_rpc_address = process.argv[4];
    nodes_json_folder_path = process.argv[5]; 
    
    let provider;
    try{
        //estabelecendo conexão com a rede
        provider = new ethers.JsonRpcProvider(json_rpc_address);
    }
    catch(e) {
        if(e.reason === 'could not detect network') {
            console.log("Verifique se o endereço JSON-RPC está correto.");
            return;
        }
        throw e;
    }
    
    //validando datas de inicio e fim
    date_first = helpers.string_to_date(date_first);
    if (helpers.validate_date(date_first) === false) {
        console.log("Por favor, insira uma data válida. O formato esperado é DD/MM/AAAA");
        return;
    } 
    
    date_last = helpers.string_to_date(date_last);
    if (helpers.validate_date(date_last) === false) {
        console.log("Por favor, insira uma data válida. O formato esperado é DD/MM/AAAA");
        return;
    } 

    if (date_last < date_first){
        console.log("Por favor, insira uma data final que seja após a primeira data.");
        return;
    }

    date_last = helpers.update_date_last(date_last);
    
    console.log(`Data inicial:      ${date_first.getDate()}/${date_first.getMonth()+1}/${date_first.getFullYear()}`);
    console.log(`Data final:        ${date_last.getDate()}/${date_last.getMonth()+1}/${date_last.getFullYear()} `);
    
    first_block_number = await helpers.gets_block_number_by_date(date_first, provider);
    last_block_number = (await helpers.gets_block_number_by_date(date_last, provider));

    console.log(`Bloco inicial:     ${first_block_number}`);
    console.log(`Bloco final:       ${last_block_number}`);
    
    let nodesJsonPiloto, nodesJsonLab;
    const nodesByIdMap = new Map();

    console.log("Carregando arquivos node.json:");

    if(fs.existsSync(nodes_json_folder_path) && fs.lstatSync(nodes_json_folder_path).isDirectory()) {
        mapNodes(nodesByIdMap, nodes_json_folder_path, 'lab');
        mapNodes(nodesByIdMap, nodes_json_folder_path, 'piloto');
    } 
    else {
        console.error('O parâmetro passado para os arquivos de metadados deve ser uma pasta');
        return;
    }

    const result = await blockProductionMetrics(json_rpc_address, first_block_number, last_block_number, nodesByIdMap);
    let blocksProducedREAL = last_block_number-first_block_number+1;
    
    //converting date from milisseconds to seconds
    let date_first_seconds = date_first.valueOf()/1000;    
    let date_last_seconds = date_last.valueOf()/1000;
    let blocksProducedIDEAL = parseInt((date_last_seconds - date_first_seconds + 1)/4)
    let blocksProductionRate = blocksProducedREAL/blocksProducedIDEAL;

    console.log(`Blocos produzidos: ${blocksProducedREAL}`);
    console.log(`Qtd máx ideal:     ${blocksProducedIDEAL}`);
    console.log(`Rendimento:        ${blocksProductionRate.toFixed(2)*100}%`);

    //sorting by proposedBlockCount descending and organization ascending
    result.sort((a, b) => {
        let comp = b.proposedBlockCount - a.proposedBlockCount;
        if(comp == 0) {
            comp = a.organization.localeCompare(b.organization);
        }
        return comp;
    });
    
    //printing as table
    filteredResults = result.map(node => ({
        'Organização': node.organization,
        'Blocos produzidos': node.proposedBlockCount
    }));

    console.table(filteredResults);

    file_header = 
`Data inicial;${date_first.getDate()}/${date_first.getMonth()+1}/${date_first.getFullYear()}
Data final;${date_last.getDate()}/${date_last.getMonth()+1}/${date_last.getFullYear()}
Bloco inicial;${first_block_number}
Bloco final;${last_block_number}
Blocos produzidos;${blocksProducedREAL}
Qtd máx ideal;${blocksProducedIDEAL}
Rendimento;${blocksProductionRate.toFixed(2)}

Organização;Blocos Produzidos\n`;

    helpers.write_csv(file_header,filteredResults);
}

getMetrics();
