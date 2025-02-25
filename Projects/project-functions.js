import { Octokit } from "@octokit/core";
import { paginateGraphQL } from "@octokit/plugin-paginate-graphql";
import { fetch , ProxyAgent } from 'undici';
import helpers from './helpers.js'

import fs from 'fs';
const Config = JSON.parse(fs.readFileSync('./config.json', 'utf8'));
const proxyurl = Config.PROXY_URL;

let octokit;
if (proxyurl != null) {
  const myFetch = (url, options) => {
    return fetch(url, {
      ...options,
      dispatcher: new ProxyAgent(proxyurl),
    });
  };
  const MyOctokit = Octokit.plugin(paginateGraphQL)
  octokit = new MyOctokit({
    auth: `${Config.GITHUB_RBB_TOKEN}`,
    request: {
      fetch: myFetch,
    },
  });
} else {
  octokit = new Octokit({
    auth: `${Config.GITHUB_RBB_TOKEN}`,
  });
}

/**
 * @deprecated
 * @param {String} repo 
 * @param {Int} number 
 * 
 * Fetches an array of Issue Timeline Events and filters important information from it
 * through GITHUB REST API 
 * 
 * @returns {[  timeline_events  ]}
 */
async function fetchIssueTimelineData(repo, number, refYear, refMonth) {
    const params = {
        owner: Config.ORG,
        repo: repo,
        issue_number: number,
        per_page: 100,
        //Filtra a chamada à API usando o valor do Mês e Ano de Referência
        since: `${refYear}-${refMonth.toString().padStart(2,'0')}-01T03:00:00Z`,
        headers: {
            'X-GitHub-Api-Version': '2022-11-28'
        }
    };
    
    try {
        const timeline = await octokit.request('GET /repos/{owner}/{repo}/issues/{issue_number}/timeline', params);
        let cleanedTimeline = helpers.cleanTimeLine(timeline, {repo: repo, issue_number: number});
        return cleanedTimeline
    } 
    catch (error) {
        if(error.status == 404){
            console.error(`\nError ${error.status} while fetching issue Data:\n - Check if repository name and issue number are correct and accessible to you`);
            process.exit(1);
        }
        if(error.status == 401){
            console.error(`\nError ${error.status} while fetching issue Data:\n - Check if your Github API access token is correctly set up and with the necessary scopes\n ${error.message} \n ${error.request}` );
            process.exit(2);
        }
        if(error.status == 500){    
            console.error(`\nError ${error.status} while fetching issue Data: ${error.request}`);
            process.exit(3);
        }
        else{
            console.error(`\nError ${error.status} while parsing issue Data: ${error.stack}`);
        }
    }
}

/**
 * Fetches timeline events of type IssueComment for a specific issue from GitHub GraphQL API.
 * The function handles pagination to retrieve all relevant events since a specified date.
 * 
 * @param {number} refMonth - The reference month for the timeline events.
 * @param {number} refYear - The reference year for the timeline events.
 * @param {string} issueID - The node ID of the issue to fetch timeline events for.
 * @returns {Promise<[{
*              id: string,
*              author: { login: string },
*              body: string,
*              createdAt: Date
*          }]>} - A promise that resolves to an array of IssueComment timeline events.
*/
async function fetchTimelineData(refMonth, refYear, issueID) {
    try{
        const date = new Date(`${refMonth}/1/${refYear}`).toISOString()
        const query = `
            query paginate($cursor: String) {
                node(id: "${issueID}"){
                ... on Issue{
                    timelineItems(first: 100, since: "${date}", after: $cursor){
                        nodes{
                            ... on IssueComment{
                                    id
                                    author{
                                        login
                                    }
                                    body
                                    createdAt
                                }
                        }
                        pageInfo {
                            
                            hasNextPage
                            endCursor
                        }
                    }  
                }
            }
        }
        `;
    
        const data = (await octokit.graphql.paginate(query)).node.timelineItems.nodes;
        let filteredData =  data.filter(item => (Object.keys(item).length > 0));
        
        
        return filteredData;
    } 
    catch (error) {
        if(error.status == 404){
            console.error(`\nError ${error.status} while fetching issue Data:\n - Check if repository name and issue number are correct and accessible to you`);
            process.exit(1);
        }
        if(error.status == 401){
            console.error(`\nError ${error.status} while fetching issue Data:\n - Check if your Github API access token is correctly set up and with the necessary scopes\n ${error.message} \n ${error.request}` );
            process.exit(2);
        }
        if(error.status == 500){    
            console.error(`\nError ${error.status} while fetching issue Data: ${error}`);
            process.exit(3);
        }
        else{
            console.error(`\nError ${error.status} while parsing issue Data: ${error.stack}`);
        }
    }
}


