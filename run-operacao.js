#!/usr/bin/env node

import readline from 'readline';
import { spawn } from 'child_process';
import fs from 'fs';
import net from 'net';
import path from 'path';
import { fileURLToPath } from 'url';
import { ethers } from 'ethers';
import EthDater from 'ethereum-block-by-date';
import https from 'https';
import { HttpsProxyAgent } from 'https-proxy-agent';

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

async function withProgressFeedback(label, action, intervalMs = 15000) {
    console.log(`${label}...`);
    const heartbeat = startProgressHeartbeat(label, intervalMs);
    try {
        return await action();
    } finally {
        clearInterval(heartbeat);
    }
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

function runCommand(command, args = [], options = {}) {
    return new Promise((resolve, reject) => {
        const {
            progressLabel = null,
            progressIntervalMs = 20000
        } = options;

        const child = spawn(command, args, {
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

        const heartbeat = progressLabel
            ? startProgressHeartbeat(progressLabel, progressIntervalMs)
            : null;

        child.on('close', (code) => {
            if (heartbeat) {
                clearInterval(heartbeat);
            }
            if (code !== 0) {
                reject(buildProcessError(command, code, stderrOutput, stdoutOutput));
            } else {
                resolve();
            }
        });

        child.on('error', (error) => {
            if (heartbeat) {
                clearInterval(heartbeat);
            }
            reject(error);
        });
    });
}

function parseDateToUTC3(dateString) {
    const parts = dateString.split('/');
    if (parts.length !== 3) {
        throw new Error(`Data invalida: ${dateString}. Use DD/MM/AAAA.`);
    }

    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10);
    const year = parseInt(parts[2], 10);

    if (Number.isNaN(day) || Number.isNaN(month) || Number.isNaN(year)) {
        throw new Error(`Data invalida: ${dateString}. Use DD/MM/AAAA.`);
    }

    const date = new Date(Date.UTC(year, month - 1, day, 3, 0, 0, 0));
    if (
        date.getUTCFullYear() !== year ||
        date.getUTCMonth() !== month - 1 ||
        date.getUTCDate() !== day
    ) {
        throw new Error(`Data invalida: ${dateString}.`);
    }

    return date;
}

function addDays(date, days) {
    return new Date(date.getTime() + days * 86400000);
}

function copyFile(source, destination) {
    return new Promise((resolve, reject) => {
        fs.copyFile(source, destination, (err) => {
            if (err) reject(err);
            else resolve();
        });
    });
}

function ensureDir(dirPath) {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }
}

function getDefaultMonthDateRange() {
    const now = new Date();
    const firstDayLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastDayLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);

    return {
        startDate: `${String(firstDayLastMonth.getDate()).padStart(2, '0')}/${String(firstDayLastMonth.getMonth() + 1).padStart(2, '0')}/${firstDayLastMonth.getFullYear()}`,
        endDate: `${String(lastDayLastMonth.getDate()).padStart(2, '0')}/${String(lastDayLastMonth.getMonth() + 1).padStart(2, '0')}/${lastDayLastMonth.getFullYear()}`
    };
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

let sshTunnelProcess = null;

let config = {};
try {
    const configPath = path.join(__dirname, 'config.json');
    if (fs.existsSync(configPath)) {
        config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    }
} catch (err) {
    console.warn('Aviso: Nao foi possivel carregar config.json');
}

const sshConfig = config.SSH || {};

function getSshEnvironmentConfig(envName) {
    const envConfig = sshConfig[envName];
    if (!envConfig) {
        return null;
    }

    return {
        remoteHost: envConfig.REMOTE_HOST,
        remotePort: String(envConfig.REMOTE_PORT || '8545'),
        sshHost: envConfig.SSH_HOST
    };
}

function downloadFile(url, dest) {
    return new Promise((resolve, reject) => {
        const options = {
            method: 'GET',
            headers: {
                'User-Agent': 'Node.js'
            }
        };

        if (config.GITHUB_RBB_TOKEN && url.includes('github.com')) {
            options.headers.Authorization = `token ${config.GITHUB_RBB_TOKEN}`;
            options.headers.Accept = 'application/vnd.github.raw';
        }

        if (config.PROXY_URL) {
            options.agent = new HttpsProxyAgent(config.PROXY_URL);
        }

        https.get(url, options, (res) => {
            if ([301, 302, 307, 308].includes(res.statusCode)) {
                downloadFile(res.headers.location, dest).then(resolve).catch(reject);
                return;
            }

            if (res.statusCode >= 400) {
                reject(new Error(`HTTP ${res.statusCode}: ${url}`));
                return;
            }

            const chunks = [];

            res.on('data', (chunk) => {
                chunks.push(chunk);
            });

            res.on('end', () => {
                try {
                    fs.writeFileSync(dest, Buffer.concat(chunks));
                    console.log(`Download concluido: ${path.basename(dest)}`);
                    resolve();
                } catch (err) {
                    if (fs.existsSync(dest)) {
                        fs.unlinkSync(dest);
                    }
                    reject(new Error(`Erro ao escrever arquivo ${dest}: ${err.message}`));
                }
            });

            res.on('error', (err) => {
                if (fs.existsSync(dest)) {
                    fs.unlinkSync(dest);
                }
                reject(new Error(`Erro de rede ao baixar ${url}: ${err.message}`));
            });
        }).on('error', (err) => {
            if (fs.existsSync(dest)) {
                fs.unlinkSync(dest);
            }
            reject(new Error(`Erro de rede ao baixar ${url}: ${err.message}`));
        });
    });
}

async function ensureNodesFiles(resultDir) {
    ensureDir(resultDir);
    const labLocal = path.join(resultDir, 'nodes_lab.json');
    const pilotoLocal = path.join(resultDir, 'nodes_piloto.json');
    const labUrl = 'https://api.github.com/repos/RBBNet/participantes/contents/lab/nodes.json';
    const pilotoUrl = 'https://api.github.com/repos/RBBNet/participantes/contents/piloto/nodes.json';

    if (fs.existsSync(labLocal)) {
        const overwrite = await questionWithDefault(`Arquivo ${labLocal} existe. Baixar e sobrescrever? (s/n)`, 'n');
        if (overwrite.toLowerCase() === 's') {
            console.log(`Baixando ${labUrl} ...`);
            await downloadFile(labUrl, labLocal);
        } else {
            console.log(`Usando ${labLocal}`);
        }
    } else {
        console.log(`Baixando ${labUrl} ...`);
        await downloadFile(labUrl, labLocal);
    }

    if (fs.existsSync(pilotoLocal)) {
        const overwrite = await questionWithDefault(`Arquivo ${pilotoLocal} existe. Baixar e sobrescrever? (s/n)`, 'n');
        if (overwrite.toLowerCase() === 's') {
            console.log(`Baixando ${pilotoUrl} ...`);
            await downloadFile(pilotoUrl, pilotoLocal);
        } else {
            console.log(`Usando ${pilotoLocal}`);
        }
    } else {
        console.log(`Baixando ${pilotoUrl} ...`);
        await downloadFile(pilotoUrl, pilotoLocal);
    }

    return resultDir;
}

async function createSSHTunnel(remoteHost, remotePort, username, sshHost) {
    return new Promise((resolve, reject) => {
        console.log(`\nEstabelecendo tunel SSH para ${remoteHost}...`);
        console.log('Digite sua senha quando solicitado.\n');

        rl.pause();

        closeSSHTunnel();

        sshTunnelProcess = spawn('ssh', [
            '-N',
            '-o', 'ExitOnForwardFailure=yes',
            '-o', 'ConnectTimeout=20',
            '-o', 'ServerAliveInterval=30',
            '-o', 'ServerAliveCountMax=3',
            '-L', `8545:${remoteHost}:${remotePort}`,
            `${username}@${sshHost}`
        ], {
            stdio: 'inherit',
            shell: false
        });

        let settled = false;

        const finishWithError = (message) => {
            if (settled) {
                return;
            }
            settled = true;
            rl.resume();
            reject(new Error(message));
        };

        const finishWithSuccess = () => {
            if (settled) {
                return;
            }
            settled = true;
            rl.resume();
            console.log('\nTunel SSH estabelecido com sucesso!');
            resolve();
        };

        sshTunnelProcess.on('error', (err) => {
            finishWithError(`Falha ao criar tunel SSH: ${err.message}`);
        });

        sshTunnelProcess.on('close', (code) => {
            if (!settled) {
                finishWithError(`Tunel SSH nao foi estabelecido (codigo ${code}). Verifique credenciais, conectividade e acesso ao host SSH.`);
            }
        });

        const deadline = Date.now() + 45000;
        const probePort = () => {
            if (settled) {
                return;
            }

            const socket = net.connect({ host: '127.0.0.1', port: 8545 });
            socket.once('connect', () => {
                socket.end();
                finishWithSuccess();
            });
            socket.once('error', () => {
                socket.destroy();
                if (Date.now() >= deadline) {
                    closeSSHTunnel();
                    finishWithError('Timeout ao estabelecer tunel SSH (45s). Verifique credenciais, conectividade e se a porta remota esta acessivel.');
                    return;
                }
                setTimeout(probePort, 750);
            });
        };

        setTimeout(probePort, 1000);
    });
}

function closeSSHTunnel() {
    if (sshTunnelProcess) {
        console.log('\nFechando tunel SSH...');
        sshTunnelProcess.kill();
        sshTunnelProcess = null;
    }
}

process.on('exit', () => {
    closeSSHTunnel();
});

process.on('SIGINT', () => {
    console.log('\n\nInterrompido pelo usuario.');
    closeSSHTunnel();
    process.exit(0);
});

process.on('SIGTERM', () => {
    closeSSHTunnel();
    process.exit(0);
});

async function selectIncidentsFile(resultDir) {
    const incidentsPath = path.join(resultDir, 'Incidentes.csv');
    if (!fs.existsSync(incidentsPath)) {
        console.log('Aviso: arquivo result\\Incidentes.csv nao encontrado. O HTML operacional sera gerado sem incidentes.');
        return null;
    }
    return incidentsPath;
}

async function showMenu() {
    clearScreen();
    console.log('==========================================');
    console.log('      Menu RBB - Perfil Operacao');
    console.log('==========================================');
    console.log('1. Exportar Blocos (ethereum-etl)');
    console.log('2. Metricas de Producao de Blocos');
    console.log('3. Estatisticas do Tempo de Producao de Blocos');
    console.log('4. Issues em Producao');
    console.log('5. Gerar HTML Operacional');
    console.log('6. Sair');
    console.log('==========================================');

    const choice = await question('Escolha uma opcao (1-6): ');

    try {
        switch (choice.trim()) {
            case '1':
                await exportBlocksWithEthereumEtl();
                break;
            case '2':
                await blockMetrics();
                break;
            case '3':
                await blockAnalytics();
                break;
            case '4':
                await issueMetrics();
                break;
            case '5':
                await operationalHtmlReport();
                break;
            case '6':
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

async function blockMetrics() {
    console.log('\n--- Metricas de Producao de Blocos ---\n');
    const defaults = getDefaultMonthDateRange();
    const startDate = await questionWithDefault('Digite a data inicial (DD/MM/AAAA)', defaults.startDate);
    const endDate = await questionWithDefault('Digite a data final (DD/MM/AAAA)', defaults.endDate);

    console.log('\n--- Configuracao do Tunel SSH ---');
    console.log('1. Lab (configurado em config.json)');
    console.log('2. Prod (configurado em config.json)');
    console.log('3. Customizado');

    const tunnelChoice = await question('Escolha o ambiente (1-3): ');
    let remoteHost;
    let remotePort;
    let sshHost;

    switch (tunnelChoice.trim()) {
        case '1': {
            const labConfig = getSshEnvironmentConfig('LAB');
            if (!labConfig?.remoteHost || !labConfig?.sshHost) {
                console.log('ERRO: Configure SSH.LAB.REMOTE_HOST e SSH.LAB.SSH_HOST no config.json.');
                await pause();
                return;
            }
            remoteHost = labConfig.remoteHost;
            remotePort = labConfig.remotePort;
            sshHost = labConfig.sshHost;
            break;
        }
        case '2': {
            const prodConfig = getSshEnvironmentConfig('PROD');
            if (!prodConfig?.remoteHost || !prodConfig?.sshHost) {
                console.log('ERRO: Configure SSH.PROD.REMOTE_HOST e SSH.PROD.SSH_HOST no config.json.');
                await pause();
                return;
            }
            remoteHost = prodConfig.remoteHost;
            remotePort = prodConfig.remotePort;
            sshHost = prodConfig.sshHost;
            break;
        }
        case '3':
            remoteHost = await question('Digite o IP remoto: ');
            remotePort = await questionWithDefault('Digite a porta remota', '8545');
            sshHost = await question('Digite o host SSH: ');
            break;
        default: {
            const defaultLabConfig = getSshEnvironmentConfig('LAB');
            if (!defaultLabConfig?.remoteHost || !defaultLabConfig?.sshHost) {
                console.log('Opcao invalida e SSH.LAB nao configurado no config.json.');
                await pause();
                return;
            }
            console.log('Opcao invalida. Usando Lab configurado no config.json.');
            remoteHost = defaultLabConfig.remoteHost;
            remotePort = defaultLabConfig.remotePort;
            sshHost = defaultLabConfig.sshHost;
        }
    }

    const defaultUsername = process.env.USERNAME || process.env.USER || '';
    const username = await questionWithDefault('Usuario SSH', defaultUsername);

    try {
        await createSSHTunnel(remoteHost, remotePort, username, sshHost);
        console.log('Aguardando estabilizacao do tunel...');
        await new Promise(resolve => setTimeout(resolve, 2000));

        const resultDir = path.join(__dirname, 'result');
        await ensureNodesFiles(resultDir);

        const provider = 'http://localhost:8545';
        console.log(`\nUsando provider: ${provider}`);
        console.log('Executando metricas de producao de blocos...\n');

        await runNode(path.join(__dirname, 'Blocks', 'block-metrics.js'), [
            startDate,
            endDate,
            provider,
            resultDir
        ]);
    } catch (error) {
        console.error(`\nERRO: ${error.message}`);
        if (error.message.includes('tunel SSH') || error.message.includes('SSH')) {
            console.log('Verifique suas credenciais SSH e conectividade de rede.');
        }
    } finally {
        closeSSHTunnel();
    }

    await pause();
}

async function blockAnalytics() {
    console.log('\n--- Estatisticas do Tempo de Producao de Blocos ---\n');

    const now = new Date();
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const defaultMonth = String(lastMonth.getMonth() + 1).padStart(2, '0');
    const defaultYear = String(lastMonth.getFullYear());

    const refMonth = await questionWithDefault('Digite o mes de referencia (MM)', defaultMonth);
    const refYear = await questionWithDefault('Digite o ano de referencia (AAAA)', defaultYear);
    const defaultPath = `\\\\bndes.net\\bndes\\Grupos\\BNDES Blockchain\\RBB\\Infra\\DadosPiloto\\${refYear}-${refMonth}\\blocks${refYear}-${refMonth}.csv`;
    const blocksPath = await questionWithDefault('Arquivo de blocos', defaultPath);

    console.log('\nVerificando se o arquivo existe...');
    if (!fs.existsSync(blocksPath)) {
        console.log(`ERRO: Arquivo nao encontrado: ${blocksPath}`);
        await pause();
        return;
    }

    console.log('Arquivo encontrado. Copiando para pasta local...');
    const localPath = path.join(__dirname, 'Blocks', `blocks${refYear}-${refMonth}.csv`);

    try {
        await copyFile(blocksPath, localPath);
        console.log('Copia concluida. Processando estatisticas...');

        ensureDir(path.join(__dirname, 'result'));
        const outputPath = path.join(__dirname, 'result', 'Blocos-estat.txt');
        const outputStream = fs.createWriteStream(outputPath);
        const child = spawn('node', [path.join(__dirname, 'Blocks', 'block-analytics.js'), localPath], { shell: true });
        let stderrOutput = '';

        child.stdout.pipe(outputStream);
        child.stderr.on('data', (data) => {
            stderrOutput = appendTail(stderrOutput, data.toString());
        });

        await new Promise((resolve, reject) => {
            child.on('close', (code) => {
                outputStream.end();
                if (code !== 0) {
                    reject(buildProcessError('block-analytics.js', code, stderrOutput));
                } else {
                    resolve();
                }
            });
        });

        console.log('\nProcessamento concluido!');
        console.log('Resultado salvo em: result\\Blocos-estat.txt');
        console.log(`Arquivo temporario: ${localPath}`);
        console.log();
    } catch (error) {
        console.log(`ERRO: ${error.message}`);
    }

    await pause();
}

async function operationalHtmlReport() {
    console.log('\n--- Geracao de HTML Operacional ---\n');

    const defaults = getDefaultSemesterPeriodRange();
    const startPeriod = await questionWithDefault('Digite o periodo inicial (MM/AAAA)', defaults.startPeriod);
    const endPeriod = await questionWithDefault('Digite o periodo final (MM/AAAA)', defaults.endPeriod);

    const resultDir = path.join(__dirname, 'result');
    const incidentsFile = await selectIncidentsFile(resultDir);
    const outputPath = path.join(resultDir, 'Indicadores-operacao.html');

    try {
        await runNode(path.join(__dirname, 'Blocks', 'block-report.js'), [
            startPeriod,
            endPeriod,
            ...(incidentsFile ? [incidentsFile] : []),
            outputPath
        ]);
        console.log(`\nHTML operacional gerado em: ${outputPath}`);
    } catch (error) {
        console.log(`ERRO: ${error.message}`);
    }

    await pause();
}

async function issueMetrics() {
    console.log('\n--- Issues em Producao ---\n');

    const defaults = getDefaultMonthDateRange();
    const startDate = await questionWithDefault('Digite a data inicial (DD/MM/AAAA)', defaults.startDate);
    const endDate = await questionWithDefault('Digite a data final (DD/MM/AAAA)', defaults.endDate);

    rl.close();

    try {
        await runNode(path.join(__dirname, 'Issues', 'issue-metrics.js'), [startDate, endDate]);
    } finally {
        rl = createReadlineInterface();
    }

    await pause();
}

async function exportBlocksWithEthereumEtl() {
    console.log('\n--- Exportacao de Blocos (ethereum-etl) ---\n');

    const defaults = getDefaultMonthDateRange();
    const startDateInput = await questionWithDefault('Digite a data inicial (DD/MM/AAAA)', defaults.startDate);
    const endDateInput = await questionWithDefault('Digite a data final (DD/MM/AAAA)', defaults.endDate);

    let startDate;
    let endDate;
    try {
        startDate = parseDateToUTC3(startDateInput);
        endDate = parseDateToUTC3(endDateInput);
    } catch (error) {
        console.log(`ERRO: ${error.message}`);
        await pause();
        return;
    }

    if (endDate < startDate) {
        console.log('ERRO: A data final deve ser maior ou igual a data inicial.');
        await pause();
        return;
    }

    console.log('\n--- Configuracao do Tunel SSH ---');
    console.log('1. Lab (configurado em config.json)');
    console.log('2. Prod (configurado em config.json)');
    console.log('3. Customizado');

    const tunnelChoice = await question('Escolha o ambiente (1-3): ');
    let remoteHost;
    let remotePort;
    let sshHost;

    switch (tunnelChoice.trim()) {
        case '1': {
            const labConfig = getSshEnvironmentConfig('LAB');
            if (!labConfig?.remoteHost || !labConfig?.sshHost) {
                console.log('ERRO: Configure SSH.LAB.REMOTE_HOST e SSH.LAB.SSH_HOST no config.json.');
                await pause();
                return;
            }
            remoteHost = labConfig.remoteHost;
            remotePort = labConfig.remotePort;
            sshHost = labConfig.sshHost;
            break;
        }
        case '2': {
            const prodConfig = getSshEnvironmentConfig('PROD');
            if (!prodConfig?.remoteHost || !prodConfig?.sshHost) {
                console.log('ERRO: Configure SSH.PROD.REMOTE_HOST e SSH.PROD.SSH_HOST no config.json.');
                await pause();
                return;
            }
            remoteHost = prodConfig.remoteHost;
            remotePort = prodConfig.remotePort;
            sshHost = prodConfig.sshHost;
            break;
        }
        case '3':
            remoteHost = await question('Digite o IP remoto: ');
            remotePort = await questionWithDefault('Digite a porta remota', '8545');
            sshHost = await question('Digite o host SSH: ');
            break;
        default: {
            const defaultLabConfig = getSshEnvironmentConfig('LAB');
            if (!defaultLabConfig?.remoteHost || !defaultLabConfig?.sshHost) {
                console.log('Opcao invalida e SSH.LAB nao configurado no config.json.');
                await pause();
                return;
            }
            console.log('Opcao invalida. Usando Lab configurado no config.json.');
            remoteHost = defaultLabConfig.remoteHost;
            remotePort = defaultLabConfig.remotePort;
            sshHost = defaultLabConfig.sshHost;
        }
    }

    const defaultUsername = process.env.USERNAME || process.env.USER || '';
    const username = await questionWithDefault('Usuario SSH', defaultUsername);
    const providerUri = 'http://127.0.0.1:8545';
    const resultDir = path.join(__dirname, 'result');
    const outputDir = path.join(resultDir, 'blocos');
    ensureDir(outputDir);
    const totalStages = 4;

    try {
        logStage(1, totalStages, 'Estabelecendo tunel SSH e validando conectividade');
        await createSSHTunnel(remoteHost, remotePort, username, sshHost);
        console.log('Aguardando estabilizacao do tunel...');
        await new Promise(resolve => setTimeout(resolve, 2000));

        const provider = new ethers.JsonRpcProvider(providerUri);
        console.log('\nVerificando conectividade com o provider local...');
        await provider.getBlockNumber();

        logStage(2, totalStages, 'Calculando intervalo de blocos a partir das datas');
        const dater = new EthDater(provider);
        const startBlockData = await withProgressFeedback(
            'Calculando bloco inicial a partir da data informada',
            () => dater.getDate(startDate, true, false)
        );
        const endExclusiveDate = addDays(endDate, 1);
        const endBlockData = await withProgressFeedback(
            'Calculando bloco final a partir da data informada',
            () => dater.getDate(endExclusiveDate, true, false)
        );
        const startBlock = startBlockData.block;
        const endBlock = endBlockData.block - 1;

        if (endBlock < startBlock) {
            throw new Error('Intervalo de blocos invalido calculado a partir das datas informadas.');
        }

        console.log(`\nBloco inicial: ${startBlock}`);
        console.log(`Bloco final: ${endBlock}`);
        console.log(`Diretorio de saida: ${outputDir}\n`);
        logStage(3, totalStages, 'Exportando blocos com ethereum-etl');
        console.log('Iniciando exportacao com ethereum-etl. Isso pode levar varios minutos.');

        await runCommand('ethereumetl', [
            'export_all',
            '--start', String(startBlock),
            '--end', String(endBlock),
            '--partition-batch-size', '6000000',
            '--provider-uri', providerUri,
            '--output-dir', outputDir
        ], {
            progressLabel: 'Exportacao de blocos em andamento',
            progressIntervalMs: 20000
        });

        logStage(4, totalStages, 'Finalizando exportacao');
        console.log('\nExportacao concluida com sucesso!');
        console.log(`Arquivos salvos em: ${outputDir}`);
    } catch (error) {
        console.log(`\nERRO: ${error.message}`);
        console.log('Verifique suas credenciais SSH, conectividade e se o pacote ethereum-etl esta instalado.');
    } finally {
        closeSSHTunnel();
    }

    await pause();
}

console.log('Iniciando Menu RBB - Perfil Operacao...\n');
showMenu().catch((error) => {
    console.error('Erro fatal:', error);
    rl.close();
    process.exit(1);
});