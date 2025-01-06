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



async function fetchIssues(params) {
    try {
        let response = await octokit.request('GET /repos/{owner}/{repo}/issues', params);
        let filteredIssues = cleanIssues(response);
        return filteredIssues;
    } catch (error) {
        console.error(`Error ${error.status} while fetching issues:`, error);
    }
}

function cleanIssues(response){
    return response.data.map(issue => ({
        'url': issue.url,
        'title': issue.title,
        'number': issue.number,
        'id': issue.id,
        'labels': issue.labels.map(label => label.name),
        'state': issue.state,
        'assignees': issue.assignees ? issue.assignees.map(assignees => '@'+assignees.login) : null,
        'created_by': '@'+issue.user.login,
        'created_at': new Date(issue.created_at).toLocaleDateString('pt-BR'),
        'updated_at': issue.updated_at ? new Date(issue.updated_at).toLocaleDateString('pt-BR') : null,
        'closed_by': issue.closed_by.login ? '@'+issue.closed_by.login : null,
        'closed_at': issue.closed_at ? new Date(issue.closed_at).toLocaleDateString('pt-BR') : null,
        'DaysOpen': issue.closed_at == null ? calculateDaysOpen(issue.created_at) : calculateDaysOpen(issue.created_at, issue.closed_at)
    }));
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

export default { fetchIssues, getTokenOwner };