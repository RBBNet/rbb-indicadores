#!/usr/bin/env node

import readline from 'readline';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let config = {};
try {
    const configPath = path.join(__dirname, 'config.json');
    if (fs.existsSync(configPath)) {
        config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    }
} catch (error) {
    console.warn('Aviso: Nao foi possivel carregar config.json');
}

let rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

function createReadlineInterface() {
    return readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });
}

function ensureReadline() {
    if (!rl || rl.closed) {
        rl = createReadlineInterface();
    }
}

function question(query) {
    ensureReadline();
    return new Promise(resolve => rl.question(query, resolve));
}

function questionWithDefault(query, defaultValue) {
    ensureReadline();
    return new Promise(resolve => {
        rl.question(`${query} [${defaultValue}]: `, (answer) => {
            resolve(answer.trim() || defaultValue);
        });
    });
}

function clearScreen() {
    console.clear();
}

function pause() {
    return question('\nPressione ENTER para continuar...');
}

function appendTail(buffer, chunk, maxLength = 12000) {
    const next = `${buffer}${chunk}`;
    if (next.length <= maxLength) {
        return next;
    }
    return next.slice(-maxLength);
}

function summarizeOutput(output) {
    const lines = output
        .split(/\r?\n/)
        .map(line => line.trimEnd())
        .filter(Boolean)
        .filter(line => !/^\s*at\s/.test(line))
        .filter(line => !line.startsWith('node:internal'))
        .filter(line => !line.startsWith('Node.js v'));

    if (lines.length === 0) {
        return '';
    }

    const highlighted = lines.filter(line => /erro|error|failed|falha|denied|timeout|http|exception/i.test(line));
    const selected = highlighted.length > 0 ? highlighted : lines;
    return selected.slice(-6).join('\n');
}

function buildProcessError(label, code, stderrOutput, stdoutOutput = '') {
    const details = summarizeOutput(`${stderrOutput}\n${stdoutOutput}`);
    if (!details) {
        return new Error(`${label} falhou com codigo ${code}.`);
    }
    return new Error(`${label} falhou com codigo ${code}.\n${details}`);
}

function runNode(scriptPath, args = []) {
    return new Promise((resolve, reject) => {
        const quotedArgs = args.map(arg => {
            if (arg.includes(' ') || arg.includes('\\') || arg.includes('/')) {
                return `"${arg}"`;
            }
            return arg;
        });

        const child = spawn('node', [scriptPath, ...quotedArgs], {
            stdio: ['inherit', 'pipe', 'pipe'],
            shell: true
        });

        let stdoutOutput = '';
        let stderrOutput = '';

        child.stdout.on('data', (data) => {
            const text = data.toString();
            stdoutOutput = appendTail(stdoutOutput, text);
            process.stdout.write(data);
        });

        child.stderr.on('data', (data) => {
            stderrOutput = appendTail(stderrOutput, data.toString());
        });

        child.on('close', (code) => {
            if (code !== 0) {
                reject(buildProcessError(path.basename(scriptPath), code, stderrOutput, stdoutOutput));
            } else {
                resolve();
            }
        });

        child.on('error', reject);
    });
}

function getDefaultMonthPeriod() {
    const now = new Date();
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    return `${String(lastMonth.getMonth() + 1).padStart(2, '0')}/${lastMonth.getFullYear()}`;
}

function getDefaultSemesterPeriodRange() {
    const now = new Date();
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endPeriod = `${String(lastMonth.getMonth() + 1).padStart(2, '0')}/${lastMonth.getFullYear()}`;
    const currentMonth = now.getMonth() + 1;
    const startMonth = currentMonth <= 6 ? 7 : 1;
    const startYear = currentMonth <= 6 ? now.getFullYear() - 1 : now.getFullYear();

    return {
        startPeriod: `${String(startMonth).padStart(2, '0')}/${startYear}`,
        endPeriod
    };
}

function ensureDir(dirPath) {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }
}

function copyFile(source, destination) {
    return new Promise((resolve, reject) => {
        fs.copyFile(source, destination, (err) => {
            if (err) reject(err);
            else resolve();
        });
    });
}

function ensureNetworkTargetDir(baseDir, targetDir) {
    if (!fs.existsSync(baseDir)) {
        throw new Error(`Pasta base de destino nao encontrada ou inacessivel: ${baseDir}`);
    }

    fs.mkdirSync(targetDir, { recursive: true });
}

function parseMonthPeriod(period) {
    const match = /^(0[1-9]|1[0-2])\/(20\d{2})$/.exec(String(period).trim());
    if (!match) {
        throw new Error(`Periodo invalido: ${period}. Use MM/AAAA.`);
    }

    return {
        month: parseInt(match[1], 10),
        year: parseInt(match[2], 10)
    };
}

