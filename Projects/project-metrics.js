import helpers from './helpers.js';
import functions from './project-functions.js';
import fs from 'fs';
import path from 'path';
import papa from 'papaparse';
import readline from 'readline';

const RESULT_DIR = 'result';
let RESULT_FILE = 'Iniciativas_updated.csv'; // Será atualizado com o período de referência
const HEADER_ROW = 0;
const FIRST_DATA_ROW = HEADER_ROW + 1;
const ID_COLUMN = 0;
const INITIATIVE_COLUMN = 1;
const RESPONSIBLES_COLUMN = 2;
const FIRST_DATA_COLUMN = 3;
const ID_HEADER = 'ID';
const INITIATIVE_HEADER = 'Iniciativa';
const RESPONSIBLES_HEADER = 'Responsáveis';
const TAG_ANDAMENTO = '#andamento';
const ANDAMENTO = 'Andamento';
const SEM_ANDAMENTO = 'Sem_andamento';
const NAO_INICIADO = 'Nao_iniciado';
const ENCERRADO = 'Encerrado';
const PERIOD_MES_ANO = /(0[1-9]|1[0-2])\/20\d{2}$/;
const PERIOD_REGEX = /^01\/(0[1-9]|1[0-2])\/20\d{2}$/;
const ID_REGEX = /^\[.+\]\[.+\]$/;

// Interface para leitura de entrada do usuário
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

// Função helper para fazer perguntas
function question(query) {
    return new Promise(resolve => rl.question(query, resolve));
}

function logStage(current, total, label) {
    console.log(`\n[Etapa ${current}/${total}] ${label}`);
}

