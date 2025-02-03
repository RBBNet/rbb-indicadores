import functions from './issueFunctions.js';
import fs from 'fs';
import path from 'path';
let labels = ['incidente','incidente-critico', 'vulnerabilidade','vulnerabilidade-critica'];

async function listIssues() {
    try {

        if(process.argv.length != 4){
            console.error('Parâmetros incorretos.\nInsira conforme o exemplo: node issue-metrics.js <data-inicial> <data-final>\n');
            return;
        }

        let date_first = process.argv[2];
        let date_last = process.argv[3];

        //validando datas de inicio e fim
        date_first = functions.string_to_date(date_first);
        if (functions.validate_date(date_first) === false) {
            console.log("Por favor, insira uma data válida. O formato esperado é DD/MM/AAAA");
            return
        } 
        
        date_last = functions.string_to_date(date_last);
        if (functions.validate_date(date_last) === false) {
            console.log("Por favor, insira uma data válida. O formato esperado é DD/MM/AAAA");
            return
        } 
        
        let fileData = 'number;title;labels;assignees;daysOpen';
        for (const label of labels) {

            /*
            * API call parameters fetching for each label in labels and PRD issues
            * If needed, remove/add parameters in this map
            * except for 'owner', 'repo' and 'headers'  
            */
           
            const params = {
                owner: 'RBBNet',
                repo: 'incidentes',
                state:'closed',
                labels: `${label},PRD`,
                since: date_first.toISOString(),
                headers: {
                    'X-GitHub-Api-Version': '2022-11-28'
                }
            };

            const issues = await functions.fetchIssues(params,date_last);
        
            console.log('\n' + '-'.repeat(50));
            console.log(`ISSUES FOR ${label} + PRD`);
            console.log('-'.repeat(50));

            if (issues.length > 0) {
                issues.forEach(issue => {
                    fileData += `\n${issue.number};${issue.title};${issue.labels};${issue.assignees};${issue.daysOpen}`;
                });

                console.table(issues);
            } else {
                console.log(`No issues found for label: ${label} + PRD`);
            }  
        }

        const resultsFolder = path.join('.', 'Issues', 'results');
        if (!fs.existsSync(resultsFolder)) {
            fs.mkdirSync(resultsFolder, { recursive: true });
        }
        
        const fileName = 'Incidentes.csv';
        const filePath = path.join(resultsFolder, fileName);

        console.log(`\nGerando Arquivo ${fileName}...`);

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
        console.error(`Error ${error.status} while fetching issues:`, error);
    }
}

functions.getTokenOwner().then(listIssues());