function getMonthDateRange(periodString) {
    const { month, year } = parseMonthPeriod(periodString);
    return {
        folderName: `${year}-${String(month).padStart(2, '0')}`
    };
}

function printFileList(title, files) {
    console.log(title);
    if (!files || files.length === 0) {
        console.log(' - (nenhum)');
        return;
    }

    for (const file of files) {
        console.log(` - ${file}`);
    }
}

function collectLeafFiles(dirPath) {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    const directFiles = entries
        .filter(entry => entry.isFile())
        .map(entry => path.join(dirPath, entry.name));
    const childDirectories = entries.filter(entry => entry.isDirectory());

    if (childDirectories.length === 0) {
        return directFiles;
    }

    return [
        ...directFiles,
        ...childDirectories.flatMap(entry => collectLeafFiles(path.join(dirPath, entry.name)))
    ];
}

async function selectInitiativesFile(monthDir, folderName) {
    const initiativePattern = new RegExp(`^Iniciativas_${folderName.replace('-', '\\-')}\\.csv$`, 'i');

    if (!fs.existsSync(monthDir)) {
        console.log(`Aviso: pasta ${monthDir} nao encontrada.`);
        return null;
    }

    const files = fs.readdirSync(monthDir).filter(file => initiativePattern.test(file));
    if (files.length === 0) {
        console.log(`Aviso: nenhum arquivo de iniciativas encontrado em ${monthDir}.`);
        return null;
    }

    return path.join(monthDir, files[0]);
}

function collectEvolutionFilesForPublication(monthDir, folderName) {
    const candidates = [
        path.join(monthDir, `Iniciativas_${folderName}.csv`),
        path.join(monthDir, 'Issues.csv')
    ];

    return candidates
        .filter(filePath => fs.existsSync(filePath))
        .map(filePath => ({
            sourceFilePath: filePath,
            targetFileName: path.basename(filePath),
            relativeSourcePath: path.basename(filePath)
        }));
}

async function showMenu() {
    clearScreen();
    console.log('==========================================');
    console.log('      Menu RBB - Perfil Evolucao');
    console.log('==========================================');
    console.log('1. Acompanhamento das Iniciativas de Maturacao do Piloto');
    console.log('2. Publicar indicadores na pasta final');
    console.log('3. Gerar HTML de Evolucao');
    console.log('4. Sair');
    console.log('==========================================');

    const choice = await question('Escolha uma opcao (1-4): ');

    try {
        switch (choice.trim()) {
            case '1':
                await projectMetrics();
                break;
            case '2':
                await publishEvolutionIndicatorsToFinalFolder();
                break;
            case '3':
                await evolutionHtmlReport();
                break;
            case '4':
                console.log('Saindo...');
                rl.close();
                process.exit(0);
                break;
            default:
                console.log('Opcao invalida!');
                await pause();
        }
    } catch (error) {
        console.error('\nERRO:', error.message);
        ensureReadline();
        await pause();
    }

    await showMenu();
}

async function projectMetrics() {
    console.log('\n--- Acompanhamento das Iniciativas de Maturacao do Piloto ---\n');

    const refPeriod = await questionWithDefault('Digite o periodo de referencia (MM/AAAA)', getDefaultMonthPeriod());
    const refPeriodParts = refPeriod.split('/');
    const refMonth = parseInt(refPeriodParts[0], 10);
    const refYear = parseInt(refPeriodParts[1], 10);

    let pathMonth = refMonth - 1;
    let pathYear = refYear;
    if (pathMonth === 0) {
        pathMonth = 12;
        pathYear = refYear - 1;
    }

    const defaultPath = `\\\\bndes.net\\bndes\\Grupos\\BNDES Blockchain\\RBB\\Governança\\09 Indicadores\\${pathYear}-${String(pathMonth).padStart(2, '0')}\\Iniciativas_${pathYear}-${String(pathMonth).padStart(2, '0')}.csv`;
    const initiativesPath = await questionWithDefault(
        'Digite o caminho completo para o arquivo CSV de iniciativas',
        defaultPath
    );
    const folderName = `${refYear}-${String(refMonth).padStart(2, '0')}`;

    rl.close();

    try {
        await runNode(path.join(__dirname, 'Projects', 'project-metrics.js'), [
            refPeriod,
            initiativesPath,
            folderName
        ]);
    } finally {
        rl = createReadlineInterface();
    }

    await pause();
}

