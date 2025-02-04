import helpers from './helpers.js';
import functions from './project-functions.js';
import fs from 'fs';
import path from 'path';
import papa from 'papaparse';

const TEMP_DIR = 'tmp';
const RESULT_DIR = 'result';
const RESULT_FILE = 'iniciativas_updated.csv';
const HEADER_ROW = 0;
const FIRST_DATA_ROW = HEADER_ROW + 1;
const FIRST_DATA_COLUMN = 3;
const TAG_ANDAMENTO = '#andamento';
const ANDAMENTO = 'Andamento';
const SEM_ANDAMENTO = 'Sem_andamento';
const NAO_INICIADO = 'Nao_iniciado';
const ENCERRADO = 'Encerrado';

main();

async function main() {

    // TODO obter e validar parâmetros da linha de comando
    const refMonth = 1;
    const refYear = 2025;
    const initiativesFileName = './tmp/iniciativas_updated.csv';

    console.log('Obtendo iniciativas de Maturação do Piloto...');
    const activeIssues = await getActiveIssues();
    if(activeIssues.length == 0) {
        console.error('Nenhuma issue ativa encontrada.');
    }
    console.log('Gerando arquivos CSV para comentários e issues...');
    writeTimelineCSV(activeIssues);
    writeIssueCSV(activeIssues);
    console.log();

    // Verifica quais issues possuem comentários com a tag de andamento
    const inProgressIssues = activeIssues.filter(issue => {
        for(let i = 0; i < issue.timeline.length; ++i) {
            if(issue.timeline[i].body.toLowerCase().search(TAG_ANDAMENTO) >= 0) {
                return true;
            }
        }
    });
    console.log('Econtrados andamentos para as seguintes issues:');
    for(let i = 0; i < inProgressIssues.length; ++i) {
        console.log(` - ${inProgressIssues[i].issue.issue_id} - ${inProgressIssues[i].issue.title}`);
    }
    console.log();

    console.log(`Carregando arquivo ${initiativesFileName} com iniciativas...`);
    const initiatives = await loadInitiatives(initiativesFileName);
    // Descobre a coluna do CSV que corresponde ao período de referência
    const refColumn = getRefColumn(initiatives, refMonth, refYear);
    console.log();

    console.log(`Atualizando andamento das iniciativas...`);
    // Atualiza as iniciativas com andamento
    for(let i = FIRST_DATA_ROW; i < initiatives.length; ++i) {
        const initiativeId = initiatives[i][0];
        // Deve-se acrescentar as contra-barras para o search() funcionar corretamente com expressão regular
        const idTags = initiativeId.replace('][', ']|[').replaceAll('[', '\\[').replaceAll(']', '\\]').split('|');
        for(let j = 0; j < inProgressIssues.length; ++j) {
            const title = inProgressIssues[j].issue.title;
            if(title.search(idTags[0]) >= 0 && title.search(idTags[1]) >= 0) {
                initiatives[i][refColumn] = ANDAMENTO;
                break;
            }
        }
    }
    // Atualiza o restante do período de referênca que não teve andamento
    for(let i = FIRST_DATA_ROW; i < initiatives.length; ++i) {
        if(initiatives[i][refColumn] != ANDAMENTO) {
            if(initiativeHasPreviousState(initiatives[i], refColumn, ENCERRADO)) {
                initiatives[i][refColumn] = ENCERRADO;
                continue;
            }
            if(
                initiativeHasPreviousState(initiatives[i], refColumn, ANDAMENTO) ||
                initiativeHasPreviousState(initiatives[i], refColumn, SEM_ANDAMENTO)
            ) {
                initiatives[i][refColumn] = SEM_ANDAMENTO;
                continue;
            }
            initiatives[i][refColumn] = NAO_INICIADO;
        }
    }
    console.log();

    console.log('Gerando arquivos atualizado de iniciativas...');
    writeCsv(RESULT_DIR, RESULT_FILE, initiatives);
}

function initiativeHasPreviousState(initiative, refColumn, state) {
    for(let i = FIRST_DATA_COLUMN; i < refColumn; ++i) {
        if(initiative[i] == state) {
            return true;
        }
    }
    return false;
}

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
async function getActiveIssues() {
    const projectKanbamCards = await functions.fetchProjectData();
    if (!Array.isArray(projectKanbamCards)) {
        throw new Error('projectKanbamCards não é uma array');
    }

    let activeIssues = [];
    for(const card of projectKanbamCards){
        let issue = helpers.cleanIssue(card.content)
        let timeline = await functions.fetchIssueTimelineData(card.content.repository.name, card.content.number)
        activeIssues.push({
            "issue":issue,
            "timeline":timeline
        });
    }

    return activeIssues;
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
async function writeTimelineCSV(activeIssues) {
    let fileData = [];
    let header = ['issue_id', 'event_id', 'event', 'event_created_at','user', 'body'];
    fileData.push(header);
    activeIssues.forEach((activeIssue) => {
        activeIssue.timeline.forEach((timelineEvent) => {
            fileData.push([timelineEvent.issue_id, timelineEvent.id, timelineEvent.event, timelineEvent.event_created_at.toISOString(), timelineEvent.user, timelineEvent.body]);
        });
    });
    writeCsv(TEMP_DIR, 'Comentarios.csv', fileData);
}

async function writeIssueCSV(activeIssues) {
    let fileData = [];
    let header = ['issue_id', 'title'];
    fileData.push(header);
    activeIssues.forEach(activeIssue => {
        const issue = activeIssue.issue;
        fileData.push([issue.issue_id, issue.title]);
    });
    writeCsv(TEMP_DIR, 'Issues.csv', fileData);
}

async function writeCsv(fileDir, fileName, fileData) {
    const resultsFolder = path.join('.', fileDir);
    if (!fs.existsSync(resultsFolder)) {
        fs.mkdirSync(resultsFolder, { recursive: true });
    }
    const filePath = path.join(resultsFolder, fileName);
    const csv = papa.unparse(fileData, {delimiter: ';'});
    await fs.writeFile(filePath, csv, { encoding: 'utf-8' }, err => { if(err) throw new Error(err) });
    console.log(` - Arquivo ${fileName} gerado com sucesso.`);
}

async function loadInitiatives(initiativesFileName) {
    const initiativesFile = fs.createReadStream(initiativesFileName);
    const parsePromise = new Promise(resolve => {
        papa.parse(initiativesFile, {
            delimiter: ';',
            complete: function(results) {
                resolve(results.data);
            }
        });
    });
    const initiatives = await parsePromise;
    // TODO validar cabeçalho
    // TODO validar colunas
    // TODO validar formatos das datas
    return initiatives;
}

function getRefColumn(initiatives, refMonth, refYear) {
    let refColumn = 0;
    for(let i = FIRST_DATA_COLUMN; i < initiatives[0].length; ++i) {
        let dateParts = initiatives[HEADER_ROW][i].split('/');
        let month = parseInt(dateParts[1], 10);
        let year = parseInt(dateParts[2], 10);
        if(month == refMonth && year == refYear) {
            refColumn = i;
            break;
        }
    }
    if(refColumn == 0) {
        throw new Error(`Período de referência ${refMonth}/${refYear} não encontrado na planilha`);
    }
    return refColumn;
}
