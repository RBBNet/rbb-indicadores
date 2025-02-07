import { Octokit } from "@octokit/core";
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

  octokit = new Octokit({
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
 * 
 * @param {String} repo 
 * @param {Int} number 
 * 
 * Fetches an array of Issue Timeline Events and filters important information from it
 * through GITHUB REST API 
 * 
 * @returns {[  timeline_events  ]}
 */
async function fetchIssueTimelineData(repo, number) {
    let timeline;

    
    const params = {
        owner: Config.ORG,
        repo: repo,
        issue_number: number,
        per_page: 100,
        headers: {
            'X-GitHub-Api-Version': '2022-11-28'
        }
    };
    
    try {
        timeline = await octokit.request('GET /repos/{owner}/{repo}/issues/{issue_number}/timeline', params);
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
 * Fetches Issues and their statuses from a Project Kanbam 
 * through GITHUB GraphQL API and filters important information from it
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
async function fetchProjectData() {
    try{
        const id = await getProjectID();
        const query = `
            query {
                node(id: "${id}"){
                ... on ProjectV2{ 
                    items(first: 100){
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
                    }
                }
            }
        }
        `;
    
        const data = (await octokit.graphql(query)).node.items.nodes;

        let filteredData =  data.filter(node => (Object.keys(node.content).length > 0) 
        && (node.fieldValueByName && (node.fieldValueByName.status == 'In Progress' || node.fieldValueByName.status == 'Done')));
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

export default { fetchProjectData, fetchIssueTimelineData };