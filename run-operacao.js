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
    try {
        fs.mkdirSync(dirPath, { recursive: true });
    } catch (error) {
        if (error.code !== 'EEXIST') {
            throw error;
        }
    }
}

function ensureNetworkTargetDir(baseDir, targetDir) {
    if (!fs.existsSync(baseDir)) {
        throw new Error(`Pasta base de destino nao encontrada ou inacessivel: ${baseDir}`);
    }

    try {
        fs.mkdirSync(targetDir, { recursive: true });
    } catch (error) {
        if (error.code === 'ENOENT') {
            throw new Error(`Nao foi possivel criar a pasta de destino ${targetDir}. Verifique se a pasta base existe e se voce tem permissao de escrita em ${baseDir}.`);
        }
        throw error;
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
    const startDate = new Date(Date.UTC(year, month - 1, 1, 3, 0, 0, 0));
    const endDate = new Date(Date.UTC(year, month, 1, 3, 0, 0, 0) - 1000);

    return {
        startDate,
        endDate,
        folderName: `${year}-${String(month).padStart(2, '0')}`
    };
}

function formatDateForPrompt(date) {
    return `${String(date.getUTCDate()).padStart(2, '0')}/${String(date.getUTCMonth() + 1).padStart(2, '0')}/${date.getUTCFullYear()}`;
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

function getDumpNetworkBaseDir(envName) {
    if (envName === 'PROD') {
        return config.DUMP_RBB_PRD_BASE_DIR;
    }
    if (envName === 'LAB') {
        return config.DUMP_RBB_LAB_BASE_DIR;
    }
    return null;
}

async function selectOperationalEnvironment() {
    console.log('\n--- Ambiente RBB ---');
    console.log('1. Lab');
    console.log('2. Prd');

    const envChoice = await question('Escolha o ambiente (1-2): ');
    const normalizedChoice = envChoice.trim();
    const envName = normalizedChoice === '2' ? 'PROD' : 'LAB';
    const envLabel = envName === 'PROD' ? 'Prd' : 'Lab';
    const envSlug = envName === 'PROD' ? 'prd' : 'lab';
    const sshEnvConfig = getSshEnvironmentConfig(envName);

    if (!sshEnvConfig?.remoteHost || !sshEnvConfig?.sshHost) {
        throw new Error(`Configure SSH.${envName}.REMOTE_HOST e SSH.${envName}.SSH_HOST no config.json.`);
    }

    if (normalizedChoice !== '1' && normalizedChoice !== '2') {
        console.log(`Opcao invalida. Usando ${envLabel}.`);
    }

    return {
        envName,
        envLabel,
        envSlug,
        ...sshEnvConfig
    };
}

function resetDir(dirPath) {
    fs.rmSync(dirPath, { recursive: true, force: true });
    fs.mkdirSync(dirPath, { recursive: true });
}

function copyDir(source, destination) {
    ensureDir(path.dirname(destination));
    fs.rmSync(destination, { recursive: true, force: true });
    fs.cpSync(source, destination, { recursive: true, force: true });
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

function buildPublishedDumpFileName(sourceFilePath, folderName) {
    const parsedPath = path.parse(sourceFilePath);

    if (parsedPath.name.endsWith(folderName)) {
        return parsedPath.base;
    }

    const monthlyDumpMatch = /^(?<prefix>.+?)_\d+_\d+$/.exec(parsedPath.name);

    if (monthlyDumpMatch?.groups?.prefix) {
        return `${monthlyDumpMatch.groups.prefix}${folderName}${parsedPath.ext}`;
    }

    return `${parsedPath.name}${folderName}${parsedPath.ext}`;
}

function publishFlattenedDump(sourceDir, targetDir, folderName) {
    const sourceFiles = collectLeafFiles(sourceDir);

    if (sourceFiles.length === 0) {
        throw new Error(`Nenhum arquivo encontrado em ${sourceDir} para publicar.`);
    }

    ensureDir(targetDir);
    resetDir(targetDir);
    const writtenTargets = new Set();

    for (const sourceFile of sourceFiles) {
        const targetFileName = buildPublishedDumpFileName(sourceFile, folderName);
        const targetFilePath = path.join(targetDir, targetFileName);

        if (writtenTargets.has(targetFilePath)) {
            throw new Error(`Conflito ao publicar dump: mais de um arquivo geraria ${targetFileName}.`);
        }

        fs.copyFileSync(sourceFile, targetFilePath);
        writtenTargets.add(targetFilePath);
    }

    return sourceFiles.length;
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

function getMenuHelpText(option) {
    const details = {
        '1': [
            'Opcao 1 - Dump RBB (ethereum-etl) para pasta local',
            '',
            'Objetivo:',
            'Exporta o dump bruto da blockchain para a pasta local mensal do ambiente selecionado.',
            '',
            'Entradas solicitadas:',
            '- Mes de referencia no formato MM/AAAA.',
            '- Ambiente: Lab ou Prd.',
            '- Usuario SSH.',
            '',
            'Valores default:',
            '- Mes de referencia: mes anterior ao atual.',
            '- Usuario SSH: valor de USERNAME ou USER do sistema.',
            '- Pasta default de saida em Lab: result\\dump\\lab\\AAAA-MM.',
            '- Pasta default de saida em Prd: result\\dump\\prd\\AAAA-MM.',
            '- Nome default do arquivo gerado: blocksAAAA-MM.csv.',
            '',
            'Origem dos dados de entrada:',
            '- Os endpoints de Lab e Prd vem de config.json, no objeto SSH.',
            '- O sistema deriva internamente o primeiro e o ultimo dia do mes informado e traduz essas datas para blocos no ambiente escolhido.',
            '- A consulta aos blocos e feita no node blockchain acessado via tunel SSH local em http://127.0.0.1:8545.',
            '',
            'Saidas geradas:',
            '- Diretorio result\\dump\\prd\\AAAA-MM ou result\\dump\\lab\\AAAA-MM contendo o arquivo blocksAAAA-MM.csv exportado pelo ethereum-etl.',
            '- O intervalo de blocos calculado e exibido na tela antes da exportacao.'
        ],
        '2': [
            'Opcao 2 - Publica dump RBB para pasta da rede',
            '',
            'Objetivo:',
            'Copia para a rede os dumps locais de Lab e Prd que existirem para o mes selecionado, tolerando dumps parciais e compatibilizando formatos novo e legado.',
            '',
            'Entradas solicitadas:',
            '- Mes de referencia no formato MM/AAAA.',
            '- Confirmacao antes de iniciar a copia para a rede.',
            '',
            'Valores default:',
            '- Mes de referencia: mes anterior ao atual.',
            '- Pasta default de origem em Lab: result\\dump\\lab\\AAAA-MM.',
            '- Pasta default de origem em Prd: result\\dump\\prd\\AAAA-MM.',
            '- Pasta default de destino em Lab: DUMP_RBB_LAB_BASE_DIR\\AAAA-MM.',
            '- Pasta default de destino em Prd: DUMP_RBB_PRD_BASE_DIR\\AAAA-MM.',
            '- Nome default dos arquivos publicados: tipoAAAA-MM.csv, como blocksAAAA-MM.csv.',
            '',
            'Origem dos dados de entrada:',
            '- O sistema procura localmente por result\\dump\\prd\\AAAA-MM e result\\dump\\lab\\AAAA-MM.',
            '- Os destinos de rede sao lidos de config.json nas chaves DUMP_RBB_PRD_BASE_DIR e DUMP_RBB_LAB_BASE_DIR.',
            '- Se a pasta de destino do mes nao existir na rede, ela sera criada antes da copia.',
            '- O sistema copia apenas os arquivos efetivamente presentes no dump local, sem assumir o conjunto completo do ethereum-etl.',
            '',
            'Saidas geradas:',
            '- Copia do dump de Prd para DUMP_RBB_PRD_BASE_DIR\\AAAA-MM, se existir localmente, com os arquivos levados para a raiz da pasta de destino.',
            '- Copia do dump de Lab para DUMP_RBB_LAB_BASE_DIR\\AAAA-MM, se existir localmente, com os arquivos levados para a raiz da pasta de destino.',
            '- Os nomes sao convertidos de algo como blocks_17595958_18236659.csv para blocksAAAA-MM.csv; se o arquivo ja estiver no padrao mensal, ele e preservado.',
            '- Avisos no terminal indicando se foi copiado lab, prd, ambos ou nenhum.'
        ],
        '3': [
            'Opcao 3 - Proposicao de Blocos por Participe',
            '',
            'Objetivo:',
            'Calcula metricas operacionais de producao de blocos a partir de um provider acessado por tunel SSH.',
            '',
            'Entradas solicitadas:',
            '- Mes de referencia no formato MM/AAAA.',
            '- Ambiente: Lab ou Prd.',
            '- Usuario SSH.',
            '',
            'Valores default:',
            '- Mes de referencia: mes anterior ao atual.',
            '- Usuario SSH: valor de USERNAME ou USER do sistema.',
            '- Pasta default para os metadados nodes.json: result.',
            '- Arquivos de metadados usados: nodes_lab.json e nodes_piloto.json.',
            '- Pasta default de saida em Lab: result\\AAAA-MM\\lab.',
            '- Pasta default de saida em Prd: result\\AAAA-MM\\prd.',
            '- Nome default do arquivo gerado em Lab: Blocos_lab.csv.',
            '- Nome default do arquivo gerado em Prd: Blocos.csv.',
            '',
            'Origem dos dados de entrada:',
            '- Configuracoes Lab e Prd sao lidas de config.json, no objeto SSH.',
            '- O provider usado pelo processamento e http://localhost:8545, exposto pelo tunel SSH.',
            '- Os arquivos nodes_lab.json e nodes_piloto.json sao resolvidos na pasta result antes da abertura do tunel SSH; se nao existirem localmente, ou se o usuario optar por sobrescrever, eles sao baixados do repositorio GitHub RBBNet/participantes.',
            '- O mes informado e convertido internamente no intervalo completo entre o primeiro e o ultimo dia do mes.',
            '',
            'Saidas geradas:',
            '- Em Lab, o script gera result\\AAAA-MM\\lab\\Blocos_lab.csv.',
            '- Em Prd, o script gera result\\AAAA-MM\\prd\\Blocos.csv.',
            '- Logs do processamento exibidos no terminal durante a execucao.'
        ],
        '4': [
            'Opcao 4 - Estatisticas do Tempo de Producao de Blocos',
            '',
            'Objetivo:',
            'Processa um CSV mensal de blocos e gera estatisticas textuais de tempo de producao.',
            '',
            'Entradas solicitadas:',
            '- Mes de referencia no formato MM.',
            '- Ano de referencia no formato AAAA.',
            '- Caminho do arquivo CSV de blocos.',
            '',
            'Valores default:',
            '- Mes: mes anterior ao atual.',
            '- Ano: ano correspondente ao mes anterior.',
            '- Pasta default de origem do CSV de blocos: DUMP_RBB_PRD_BASE_DIR\\AAAA-MM.',
            '- Nome default do arquivo de entrada: blocksAAAA-MM.csv.',
            '- Caminho default completo de entrada: DUMP_RBB_PRD_BASE_DIR\\AAAA-MM\\blocksAAAA-MM.csv, montado a partir do mes e ano informados.',
            '- Pasta default do arquivo temporario: result\\AAAA-MM\\prd\\temp.',
            '- Nome default do arquivo temporario: blocksAAAA-MM.csv.',
            '- Pasta default da saida final: result\\AAAA-MM\\prd.',
            '- Nome default do arquivo de saida final: Blocos-estat.txt.',
            '',
            'Origem dos dados de entrada:',
            '- O arquivo de origem e um CSV de blocos localizado na rede corporativa, no caminho informado pelo usuario.',
            '- O usuario pode alterar o caminho de entrada manualmente, mas o default da execucao e conhecido a partir de DUMP_RBB_PRD_BASE_DIR, do mes e do ano informados.',
            '- Esse arquivo e copiado para result\\AAAA-MM\\prd\\temp antes do processamento.',
            '',
            'Saidas geradas:',
            '- Arquivo temporario local em result\\AAAA-MM\\prd\\temp\\blocksAAAA-MM.csv.',
            '- Arquivo result\\AAAA-MM\\prd\\Blocos-estat.txt com as estatisticas geradas por Blocks\\block-analytics.js.'
        ],
        '5': [
            'Opcao 5 - Issues em Producao',
            '',
            'Objetivo:',
            'Consulta a API do GitHub para coletar e consolidar issues de producao do repositorio RBBNet/incidentes.',
            '',
            'Entradas solicitadas:',
            '- Mes de referencia no formato MM/AAAA.',
            '',
            'Valores default:',
            '- Mes de referencia: mes anterior ao atual.',
            '- Pasta default de saida: result\\AAAA-MM\\prd.',
            '- Nome default do arquivo de saida: Incidentes.csv.',
            '- Caminho default completo de saida: result\\AAAA-MM\\prd\\Incidentes.csv.',
            '',
            'Origem dos dados de entrada:',
            '- O script Issues\\issue-metrics.js usa o token GITHUB_RBB_TOKEN do config.json para consultar a API do GitHub.',
            '- As issues sao buscadas no repositorio RBBNet/incidentes com filtro de producao (PRD).',
            '- O mes informado e convertido internamente no intervalo completo entre o primeiro e o ultimo dia do mes.',
            '- Se configurado, PROXY_URL em config.json e usado nas chamadas HTTP ao GitHub.',
            '',
            'Saidas geradas:',
            '- Arquivo result\\AAAA-MM\\prd\\Incidentes.csv com os incidentes coletados no GitHub para o mes selecionado.',
            '- Logs do processamento mostrados no terminal.'
        ],
        '6': [
            'Opcao 6 - Gerar HTML Operacional',
            '',
            'Objetivo:',
            'Gera um HTML consolidado com indicadores operacionais para todos os meses do intervalo informado.',
            '',
            'Entradas solicitadas:',
            '- Periodo inicial no formato MM/AAAA.',
            '- Periodo final no formato MM/AAAA.',
            '',
            'Valores default:',
            '- Periodo inicial: inicio do semestre corrente de acompanhamento. Se a data atual estiver no primeiro semestre, usa 07 do ano anterior; se estiver no segundo semestre, usa 01 do ano atual.',
            '- Periodo final: mes anterior ao atual.',
            '- Pasta default de leitura dos arquivos mensais: INDICADORES_BASE_DIR\\AAAA-MM.',
            '- Nomes default dos arquivos mensais lidos: Blocos.csv e Blocos-estat.txt.',
            '- Pasta default de saida: result.',
            '- Nome default do arquivo de saida: Indicadores-operacao.html.',
            '',
            'Origem dos dados de entrada:',
            '- O script percorre mes a mes do periodo inicial ao final e tenta ler, para cada mes, os arquivos Blocos.csv e Blocos-estat.txt.',
            '- Esses arquivos mensais sao lidos da pasta definida em config.json pela chave INDICADORES_BASE_DIR, normalmente em subpastas no formato AAAA-MM.',
            '- Se existir, o arquivo result\\Incidentes.csv e incluido como entrada adicional.',
            '- Se result\\Incidentes.csv nao existir, o HTML e gerado sem incidentes e o aviso aparece no terminal.',
            '- Se faltar Blocos.csv ou Blocos-estat.txt em algum mes do intervalo, esse mes e ignorado na consolidacao.',
            '',
            'Saidas geradas:',
            '- Arquivo result\\Indicadores-operacao.html gerado por Blocks\\block-report.js.'
        ],
        '7': [
            'Opcao 7 - Help',
            '',
            'Objetivo:',
            'Permite escolher uma opcao do menu e ver a descricao detalhada de funcionamento, entradas, defaults e saidas.'
        ],
        '8': [
            'Opcao 8 - Sair',
            '',
            'Objetivo:',
            'Fecha o menu operacional, encerra a interface readline e finaliza o processo.'
        ]
    };

    return details[option] || null;
}

async function showHelpMenu() {
    console.log('\n--- Help do Menu Operacional ---\n');
    console.log('Escolha a opcao que deseja detalhar:');
    console.log('1. Dump RBB (ethereum-etl) para pasta local');
    console.log('2. Publica dump RBB para pasta da rede');
    console.log('3. Proposicao de Blocos por Participe');
    console.log('4. Estatisticas do Tempo de Producao de Blocos');
    console.log('5. Issues em Producao');
    console.log('6. Gerar HTML Operacional');
    console.log('7. Help');
    console.log('8. Sair');

    const option = await question('Qual opcao deseja detalhar (1-8)? ');
    const helpText = getMenuHelpText(option.trim());

    if (!helpText) {
        console.log('\nOpcao invalida!');
        await pause();
        return;
    }

    console.log(`\n${helpText.join('\n')}`);
    await pause();
}

async function showMenu() {
    clearScreen();
    console.log('==========================================');
    console.log('      Menu RBB - Perfil Operacao');
    console.log('==========================================');
    console.log('1. Dump RBB (ethereum-etl) para pasta local');
    console.log('2. Publica dump RBB para pasta da rede');
    console.log('3. Proposicao de Blocos por Participe');
    console.log('4. Estatisticas do Tempo de Producao de Blocos');
    console.log('5. Issues em Producao');
    console.log('6. Gerar HTML Operacional');
    console.log('7. Help');
    console.log('8. Sair');
    console.log('==========================================');

    const choice = await question('Escolha uma opcao (1-8): ');

    try {
        switch (choice.trim()) {
            case '1':
                await dumpRbbToLocalFolder();
                break;
            case '2':
                await publishRbbDumpToNetworkFolder();
                break;
            case '3':
                await blockMetrics();
                break;
            case '4':
                await blockAnalytics();
                break;
            case '5':
                await issueMetrics();
                break;
            case '6':
                await operationalHtmlReport();
                break;
            case '7':
                await showHelpMenu();
                break;
            case '8':
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
    console.log('\n--- Proposicao de Blocos por Participe ---\n');
    const defaultPeriod = getDefaultMonthPeriod();
    const referencePeriod = await questionWithDefault('Digite o mes de referencia (MM/AAAA)', defaultPeriod);

    let monthRange;
    try {
        monthRange = getMonthDateRange(referencePeriod);
    } catch (error) {
        console.log(`ERRO: ${error.message}`);
        await pause();
        return;
    }

    const startDate = formatDateForPrompt(monthRange.startDate);
    const endDate = formatDateForPrompt(monthRange.endDate);

    let environment;
    try {
        environment = await selectOperationalEnvironment();
    } catch (error) {
        console.log(`ERRO: ${error.message}`);
        await pause();
        return;
    }

    const resultDir = path.join(__dirname, 'result');
    try {
        await ensureNodesFiles(resultDir);
    } catch (error) {
        console.log(`ERRO: ${error.message}`);
        await pause();
        return;
    }

    const defaultUsername = process.env.USERNAME || process.env.USER || '';
    const username = await questionWithDefault('Usuario SSH', defaultUsername);

    try {
        await createSSHTunnel(environment.remoteHost, environment.remotePort, username, environment.sshHost);
        console.log('Aguardando estabilizacao do tunel...');
        await new Promise(resolve => setTimeout(resolve, 2000));

        const provider = 'http://localhost:8545';
        console.log(`\nUsando provider: ${provider}`);
        console.log('Executando proposicao de blocos por participe...\n');

        await runNode(path.join(__dirname, 'Blocks', 'block-metrics.js'), [
            startDate,
            endDate,
            provider,
            resultDir,
            monthRange.folderName,
            environment.envSlug
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
    const folderName = `${refYear}-${refMonth}`;
    const defaultPath = path.join(
        config.DUMP_RBB_PRD_BASE_DIR,
        folderName,
        `blocks${folderName}.csv`
    );
    const blocksPath = await questionWithDefault('Arquivo de blocos', defaultPath);

    console.log('\nVerificando se o arquivo existe...');
    if (!fs.existsSync(blocksPath)) {
        console.log(`ERRO: Arquivo nao encontrado: ${blocksPath}`);
        await pause();
        return;
    }

    console.log('Arquivo encontrado. Copiando para pasta local...');
    const outputDir = path.join(__dirname, 'result', folderName, 'prd');
    const tempDir = path.join(outputDir, 'temp');
    const localPath = path.join(tempDir, `blocks${folderName}.csv`);

    try {
        ensureDir(tempDir);
        await copyFile(blocksPath, localPath);
        console.log('Copia concluida. Processando estatisticas...');

        ensureDir(outputDir);
        const outputPath = path.join(outputDir, 'Blocos-estat.txt');
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
        console.log(`Resultado salvo em: ${outputPath}`);
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

async function dumpRbbToLocalFolder() {
    console.log('\n--- Dump RBB (ethereum-etl) para pasta local ---\n');

    const defaultPeriod = getDefaultMonthPeriod();
    const referencePeriod = await questionWithDefault('Digite o mes de referencia (MM/AAAA)', defaultPeriod);

    let monthRange;
    try {
        monthRange = getMonthDateRange(referencePeriod);
    } catch (error) {
        console.log(`ERRO: ${error.message}`);
        await pause();
        return;
    }

    let environment;
    try {
        environment = await selectOperationalEnvironment();
    } catch (error) {
        console.log(`ERRO: ${error.message}`);
        await pause();
        return;
    }

    const defaultUsername = process.env.USERNAME || process.env.USER || '';
    const username = await questionWithDefault('Usuario SSH', defaultUsername);
    const providerUri = 'http://127.0.0.1:8545';
    const outputDir = path.join(__dirname, 'result', 'dump', environment.envSlug, monthRange.folderName);
    const outputPath = path.join(outputDir, `blocks${monthRange.folderName}.csv`);
    const totalStages = 4;

    try {
        logStage(1, totalStages, `Estabelecendo tunel SSH para ${environment.envLabel}`);
        await createSSHTunnel(environment.remoteHost, environment.remotePort, username, environment.sshHost);
        console.log('Aguardando estabilizacao do tunel...');
        await new Promise(resolve => setTimeout(resolve, 2000));

        const provider = new ethers.JsonRpcProvider(providerUri);
        console.log('\nVerificando conectividade com o provider local...');
        await provider.getBlockNumber();

        logStage(2, totalStages, 'Calculando intervalo de blocos a partir do mes informado');
        const dater = new EthDater(provider);
        const startBlockData = await withProgressFeedback(
            'Calculando bloco inicial a partir do primeiro dia do mes',
            () => dater.getDate(monthRange.startDate, true, false)
        );
        const endExclusiveDate = addDays(monthRange.endDate, 1);
        const endBlockData = await withProgressFeedback(
            'Calculando bloco final a partir do ultimo dia do mes',
            () => dater.getDate(endExclusiveDate, true, false)
        );
        const startBlock = startBlockData.block;
        const endBlock = endBlockData.block - 1;

        if (endBlock < startBlock) {
            throw new Error('Intervalo de blocos invalido calculado a partir do mes informado.');
        }

        console.log(`\nAmbiente: ${environment.envLabel}`);
        console.log(`Mes de referencia: ${monthRange.folderName}`);
        console.log(`Bloco inicial: ${startBlock}`);
        console.log(`Bloco final: ${endBlock}`);
        console.log(`Arquivo de saida: ${outputPath}\n`);

        logStage(3, totalStages, 'Exportando dump com ethereum-etl');
        resetDir(outputDir);
        console.log('Iniciando exportacao com ethereum-etl. Isso pode levar varios minutos.');

        await runCommand('ethereumetl', [
            'export_blocks_and_transactions',
            '--start-block', String(startBlock),
            '--end-block', String(endBlock),
            '--provider-uri', providerUri,
            '--blocks-output', outputPath
        ], {
            progressLabel: 'Exportacao de blocos em andamento',
            progressIntervalMs: 20000
        });

        logStage(4, totalStages, 'Finalizando dump local');
        console.log('\nDump concluido com sucesso!');
        console.log(`Arquivo salvo em: ${outputPath}`);
    } catch (error) {
        console.log(`\nERRO: ${error.message}`);
        console.log('Verifique suas credenciais SSH, conectividade e se o pacote ethereum-etl esta instalado.');
    } finally {
        closeSSHTunnel();
    }

    await pause();
}

async function publishRbbDumpToNetworkFolder() {
    console.log('\n--- Publica dump RBB para pasta da rede ---\n');

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

    const publishPlan = [
        {
            envName: 'LAB',
            label: 'lab',
            sourceDir: path.join(__dirname, 'result', 'dump', 'lab', folderName),
            targetBaseDir: getDumpNetworkBaseDir('LAB')
        },
        {
            envName: 'PROD',
            label: 'prd',
            sourceDir: path.join(__dirname, 'result', 'dump', 'prd', folderName),
            targetBaseDir: getDumpNetworkBaseDir('PROD')
        }
    ];

    const availablePlans = publishPlan.filter(item => fs.existsSync(item.sourceDir));

    if (availablePlans.length === 0) {
        console.log(`Nenhum dump local encontrado para ${folderName}.`);
        console.log(`Verifique se existem as pastas result\\dump\\lab\\${folderName} e/ou result\\dump\\prd\\${folderName}.`);
        await pause();
        return;
    }

    console.log(`Dumps locais encontrados para copia: ${availablePlans.map(item => item.label).join(' e ')}.`);

    const confirmation = await questionWithDefault('Confirmar copia para a rede? (s/n)', 'n');
    if (confirmation.trim().toLowerCase() !== 's') {
        console.log('Copia cancelada pelo usuario.');
        await pause();
        return;
    }

    for (const plan of availablePlans) {
        if (!plan.targetBaseDir) {
            console.log(`ERRO: Configure ${plan.envName === 'PROD' ? 'DUMP_RBB_PRD_BASE_DIR' : 'DUMP_RBB_LAB_BASE_DIR'} no config.json.`);
            await pause();
            return;
        }
    }

    try {
        for (const plan of availablePlans) {
            const targetDir = path.join(plan.targetBaseDir, folderName);
            ensureNetworkTargetDir(plan.targetBaseDir, targetDir);
            console.log(`\nCopiando dump ${plan.label}...`);
            console.log(`Origem: ${plan.sourceDir}`);
            console.log(`Destino: ${targetDir}`);
            const copiedFilesCount = publishFlattenedDump(plan.sourceDir, targetDir, folderName);
            console.log(`Arquivos copiados para a raiz do destino: ${copiedFilesCount}.`);
        }

        console.log('\nPublicacao concluida com sucesso!');
        console.log(`Ambientes copiados: ${availablePlans.map(item => item.label).join(' e ')}.`);
    } catch (error) {
        console.log(`ERRO: ${error.message}`);
    }

    await pause();
}

async function issueMetrics() {
    console.log('\n--- Issues em Producao ---\n');

    const defaultPeriod = getDefaultMonthPeriod();
    const referencePeriod = await questionWithDefault('Digite o mes de referencia (MM/AAAA)', defaultPeriod);

    let monthRange;
    try {
        monthRange = getMonthDateRange(referencePeriod);
    } catch (error) {
        console.log(`ERRO: ${error.message}`);
        await pause();
        return;
    }

    const startDate = formatDateForPrompt(monthRange.startDate);
    const endDate = formatDateForPrompt(monthRange.endDate);

    rl.close();

    try {
        await runNode(path.join(__dirname, 'Issues', 'issue-metrics.js'), [startDate, endDate, monthRange.folderName]);
    } finally {
        rl = createReadlineInterface();
    }

    await pause();
}

console.log('Iniciando Menu RBB - Perfil Operacao...\n');
showMenu().catch((error) => {
    console.error('Erro fatal:', error);
    rl.close();
    process.exit(1);
});