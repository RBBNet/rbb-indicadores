import functions from './issueFunctions.js';
let labels = ['incidente','incidente-critico', 'vulnerabilidade','vulnerabilidade-critica'];

async function listIssues() {
    try {
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
                console.log(issues);
            } else {
                console.log(`No issues found for label: ${label} + PRD`);
            }  
        }
    } catch (error) {
        console.error(`Error ${error.status} while fetching issues:`, error);
    }
}

functions.getTokenOwner().then(listIssues());
