import functions from './issueFunctions.js';
import fs from 'fs';
let labels = ['incidente','incidente-critico', 'vulnerabilidade','vulnerabilidade-critica'];

async function listIssues() {
    try {
        let fileData = 'title;labels;assignees;daysOpen';
        for (const label of labels) {

            /*
            * API call parameters fetching for each label in labels and PRD issues
            * If needed, remove/add parameters in this map
            * except for 'owner', 'repo' and 'headers'  
            */
           
            const params = {
                owner: 'RBBNet',
                repo: 'incidentes',
                state:'all',
                labels: `${label},PRD`,
                headers: {
                    'X-GitHub-Api-Version': '2022-11-28'
                }
            };

            const issues = await functions.fetchIssues(params);
        
            console.log('\n' + '-'.repeat(50));
            console.log(`ISSUES FOR ${label} + PRD`);
            console.log('-'.repeat(50));

            if (issues.length > 0) {
                issues.forEach(issue => {
                    fileData += `\n${issue.title};${issue.labels};${issue.assignees};${issue.DaysOpen}`;
                });

                console.table(issues);
            } else {
                console.log(`No issues found for label: ${label} + PRD`);
            }  
        }
       
        const fileName = `Issues/results/issues.csv`;
        console.log(`\nGerando Arquivo ${fileName}...`);

        fs.writeFile(fileName, fileData, { encoding: 'utf-8' }, (err) => {
            if (err) {
                if(err.code === 'EBUSY'){
                    console.error(`\n - Arquivo ${fileName} em uso. Feche o arquivo e tente novamente.`);
                }
                else{
                    console.error(`\nErro gerando Arquivo CSV: ${err}`);
                }
            } else {
                console.log(` - Arquivo ${fileName} gerado com sucesso.`);
            }
        });

    } catch (error) {
        console.error(`Error ${error.status} while fetching issues:`, error);
    }
}

functions.getTokenOwner().then(listIssues());