async function publishEvolutionIndicatorsToFinalFolder() {
    console.log('\n--- Publicar indicadores na pasta final ---\n');

    const defaultPeriod = getDefaultMonthPeriod();
    const referencePeriod = await questionWithDefault('Digite o mes de referencia (MM/AAAA)', defaultPeriod);

    let folderName;
    try {
        folderName = getMonthDateRange(referencePeriod).folderName;
    } catch (error) {
        console.log(`ERRO: ${error.message}`);
        await pause();
        return;
    }

    const sourceMonthDir = path.join(__dirname, 'result', folderName);
    const targetBaseDir = config.INDICADORES_BASE_DIR;
    if (!targetBaseDir) {
        console.log('ERRO: Configure INDICADORES_BASE_DIR no config.json.');
        await pause();
        return;
    }

    const targetDir = path.join(targetBaseDir, folderName);
    const itemsToPublish = collectEvolutionFilesForPublication(sourceMonthDir, folderName);
    if (itemsToPublish.length === 0) {
        console.log(`Nenhum arquivo publicavel encontrado em ${sourceMonthDir}.`);
        console.log(`Verifique se existem Iniciativas_${folderName}.csv e/ou Issues.csv.`);
        await pause();
        return;
    }

    const localFiles = itemsToPublish.map(item => item.relativeSourcePath);
    const destinationFiles = fs.existsSync(targetDir)
        ? collectLeafFiles(targetDir).map(filePath => path.relative(targetDir, filePath)).sort((a, b) => a.localeCompare(b))
        : [];

    console.log(`Origem local: ${sourceMonthDir}`);
    console.log(`Destino final: ${targetDir}`);
    printFileList('\nArquivos locais a publicar:', localFiles);
    printFileList('\nArquivos atualmente no destino:', destinationFiles);

    const confirmation = await questionWithDefault('Confirmar publicacao final de todos os arquivos listados? (s/n)', 'n');
    if (confirmation.trim().toLowerCase() !== 's') {
        console.log('Publicacao final cancelada pelo usuario.');
        await pause();
        return;
    }

    try {
        ensureNetworkTargetDir(targetBaseDir, targetDir);
        for (const item of itemsToPublish) {
            const targetFilePath = path.join(targetDir, item.targetFileName);
            fs.copyFileSync(item.sourceFilePath, targetFilePath);
        }

        console.log('\nPublicacao final concluida com sucesso!');
        console.log(`Arquivos copiados: ${itemsToPublish.length}.`);
        console.log(`Destino: ${targetDir}`);
    } catch (error) {
        console.log(`ERRO: ${error.message}`);
    }

    await pause();
}

async function evolutionHtmlReport() {
    console.log('\n--- Geracao de HTML de Evolucao ---\n');

    const defaults = getDefaultSemesterPeriodRange();
    const startPeriod = await questionWithDefault('Digite o periodo inicial (MM/AAAA)', defaults.startPeriod);
    const endPeriod = await questionWithDefault('Digite o periodo final (MM/AAAA)', defaults.endPeriod);
    let endFolderName;
    try {
        endFolderName = getMonthDateRange(endPeriod).folderName;
    } catch (error) {
        console.log(`ERRO: ${error.message}`);
        await pause();
        return;
    }

    const resultDir = path.join(__dirname, 'result');
    const monthDir = path.join(resultDir, endFolderName);
    ensureDir(monthDir);

    const initiativesFile = await selectInitiativesFile(monthDir, endFolderName);
    if (!initiativesFile) {
        await pause();
        return;
    }

    const indicatorsBaseDir = config.INDICADORES_BASE_DIR;
    if (!indicatorsBaseDir) {
        console.log('ERRO: Configure INDICADORES_BASE_DIR no config.json.');
        await pause();
        return;
    }

    const localOutputDir = path.join(resultDir, `${endFolderName}-final`);
    const localOutputPath = path.join(localOutputDir, 'Indicadores-evolucao.html');
    const finalOutputDir = path.join(indicatorsBaseDir, endFolderName);
    const finalOutputPath = path.join(finalOutputDir, 'Indicadores-evolucao.html');

    try {
        ensureDir(localOutputDir);
        await runNode(path.join(__dirname, 'Projects', 'project-report.js'), [
            startPeriod,
            endPeriod,
            initiativesFile,
            localOutputPath
        ]);
        ensureNetworkTargetDir(indicatorsBaseDir, finalOutputDir);
        if (fs.existsSync(finalOutputPath)) {
            const overwrite = await questionWithDefault(`Arquivo ${finalOutputPath} ja existe. Deseja sobrescrever? (s/n)`, 'n');
            if (overwrite.trim().toLowerCase() !== 's') {
                console.log(`\nHTML de evolucao gerado localmente em: ${localOutputPath}`);
                console.log('Copia para a pasta final cancelada pelo usuario.');
                await pause();
                return;
            }
        }

        await copyFile(localOutputPath, finalOutputPath);
        console.log(`\nHTML de evolucao gerado em: ${localOutputPath}`);
        console.log(`HTML de evolucao copiado para: ${finalOutputPath}`);
    } catch (error) {
        console.log(`ERRO: ${error.message}`);
    }

    await pause();
}

console.log('Iniciando Menu RBB - Perfil Evolucao...\n');
showMenu().catch((error) => {
    console.error('Erro fatal:', error);
    rl.close();
    process.exit(1);
});