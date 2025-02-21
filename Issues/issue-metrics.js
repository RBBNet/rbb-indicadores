import functions from './issue-functions.js';
import fs from 'fs';
import path from 'path';
import { exit } from 'process';
let labels = ['incidente','incidente-critico', 'vulnerabilidade','vulnerabilidade-critica'];

async function listIssues() {
    try {

        if(process.argv.length != 4){
            console.error('Parâmetros incorretos.\nInsira conforme o exemplo: node issue-metrics.js <data-inicial> <data-final>\n');
            exit(1);
        }

        let date_first = process.argv[2];
        let date_last = process.argv[3];

        //validando datas de inicio e fim
        date_first = functions.string_to_date(date_first);
        if (functions.validate_date(date_first) === false) {
            console.log("Por favor, insira uma data válida. O formato esperado é DD/MM/AAAA");
            exit(1);
        } 
        
        date_last = functions.string_to_date(date_last);
        if (functions.validate_date(date_last) === false) {
            console.log("Por favor, insira uma data válida. O formato esperado é DD/MM/AAAA");
            exit(1);
        } 
        
        let fileData = 'number;title;labels;assignees;daysOpen;state';
        let allOpenIssues = [];

        for (const label of labels) {
            /*
            * API call parameters fetching for each label in labels and PRD issues
            * If needed, remove/add parameters in this map
            * except for 'owner', 'repo' and 'headers'  
            */
            const params = {
                owner: 'RBBNet',
                repo: 'incidentes',
                state: 'all',
                labels: `${label},PRD`,
                since: date_first.toISOString(),
                headers: {
                    'X-GitHub-Api-Version': '2022-11-28'
                }
            };

            const allIssues = await functions.fetchIssues(params);
            allOpenIssues = allOpenIssues.concat(allIssues.filter(issue => issue.state === 'open'));
            const closedIssues = allIssues.filter(issue => {
                const updateDate = new Date(issue.updated_at);
                return (issue.state === 'closed' && updateDate.valueOf() <= date_last.valueOf());
            });
        
            console.log('\n' + '-'.repeat(50));
            console.log(`ISSUES FOR ${label} + PRD`);

            if (closedIssues.length > 0) {
                closedIssues.forEach(issue => {
                    fileData += `\n${issue.number};${issue.title};${issue.labels};${issue.assignees};${issue.daysOpen};${issue.state}`;
                });
                console.table(closedIssues);
            } else {
                console.log(`NENHUMA ISSUE ENCONTRADA PARA O RÓTULO: ${label} + PRD`);
            }  
        }
        console.log('\n' + '-'.repeat(50));
        console.log('ISSUES EM ABERTO');
        if (allOpenIssues.length > 0) {
            console.table(allOpenIssues);
        }
        console.log(`Total de issues em aberto: ${allOpenIssues.length}`);

        console.log('\n' + '-'.repeat(50));
        const resultsFolder = path.join('.', 'result');
        if (!fs.existsSync(resultsFolder)) {
            fs.mkdirSync(resultsFolder, { recursive: true });
        }
        const fileName = 'Incidentes.csv';
        const filePath = path.join(resultsFolder, fileName);
        console.log(`Gerando Arquivo ${fileName}...`);

        fs.writeFile(filePath, fileData, { encoding: 'utf-8' }, (err) => {
            if (err) {
                if(err.code === 'EBUSY'){
                    console.error(`\n - Arquivo ${fileName} em uso. Feche o arquivo e tente novamente.`);
                }
                else{
                    console.error(`\nErro gerando Arquivo CSV: ${err}`);
                }
            } else {
                console.log(` - Arquivo ${fileName} gerado com sucesso no caminho: ${filePath}.`);
            }
        });

    } catch (error) {
        console.error(`Error ${error.status} ao buscar as issues:`, error);
    }
}

functions.getTokenOwner().then(listIssues());