function formatElapsedMs(elapsedMs) {
    const totalSeconds = Math.floor(elapsedMs / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    if (minutes === 0) {
        return `${seconds}s`;
    }
    return `${minutes}min ${String(seconds).padStart(2, '0')}s`;
}

function startProgressHeartbeat(label, intervalMs = 15000) {
    const startedAt = Date.now();
    return setInterval(() => {
        console.log(`${label}... ${formatElapsedMs(Date.now() - startedAt)}`);
    }, intervalMs);
}

// Função para gerenciar iniciativas ANTES de buscar do GitHub (mais rápido)
async function manageInitiativesBeforeFetch(initiatives) {
    let continueManaging = true;
    
    while(continueManaging) {
        const action = await question('Deseja (I)ncluir, (E)xcluir, (R)eordenar uma iniciativa ou (C)ontinuar? [C]: ');
        const actionUpper = action.trim().toUpperCase();
        
        if(actionUpper === 'C' || actionUpper === '') {
            continueManaging = false;
            console.log('\nProsseguindo com a busca no GitHub...\n');
        } else if(actionUpper === 'E') {
            // Excluir iniciativa
            const numStr = await question('Digite o numero da iniciativa a excluir (ou ENTER para cancelar): ');
            if(numStr.trim() === '') {
                console.log('Exclusao cancelada.\n');
                continue;
            }
            const num = parseInt(numStr.trim());
            const index = num - 1 + FIRST_DATA_ROW;
            
            if(num < 1 || index >= initiatives.length) {
                console.log('Numero invalido!\n');
                continue;
            }
            
            const removedId = initiatives[index][ID_COLUMN];
            const removedName = initiatives[index][INITIATIVE_COLUMN];
            initiatives.splice(index, 1);
            console.log(`Iniciativa ${removedId} - ${removedName} excluida.\n`);
            
            // Mostrar lista atualizada
            console.log('Iniciativas atualizadas:\n');
            for(let i = FIRST_DATA_ROW; i < initiatives.length; ++i) {
                const id = initiatives[i][ID_COLUMN];
                const name = initiatives[i][INITIATIVE_COLUMN];
                console.log(`${i - FIRST_DATA_ROW + 1}. ${id} - ${name}`);
            }
            console.log();
            
        } else if(actionUpper === 'I') {
            // Incluir iniciativa (validação será feita depois)
            const newId = await question('Digite o ID da nova iniciativa no formato [Iniciativa][Responsavel]: ');
            
            if(!ID_REGEX.test(newId.trim())) {
                console.log('ERRO: ID deve estar no formato [Iniciativa][Responsavel]\n');
                continue;
            }
            
            const newName = await question('Digite o nome da iniciativa: ');
            const newResponsibles = await question('Digite os responsaveis: ');
            
            // Criar nova linha com valores vazios para todas as colunas de períodos
            const newRow = new Array(initiatives[HEADER_ROW].length).fill('');
            newRow[ID_COLUMN] = newId.trim();
            newRow[INITIATIVE_COLUMN] = newName.trim();
            newRow[RESPONSIBLES_COLUMN] = newResponsibles.trim();
            
            initiatives.push(newRow);
            console.log(`Iniciativa ${newId.trim()} incluida (sera validada apos buscar issues do GitHub).\n`);
            
            // Mostrar lista atualizada
            console.log('Iniciativas atualizadas:\n');
            for(let i = FIRST_DATA_ROW; i < initiatives.length; ++i) {
                const id = initiatives[i][ID_COLUMN];
                const name = initiatives[i][INITIATIVE_COLUMN];
                console.log(`${i - FIRST_DATA_ROW + 1}. ${id} - ${name}`);
            }
            console.log();
            
        } else if(actionUpper === 'R') {
            // Reordenar iniciativa
            const fromStr = await question('Digite o numero da iniciativa a ser movida (ou ENTER para cancelar): ');
            if(fromStr.trim() === '') {
                console.log('Reordenacao cancelada.\n');
                continue;
            }
            const fromNum = parseInt(fromStr.trim());
            const fromIndex = fromNum - 1 + FIRST_DATA_ROW;
            
            if(fromNum < 1 || fromIndex >= initiatives.length) {
                console.log('Numero invalido!\n');
                continue;
            }
            
            const toStr = await question(`Digite o numero da posicao destino (a iniciativa ${fromNum} sera colocada no lugar dela): `);
            if(toStr.trim() === '') {
                console.log('Reordenacao cancelada.\n');
                continue;
            }
            const toNum = parseInt(toStr.trim());
            const toIndex = toNum - 1 + FIRST_DATA_ROW;
            
            if(toNum < 1 || toIndex >= initiatives.length) {
                console.log('Numero invalido!\n');
                continue;
            }
            
            if(fromNum === toNum) {
                console.log('Mesma posicao! Nenhuma alteracao feita.\n');
                continue;
            }
            
            // Remover iniciativa da posição original
            const movedRow = initiatives.splice(fromIndex, 1)[0];
            
            // Calcular nova posição de destino (pode ter mudado após remoção)
            const newToIndex = fromIndex < toIndex ? toIndex - 1 : toIndex;
            
            // Inserir na nova posição
            initiatives.splice(newToIndex, 0, movedRow);
            
            const movedId = movedRow[ID_COLUMN];
            const movedName = movedRow[INITIATIVE_COLUMN];
            console.log(`Iniciativa ${movedId} - ${movedName} movida para a posicao ${toNum}.\n`);
            
            // Mostrar lista atualizada
            console.log('Iniciativas atualizadas:\n');
            for(let i = FIRST_DATA_ROW; i < initiatives.length; ++i) {
                const id = initiatives[i][ID_COLUMN];
                const name = initiatives[i][INITIATIVE_COLUMN];
                console.log(`${i - FIRST_DATA_ROW + 1}. ${id} - ${name}`);
            }
            console.log();
            
        } else {
            console.log('Opcao invalida! Digite I, E, R ou C.\n');
        }
    }
    
    return initiatives;
}

// Função para validar iniciativas incluídas após obter issues do GitHub
async function validateNewInitiatives(initiatives, activeIssues) {
    console.log('\n=== Validando Iniciativas Incluidas ===\n');
    
    // Verificar cada iniciativa incluída
    for(let i = FIRST_DATA_ROW; i < initiatives.length; ++i) {
        const initiativeId = initiatives[i][ID_COLUMN];
        const idTags = initiativeId.replace('][', ']|[').replaceAll('[', '\\[').replaceAll(']', '\\]').split('|');
        for(const j in idTags) {
            idTags[j] = idTags[j].toLowerCase();
        }
        
        let foundMatch = false;
        let matchedIssue = null;
        
        for(let j = 0; j < activeIssues.length; ++j) {
            const title = activeIssues[j].issue.title.toLowerCase();
            if(title.search(idTags[0]) >= 0 && title.search(idTags[1]) >= 0) {
                foundMatch = true;
                matchedIssue = activeIssues[j];
                break;
            }
        }
        
        if(!foundMatch) {
            console.log(`AVISO: Iniciativa ${initiativeId} nao tem correspondencia no GitHub`);
        } else {
            console.log(`OK: Iniciativa ${initiativeId} -> Issue ${matchedIssue.issue.issue_id}`);
        }
    }
    console.log();
    
    return initiatives;
}

main();

async function main() {
    const totalStages = 5;

    if(process.argv.length != 4){
        console.error('ERRO: Parâmetros incorretos.\nInsira conforme o exemplo: node project-metrics.js <mes-referencia>/<ano-referencia> <caminho-csv-iniciativas>\n');
        return;
    }
    const refPeriod = process.argv[2];
    const refPeriodParts = refPeriod.split('/');
    //Valida o formato do período de referência e verifica se é um arquivo .csv
    if (!PERIOD_MES_ANO.test(refPeriod)) {
        console.error(`ERRO: O período de referência ${refPeriod} não obedece o padrão MM/AAAA\n`);
        process.exit(1);
    }

    const refMonth = parseInt(refPeriodParts[0]);
    const refYear = parseInt(refPeriodParts[1]);
    
    // Atualizar nome do arquivo de saída com o período de referência
    RESULT_FILE = `Iniciativas_${refYear}-${String(refMonth).padStart(2, '0')}.csv`;
    
    // Verifica se o período de referência é futuro
    const today = new Date();
    const currentMonth = today.getMonth() + 1;
    const currentYear = today.getFullYear();
    
    if (refYear > currentYear || (refYear === currentYear && refMonth > currentMonth)) {
        console.error(`ERRO: O período de referência ${refMonth}/${refYear} é uma data futura!\n`);
        process.exit(1);
    }
    
    const initiativesFileName = process.argv[3];
    if (!fs.existsSync(initiativesFileName)) {
        console.error(`ERRO: O arquivo ${initiativesFileName} não foi encontrado\n`);
        process.exit(1);
    }
    if(!initiativesFileName.endsWith('.csv')) {
        console.error(`ERRO: O arquivo ${initiativesFileName} não é um arquivo CSV\n`);
        process.exit(1);
    }

    console.log(`Atualizando andamento de iniciativas para o período ${refMonth}/${refYear}\n`);
    console.log(`Carregando arquivo ${initiativesFileName} com iniciativas...\n`);
    logStage(1, totalStages, 'Carregando e validando arquivo de iniciativas');

    let initiatives = await loadInitiatives(initiativesFileName);
    // Descobre a coluna do CSV que corresponde ao período de referência
    let refColumn = findRefColumn(initiatives, refMonth, refYear);
    const endSemesterMonth = refMonth <= 6 ? 6 : 12;
    const monthsToAdd = [];
    for(let month = refMonth; month <= endSemesterMonth; ++month) {
        if(findRefColumn(initiatives, month, refYear) === -1) {
            monthsToAdd.push(month);
        }
    }
    if(monthsToAdd.length > 0) {
        console.log(`AVISO: Há colunas de acompanhamento faltantes entre ${String(refMonth).padStart(2, '0')}/${refYear} e ${String(endSemesterMonth).padStart(2, '0')}/${refYear}.`);
        console.log(`Posso criar automaticamente as colunas necessárias até o fim do semestre (${String(endSemesterMonth).padStart(2, '0')}/${refYear}).`);
        const confirm = await question('Deseja continuar? [S/n]: ');
        const confirmUpper = confirm.trim().toUpperCase();
        if(confirmUpper === 'N') {
            console.log('Operação cancelada. Voltando ao menu.');
            rl.close();
            return;
        }
        addPeriodColumns(initiatives, monthsToAdd, refYear);
        refColumn = findRefColumn(initiatives, refMonth, refYear);
    }
    if(refColumn == FIRST_DATA_COLUMN) {
        // Ferramenta não sabe tratar o primeiro período, que deve ser inicializado manualmente
        console.error('ERRO: O primeiro período de acompanhamento deve ser inicializado manualmente\n');
        rl.close();
        process.exit(1);
    }

    // Permitir que o usuário inclua/exclua iniciativas interativamente ANTES de buscar do GitHub
    console.log('\n=== Gerenciamento de Iniciativas ===\n');
    console.log('Iniciativas atualmente no arquivo:\n');
    
    // Mostrar todas as iniciativas
    for(let i = FIRST_DATA_ROW; i < initiatives.length; ++i) {
        const id = initiatives[i][ID_COLUMN];
        const name = initiatives[i][INITIATIVE_COLUMN];
        const responsibles = initiatives[i][RESPONSIBLES_COLUMN];
        console.log(`${i - FIRST_DATA_ROW + 1}. ${id} - ${name} (${responsibles})`);
    }
    console.log();
    
    initiatives = await manageInitiativesBeforeFetch(initiatives);
    
    logStage(2, totalStages, 'Consultando GitHub para obter issues e andamentos');
    console.log('Obtendo iniciativas de Maturação do Piloto do GitHub...\n');
    console.log('(Isso pode demorar alguns minutos...)\n');
    const fetchHeartbeat = startProgressHeartbeat('Consulta ao GitHub em andamento', 15000);
    let activeIssues;
    try {
        activeIssues = await getActiveIssues(refMonth, refYear);
    } finally {
        clearInterval(fetchHeartbeat);
    }
    
    // Validar iniciativas incluídas após obter issues
    logStage(3, totalStages, 'Validando iniciativas e gerando CSVs auxiliares');
    initiatives = await validateNewInitiatives(initiatives, activeIssues);
    if(activeIssues.length == 0) {
        console.error('ERRO: Nenhuma issue ativa encontrada.\n');
    }
    console.log('Gerando arquivos CSV para comentários e issues...');
    await writeTimelineCSV(activeIssues);
    await writeIssueCSV(activeIssues);
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

    logStage(4, totalStages, 'Atualizando status das iniciativas para o periodo');
    console.log(`Atualizando andamento das iniciativas...`);
    // Atualiza as iniciativas com andamento
    for(let i = FIRST_DATA_ROW; i < initiatives.length; ++i) {
        const initiativeId = initiatives[i][0];
        // Deve-se acrescentar as contra-barras para o search() funcionar corretamente com expressão regular
        const idTags = initiativeId.replace('][', ']|[').replaceAll('[', '\\[').replaceAll(']', '\\]').split('|');
        for(const i in idTags) {
            idTags[i] = idTags[i].toLowerCase();
        }
        console.log(` - ${initiativeId}`);
        for(let j = 0; j < inProgressIssues.length; ++j) {
            const title = inProgressIssues[j].issue.title.toLowerCase();
            if(title.search(idTags[0]) >= 0 && title.search(idTags[1]) >= 0) {
                initiatives[i][refColumn] = ANDAMENTO;
                console.log(`   ==> ${inProgressIssues[j].issue.issue_id} teve andamento`);
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

    logStage(5, totalStages, 'Salvando arquivo consolidado de iniciativas');
    console.log('Gerando arquivos atualizado de iniciativas...');
    await writeCsv(RESULT_DIR, RESULT_FILE, initiatives);
    console.log();
    
    rl.close();
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
 */
async function getActiveIssues(refMonth, refYear) {
    const projectKanbamCards = await functions.fetchProjectData(refMonth,refYear);
    if (!Array.isArray(projectKanbamCards)) {
        throw new Error('ERRO: projectKanbamCards não é uma array');
    }

    console.log(`Processando ${projectKanbamCards.length} itens retornados pelo GitHub...`);

    let activeIssues = [];
    for(let index = 0; index < projectKanbamCards.length; ++index){
        const card = projectKanbamCards[index];
        const issue = helpers.cleanIssue(card.content);
        const timelineItems = await functions.fetchTimelineData(refMonth, refYear, issue.id)
        const timeline = helpers.cleanTimeLine(timelineItems,issue.issue_id);
        const timelineRefPeriod = timeline.filter(ev => 
            (ev.event_created_at.getMonth() + 1) == refMonth && ev.event_created_at.getFullYear() == refYear
        );
        activeIssues.push({
            "issue":issue,
            "timeline":timelineRefPeriod
        });

        if ((index + 1) % 10 === 0 || index === projectKanbamCards.length - 1) {
            console.log(` - Itens processados: ${index + 1}/${projectKanbamCards.length}`);
        }
    }

    return activeIssues;
}

async function writeTimelineCSV(activeIssues) {
    let fileData = [];
    let header = ['issue_id', 'event_id', 'event', 'event_created_at','user', 'body'];
    fileData.push(header);
    activeIssues.forEach((activeIssue) => {
        activeIssue.timeline.forEach((timelineEvent) => {
            fileData.push([timelineEvent.issue_id, timelineEvent.id, timelineEvent.event, timelineEvent.event_created_at.toISOString(), timelineEvent.user, timelineEvent.body]);
        });
    });
    await writeCsv(RESULT_DIR, 'Comentarios.csv', fileData);
}

async function writeIssueCSV(activeIssues) {
    let fileData = [];
    let header = ['issue_id', 'title'];
    fileData.push(header);
    activeIssues.forEach(activeIssue => {
        const issue = activeIssue.issue;
        fileData.push([issue.issue_id, issue.title]);
    });
    await writeCsv(RESULT_DIR, 'Issues.csv', fileData);
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
    // Valida formato do arquivo
    if(initiatives[HEADER_ROW].length < 5) {
        throw new Error(`ERRO: Arquivo de iniciativas deve ter ao menos as colunas "${ID_HEADER}", "${INITIATIVE_HEADER}", "${RESPONSIBLES_HEADER}" e dois meses de acompanhamento`);
    }
    if(initiatives[HEADER_ROW][ID_COLUMN] != ID_HEADER) {
        throw new Error(`ERRO: Coluna "${ID_HEADER}" não encontrada na posição ${ID_COLUMN}`);
    }
    if(initiatives[HEADER_ROW][INITIATIVE_COLUMN] != INITIATIVE_HEADER) {
        throw new Error(`ERRO: Coluna "${INITIATIVE_HEADER}" não encontrada na posição ${INITIATIVE_COLUMN}`);
    }
    if(initiatives[HEADER_ROW][RESPONSIBLES_COLUMN] != RESPONSIBLES_HEADER) {
        throw new Error(`ERRO: Coluna "${RESPONSIBLES_HEADER}" não encontrada na posição ${RESPONSIBLES_COLUMN}`);
    }
    for(let i = FIRST_DATA_COLUMN; i < initiatives[HEADER_ROW].length; ++i) {
        if(!PERIOD_REGEX.test(initiatives[HEADER_ROW][i])) {
            throw new Error(`ERRO: Coluna ${i} - ${initiatives[HEADER_ROW][i]} não obedece o padrão ${PERIOD_REGEX}`);
        }
    }
    return initiatives;
}

function findRefColumn(initiatives, refMonth, refYear) {
    for(let i = FIRST_DATA_COLUMN; i < initiatives[0].length; ++i) {
        const dateParts = initiatives[HEADER_ROW][i].split('/');
        const month = parseInt(dateParts[1], 10);
        const year = parseInt(dateParts[2], 10);
        if(month == refMonth && year == refYear) {
            return i;
        }
    }
    return -1;
}

function addPeriodColumns(initiatives, monthsToAdd, refYear) {
    for(const month of monthsToAdd) {
        const headerLabel = `01/${String(month).padStart(2, '0')}/${refYear}`;
        initiatives[HEADER_ROW].push(headerLabel);
        for(let i = FIRST_DATA_ROW; i < initiatives.length; ++i) {
            initiatives[i].push('');
        }
    }
}