/**
 * This function Fetches Issues and their statuses from a Project Kanbam 
 * through GITHUB GraphQL API handling pagination and filtering important information from it
 * @returns {[{ 
 *              content: {
 *                  title: string,
 *                  labels: { nodes: { name: string } },
 *                  assignees: { nodes: { login: string } },
 *                  createdAt: Date,
 *                  closedAt: Date,
 *                  repository: { name: string },
 *                  number: Int                  
 *              }, 
 *              fieldValueByName: { status: string }
 *          }]}
 */
async function fetchProjectData(refMonth, refYear) {
    try{
        const id = await getProjectID();
        const date = new Date(`${refMonth}/1/${refYear}`).toISOString()
        const query = `
            query paginate($cursor: String) {
                node(id: "${id}"){
                ... on ProjectV2{ 
                    items(first: 100, after: $cursor){
                        nodes{
                            content{
                                ... on Issue{
                                    id
                                    title    
                                    labels(first:10){
                                        nodes{
                                            name
                                        }
                                    }
                                    assignees(first:20){
                                        nodes{
                                            login
                                        }
                                    }
                                    createdAt
                                    closedAt
                                    repository{
                                        name
                                    }
                                    number
                                    timelineItems(first: 100, since: "${date}" ){
                                        nodes{
                                            ... on IssueComment{
                                                id
                                                author{
                                                    login
                                                }
                                                body
                                                createdAt
                                            }
                                        }
                                    }
                                }              
                                ... on PullRequest{
                                    id
                                    title
                                    number
                                    labels(first:10){
                                        nodes{
                                            name
                                        }
                                    }
                                    assignees(first:20){
                                        nodes{
                                            login
                                        }
                                    }
                                    createdAt
                                    closedAt
                                    repository{
                                        name
                                    }
                                }
                            } 
                            fieldValueByName( name: "Status") {
                                ... on ProjectV2ItemFieldSingleSelectValue {
                                    status: name
                                }
                            }
                        }
                        pageInfo {
                            startCursor
                            hasNextPage
                            endCursor
                        }
                    } 
                }
            }
        }
        `;
    
        const data = (await octokit.graphql.paginate(query)).node.items.nodes;

        let filteredData =  data.filter(node => (Object.keys(node.content).length > 0) 
        && (node.fieldValueByName && (node.fieldValueByName.status == 'In Progress' || node.fieldValueByName.status == 'Done')));
        
        filteredData.forEach(issue => {
            issue.content.timelineItems.nodes = issue.content.timelineItems.nodes.filter(item => Object.keys(item).length > 0);
        });

        return filteredData;
    } 
    catch (error) {
        if(error.status == 404){
            console.error(`\nError ${error.status} while fetching issue Data:\n - Check if repository name and issue number are correct and accessible to you`);
            process.exit(1);
        }
        if(error.status == 401){
            console.error(`\nError ${error.status} while fetching issue Data:\n - Check if your Github API access token is correctly set up and with the necessary scopes\n ${error.message} \n ${error.request}` );
            process.exit(2);
        }
        if(error.status == 500){    
            console.error(`\nError ${error.status} while fetching issue Data: ${error}`);
            process.exit(3);
        }
        else{
            console.error(`\nError ${error.status} while parsing issue Data: ${error.stack}`);
        }
    }
}

async function getProjectID(){
    const idQuery = `
        query($login: String!, $projectNumber: Int!) {
            organization(login: $login) {
                projectV2(number: $projectNumber) {
                    id
                }
            }
        }
        `;

    const { organization } = await octokit.graphql(idQuery, { login: Config.ORG, projectNumber: Config.PROJECT_NUMBER });

    return organization.projectV2.id;
}

export default { fetchProjectData, fetchTimelineData, fetchIssueTimelineData };