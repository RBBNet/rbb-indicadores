import helpers from './helpers.js';
import functions from './project-functions.js';
import fs from 'fs';
import path from 'path';    

getActiveIssues().then(activeIssues => {
    if (Array.isArray(activeIssues) && activeIssues.length > 0) {
        console.log('Gerando Arquivos CSV para TIMELINE e ISSUES..');
        writeTimelineCSV(activeIssues);
        writeIssueCSV(activeIssues);
    } else {
        console.error('Nenhuma issue ativa encontrada ou activeIssues não é uma array.');
    }
}).then(() => {
    const resultsFolder = path.join('.', 'result');
    if (!fs.existsSync(resultsFolder)) {
        fs.mkdirSync(resultsFolder, { recursive: true });
    }
});

/**
 * Function to retrieve issues associated to a Project Kanbam Card and their timelines.
 * @returns {[{
*            'title': string,,
*            'labels': [string],
*            'assignees': [string],
*            'createdAt': Date,
*            'closedAt': Date,
*            'daysOpen': Int
*         }, 
*           {
*            'event': string
*            'event_created_at': Date
*            'user': string
*            'progress': bool
*         }]}
 */
async function getActiveIssues(){
    console.log('\nObtendo Iniciativas de Maturação do Piloto...');
    const projectKanbamCards = await functions.fetchProjectData();
    if (!Array.isArray(projectKanbamCards)) {
        throw new Error('projectKanbamCards não é uma array');
    }
    let activeIssues = [];
    try{
        for(const card of projectKanbamCards){
           
            let issue = helpers.cleanIssue(card.content)
            let timeline = await functions.fetchIssueTimelineData(card.content.repository.name, card.content.number)
         
            activeIssues.push({
                "issue":issue,
                "timeline":timeline
            });
        }
        
        return activeIssues;
    } catch (error) {
        console.error(`Error ${error.type}: ${error.message}\n${error.stack}`);
    }
}
/**
 * Function to write Progress Tracking info to CSV file
 * for each active issue retrived.
 * @param {[{
*            'title': string,,
*            'labels': [string],
*            'assignees': [string],
*            'createdAt': Date,
*            'closedAt': Date,
*            'daysOpen': Int
*         }, 
*           {
*            'event': string
*            'event_created_at': Date
*            'user': string
*            'progress': bool
*         }]} activeIssues
 */
async function writeTimelineCSV(activeIssues){
    let fileData = `issue_id;event_id;event;event_created_at;user;body`;

    activeIssues.forEach((activeIssue) => {
        activeIssue.timeline.forEach((timelineEvent) => {
            fileData += `\n${timelineEvent.issue_id};${timelineEvent.id};${timelineEvent.event};${timelineEvent.event_created_at.toISOString()};${timelineEvent.user};"${timelineEvent.body}"`;
        });
    });

    const resultsFolder = path.join('.', 'tmp');
    if (!fs.existsSync(resultsFolder)) {
        fs.mkdirSync(resultsFolder, { recursive: true });
    }

    const fileName = `timeline.csv`;
    const filePath = path.join(resultsFolder, fileName);
    
    fs.writeFile(filePath, fileData, { encoding: 'utf-8' }, (err) => {
        if (err) {
            console.error(' - Error writing file:', err);
        } else {
            console.log(` - Arquivo ${fileName} gerado com sucesso.`);
        }
    });
}

async function writeIssueCSV(activeIssues) {
    let fileData = `issue_id;title`;

    activeIssues.forEach(activeIssue => {
        const issue = activeIssue.issue;
        fileData += `\n${issue.issue_id};${issue.title}`;
    });

    const resultsFolder = path.join('.', 'tmp');
    if (!fs.existsSync(resultsFolder)) {
        fs.mkdirSync(resultsFolder, { recursive: true });
    }

    const fileName = `issues.csv`;
    const filePath = path.join(resultsFolder, fileName);

    fs.writeFile(filePath, fileData, { encoding: 'utf-8' }, (err) => {
        if (err) {
            console.error(' - Error writing file:', err);
        } else {
            console.log(` - Arquivo ${fileName} gerado com sucesso.`);
        }
    });
}