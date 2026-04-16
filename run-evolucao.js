#!/usr/bin/env node

import readline from 'readline';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

async function selectInitiativesFile(resultDir) {
    const initiativePattern = /^Iniciativas_\d{4}-\d{2}\.csv$/i;

    if (!fs.existsSync(resultDir)) {
        console.log('Aviso: pasta result nao encontrada.');
        return null;
    }

    const files = fs.readdirSync(resultDir).filter(file => initiativePattern.test(file));
    if (files.length === 0) {
        console.log('Aviso: nenhum arquivo de iniciativas encontrado em result.');
        return null;
    }

    if (files.length === 1) {
        return path.join(resultDir, files[0]);
    }

    console.log('\nArquivos de iniciativas encontrados:');
    files.forEach((file, index) => {
        console.log(`${index + 1}. ${file}`);
    });
    const choice = await question('Escolha o arquivo de iniciativas (numero): ');
    const idx = parseInt(choice.trim(), 10) - 1;
    if (Number.isNaN(idx) || idx < 0 || idx >= files.length) {
        console.log('Opcao invalida.');
        return null;
    }
    return path.join(resultDir, files[idx]);
}

async function showMenu() {
    clearScreen();
    console.log('==========================================');
    console.log('      Menu RBB - Perfil Evolucao');
    console.log('==========================================');
    console.log('1. Acompanhamento das Iniciativas de Maturacao do Piloto');
    console.log('2. Gerar HTML de Evolucao');
    console.log('3. Sair');
    console.log('==========================================');

    const choice = await question('Escolha uma opcao (1-3): ');

    try {
        switch (choice.trim()) {
            case '1':
                await projectMetrics();
                break;
            case '2':
                await evolutionHtmlReport();
                break;
            case '3':
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

    rl.close();

    try {
        await runNode(path.join(__dirname, 'Projects', 'project-metrics.js'), [
            refPeriod,
            initiativesPath
        ]);
    } finally {
        rl = createReadlineInterface();
    }

    await pause();
}

async function evolutionHtmlReport() {
    console.log('\n--- Geracao de HTML de Evolucao ---\n');

    const defaults = getDefaultSemesterPeriodRange();
    const startPeriod = await questionWithDefault('Digite o periodo inicial (MM/AAAA)', defaults.startPeriod);
    const endPeriod = await questionWithDefault('Digite o periodo final (MM/AAAA)', defaults.endPeriod);
    const resultDir = path.join(__dirname, 'result');
    ensureDir(resultDir);

    const initiativesFile = await selectInitiativesFile(resultDir);
    if (!initiativesFile) {
        await pause();
        return;
    }

    const outputPath = path.join(resultDir, 'Indicadores-evolucao.html');

    try {
        await runNode(path.join(__dirname, 'Projects', 'project-report.js'), [
            startPeriod,
            endPeriod,
            initiativesFile,
            outputPath
        ]);
        console.log(`\nHTML de evolucao gerado em: ${outputPath}`);
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