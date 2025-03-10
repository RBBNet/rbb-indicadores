import axios from 'axios';
import { ethers } from 'ethers';
import helpers from './helpers.js';
import nodeFunctions from './node-functions.js';
import fs from 'fs';
import { addDays } from 'date-fns';

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
        let nodesJsonLab = helpers.lerArquivo(arquivo);
        nodeFunctions.mapNodes(nodesJsonLab, rede, nodesByIdMap);
        console.log(` - ${rede}: ${arquivo}`);
    } 
}

async function getMetrics(){
    //obtendo parametros
    if(process.argv.length != 6){
        console.error('Parâmetros incorretos.\nInsira conforme o exemplo: node block-metrics.js <data-inicial> <data-final> <url-json-rpc> <caminho-nodes-json>\n');
        return;
    }
    
    let date_first = process.argv[2];
    let date_last = process.argv[3];
    const json_rpc_address = process.argv[4];
    const nodes_json_folder_path = process.argv[5]; 
    
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

    console.log(`Data inicial:      ${date_first.getDate()}/${date_first.getMonth()+1}/${date_first.getFullYear()}`);
    console.log(`Data final:        ${date_last.getDate()}/${date_last.getMonth()+1}/${date_last.getFullYear()} `);

    // Adiciona 1 dia à data final, para equivaler a <data_final> 24:00:00 -> Intervalo aberto no final do período
    const date_last_ref = addDays(date_last, 1);

    const first_block_number = await helpers.gets_block_number_by_date(date_first, provider);
    // Diminui 1 bloco, pois utilizando date_last_ref obtem-se o primeiro bloco do dia seguinte à data final
    const last_block_number = await helpers.gets_block_number_by_date(date_last_ref, provider) - 1;

    const blocksProducedREAL = last_block_number-first_block_number+1;
    const date_first_seconds = date_first.valueOf()/1000;
    const date_last_ref_seconds = date_last_ref.valueOf()/1000;
    const blocksProducedIDEAL = parseInt((date_last_ref_seconds - date_first_seconds)/4)
    const blocksProductionRate = (blocksProducedREAL/blocksProducedIDEAL) * 100;

    // Calcula o tempo total em segundos entre o primeiro e o último bloco
    const productionTimeInSeconds = date_last_ref_seconds - date_first_seconds;
    // Divide o tempo pelo número total de blocos produzidos realmete
    const averageBlockProductionTime = productionTimeInSeconds / blocksProducedREAL;
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

    let responses = [];
    const INTERVAL_DAYS = 7; // Padrão de intervalo de tempo

    let start_block = first_block_number;
    let date_start = date_first;
    while (date_start < date_last_ref) {
        let step_date_ref = addDays(date_start, INTERVAL_DAYS);
        // Ajusta o intervalo se os dias restantes forem menores que o intervalo padrão
        if (step_date_ref > date_last_ref) {
            step_date_ref = date_last_ref;
        }

        // Data apenas para exibição na console
        const step_date = addDays(step_date_ref, -1);
        console.log(`PERÍODO ${date_start.getDate()}/${date_start.getMonth() + 1}/${date_start.getFullYear()} A ${step_date.getDate()}/${step_date.getMonth() + 1}/${step_date.getFullYear()}`);
        
        // Não diminui um bloco (como feito acima para last_block_number), pois a API do Besu espera intervalo aberto no parâmetro de bloco final
        const step_block = await helpers.gets_block_number_by_date(step_date_ref, provider);

        responses.push(await blockProductionMetrics(json_rpc_address, start_block, step_block, nodesByIdMap));
        
        date_start = step_date_ref;
        start_block = step_block;
    }

    responses = responses.flat();
    const result = Object.values(responses.reduce((acc, curr) => {
        if (!acc[curr.organization]) {
            acc[curr.organization] = {
                organization: curr.organization,
                proposedBlockCount: 0,
                lastProposedBlockNumber: 0
            };
        }
        acc[curr.organization].proposedBlockCount += curr.proposedBlockCount;
        acc[curr.organization].lastProposedBlockNumber = Math.max(acc[curr.organization].lastProposedBlockNumber, curr.lastProposedBlockNumber);
        return acc;
    }, {}));
    
    result.sort((a, b) => a.organization.localeCompare(b.organization));
    console.log(`Bloco inicial:     ${first_block_number}`);
    console.log(`Bloco final:       ${last_block_number}`);
    console.log(`Blocos produzidos: ${blocksProducedREAL}`);
    console.log(`Qtd máx ideal:     ${blocksProducedIDEAL}`);
    console.log(`Rendimento:        ${blocksProductionRate.toFixed(2)}%`);
    console.log(`Tempo médio/bloco: ${averageBlockProductionTime.toFixed(3)} segundos`);
    
    let filteredResults = result.map(node => ({
        'Organização': node.organization,
        'Blocos produzidos': node.proposedBlockCount,
        }));

    let file_header =
        `Data inicial;${date_first.getDate()}/${date_first.getMonth() + 1}/${date_first.getFullYear()}
Data final;${date_last.getDate()}/${date_last.getMonth() + 1}/${date_last.getFullYear()}
Bloco inicial;${first_block_number}
Bloco final;${last_block_number}
Blocos produzidos;${blocksProducedREAL}
Qtd max ideal;${blocksProducedIDEAL}
Rendimento;${(blocksProductionRate.toFixed(2)).replace('.', ',')}
Tempo medio/bloco (s);${(averageBlockProductionTime.toFixed(3)).replace('.', ',')}\n
Organizacao; Blocos Produzidos\n`;
        console.table(filteredResults);
        
    helpers.write_csv(file_header,filteredResults);
}

getMetrics();
