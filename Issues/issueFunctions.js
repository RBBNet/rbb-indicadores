import fs from 'fs';
import { Octokit } from "@octokit/core";
import { fetch , ProxyAgent } from 'undici';

const Config = JSON.parse(fs.readFileSync('./config.json', 'utf8'));
const proxyurl = Config.PROXY_URL;
let octokit;

if(proxyurl != null){
    const myFetch = (url,options) => {
        return fetch(url, {
            ...options,
            dispatcher: new ProxyAgent(proxyurl)
        })
    }
    
    octokit = new Octokit({
        auth: `${Config.GITHUB_RBB_TOKEN}`,
        request: {
            fetch: myFetch
        }
    });
} else{
    octokit = new Octokit({
        auth: `${Config.GITHUB_RBB_TOKEN}`,
    });
}



async function fetchIssues(params,date_last) {
    try {
        let response = await octokit.request('GET /repos/{owner}/{repo}/issues', params);
        let filteredIssues = cleanIssues(response, date_last);
        return filteredIssues;
    } catch (error) {
        console.error(`Error ${error.status} while fetching issues:`, error);
    }
}

function cleanIssues(response, date_last){
    
    return response.data.map(issue => {
        const updateDate = new Date(issue.updated_at);
        if(updateDate.valueOf() <= date_last.valueOf()){
            return {
                'title': issue.title,
                'labels': issue.labels.map(label => label.name),
                'assignees': issue.assignees ? issue.assignees.map(assignees => '@'+assignees.login) : null,
                'daysOpen': issue.closed_at == null ? calculateDaysOpen(issue.created_at) : calculateDaysOpen(issue.created_at, issue.closed_at),
                'state': issue.state == 'open' ? 'open' : 'closed'
            }
        }
        return null;
    }) 
    .filter(item => item !== null);;
}

function calculateDaysOpen(creationString, closedString){
    let dateAux;

    const creationDate = new Date(creationString).valueOf();

    if(closedString == null){
        dateAux = Date.now();
    } else {
        dateAux = new Date(closedString).valueOf();
    }

    return ((dateAux - creationDate)/86400000).toFixed(0);
}

async function getTokenOwner(){  
    octokit.request('GET /user', {
        headers: {
            'X-GitHub-Api-Version': '2022-11-28'
        }
    }) 
    .then(response => {
        console.log(`\nRETRIEVING ISSUES WITH TOKEN OWNED BY ${response.data.name} - @${response.data.login}`);
    })
    .catch(error => {
        console.error('Error fetching user data:', error);
    }); 
}


function string_to_date(dateString) {
    if (!dateString) {
        throw new Error('Os parâmetros de data estão vazios ou é indefinidos (undefined).');
    }

    let parts = dateString.split('/');
    let day = parseInt(parts[0], 10);
    let month = parseInt(parts[1], 10) - 1;
    let year = parseInt(parts[2], 10);

    // meia-noite no horário de Brasília (UTC-3). UTC-3 é +3 em UTC
    //-1000ms para buscar até as 23:59:59 da data solicitada
    let date = new Date(Date.UTC(year, month, day, 3, 0, 0, 0));
    
    return date;
}

function validate_date(date){
    // Verifica se o objeto Date representa uma data válida. Datas como 31/02 são corrigidas no string_to_date
    if (isNaN(date.getTime())) {
        return false;
    }

    let today = new Date();

    return !(date > today);
}

export default { fetchIssues, getTokenOwner, string_to_date, validate_date };