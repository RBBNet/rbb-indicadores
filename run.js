#!/usr/bin/env node

import readline from 'readline';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Interface para leitura de entrada do usuário (mutável para permitir recriar)
let rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

// Função helper para fazer perguntas com valor padrão
function question(query) {
    return new Promise(resolve => rl.question(query, resolve));
}

// Função para fazer pergunta com sugestão (aceita ENTER para usar o padrão)
function questionWithDefault(query, defaultValue) {
    return new Promise(resolve => {
        rl.question(`${query} [${defaultValue}]: `, (answer) => {
            resolve(answer.trim() || defaultValue);
        });
    });
}

// Função para limpar a tela
function clearScreen() {
    console.clear();
}

// Função para pausar e esperar tecla
function pause() {
    return question('\nPressione ENTER para continuar...');
}

// Função para executar comando Node.js
function runNode(scriptPath, args = []) {
    return new Promise((resolve, reject) => {
        // Escapar argumentos com aspas duplas para Windows
        const quotedArgs = args.map(arg => {
            // Se o argumento contém espaços ou caracteres especiais, envolver em aspas
            if (arg.includes(' ') || arg.includes('\\') || arg.includes('/')) {
                return `"${arg}"`;
            }
            return arg;
        });
        
        const child = spawn('node', [scriptPath, ...quotedArgs], {
            stdio: 'inherit',
            shell: true
        });

        child.on('close', (code) => {
            if (code !== 0) {
                reject(new Error(`Processo encerrado com código ${code}`));
            } else {
                resolve();
            }
        });

        child.on('error', (err) => {
            reject(err);
        });
    });
}

// Função para copiar arquivo
function copyFile(source, destination) {
    return new Promise((resolve, reject) => {
        fs.copyFile(source, destination, (err) => {
            if (err) reject(err);
            else resolve();
        });
    });
}

// Função para criar diretório se não existir
function ensureDir(dirPath) {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }
}

// Variável global para armazenar o processo do túnel SSH
let sshTunnelProcess = null;

// Carregar configuração (incluindo token do GitHub)
let config = {};
try {
    const configPath = path.join(__dirname, 'config.json');
    if (fs.existsSync(configPath)) {
        config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    }
} catch (err) {
    console.warn('Aviso: Nao foi possivel carregar config.json');
}

// Helper: baixar arquivo via HTTPS e salvar localmente
import https from 'https';
import { HttpsProxyAgent } from 'https-proxy-agent';

function downloadFile(url, dest) {
    return new Promise((resolve, reject) => {
        // Configurar opções de requisição
        const options = {
            method: 'GET',
            headers: {
                'User-Agent': 'Node.js'
            }
        };
        
        // Adicionar token do GitHub se disponível e for URL do GitHub
        if (config.GITHUB_RBB_TOKEN && url.includes('github.com')) {
            options.headers['Authorization'] = `token ${config.GITHUB_RBB_TOKEN}`;
            options.headers['Accept'] = 'application/vnd.github.raw';
        }
        
        // Configurar proxy se disponível
        if (config.PROXY_URL) {
            options.agent = new HttpsProxyAgent(config.PROXY_URL);
        }
        
        https.get(url, options, (res) => {
            // Lidar com redirecionamentos
            if (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307 || res.statusCode === 308) {
                downloadFile(res.headers.location, dest).then(resolve).catch(reject);
                return;
            }
            
            // Verificar erros HTTP
            if (res.statusCode >= 400) {
                reject(new Error(`HTTP ${res.statusCode}: ${url}`));
                return;
            }
            
            // Download bem-sucedido - acumular dados
            const chunks = [];
            
            res.on('data', (chunk) => {
                chunks.push(chunk);
            });
            
            res.on('end', () => {
                try {
                    const buffer = Buffer.concat(chunks);
                    fs.writeFileSync(dest, buffer);
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

// Verifica e baixa os arquivos nodes necessários para a execução
async function ensureNodesFiles(resultDir) {
    ensureDir(resultDir);
    const labLocal = path.join(resultDir, 'nodes_lab.json');
    const pilotoLocal = path.join(resultDir, 'nodes_piloto.json');

    // Usar GitHub API em vez de raw.githubusercontent.com para repositórios privados
    const labUrl = 'https://api.github.com/repos/RBBNet/participantes/contents/lab/nodes.json';
    const pilotoUrl = 'https://api.github.com/repos/RBBNet/participantes/contents/piloto/nodes.json';

    // Para cada arquivo, se já existir, perguntar se deseja sobrescrever
    if (fs.existsSync(labLocal)) {
        const useExisting = await questionWithDefault(`Arquivo ${labLocal} existe. Baixar e sobrescrever? (s/n)`, 'n');
        if (useExisting.toLowerCase() === 's') {
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
        const useExisting = await questionWithDefault(`Arquivo ${pilotoLocal} existe. Baixar e sobrescrever? (s/n)`, 'n');
        if (useExisting.toLowerCase() === 's') {
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

// Função para criar túnel SSH
async function createSSHTunnel(remoteHost, remotePort, username, sshHost) {
    return new Promise((resolve, reject) => {
        console.log(`\nEstabelecendo tunel SSH para ${remoteHost}...`);
        console.log('Digite sua senha quando solicitado.\n');
        
        // Fechar readline temporariamente para permitir input do SSH
        rl.pause();
        
        sshTunnelProcess = spawn('ssh', [
            '-v',  // Verbose para detectar quando a conexão é estabelecida
            '-N',  // Não executar comando remoto
            '-L', `8545:${remoteHost}:${remotePort}`,
            `${username}@${sshHost}`
        ], { 
            stdio: ['inherit', 'pipe', 'pipe'],
            shell: false
        });
        
        let connected = false;
        let authFailed = false;
        let outputBuffer = '';
        
        sshTunnelProcess.stderr.on('data', (data) => {
            const output = data.toString();
            outputBuffer += output;
            
            // Detectar falha de autenticação
            if (output.includes('Permission denied') || output.includes('Authentication failed')) {
                authFailed = true;
            }
            
            // Detectar conexão bem-sucedida - procurar por mensagens que indicam que o túnel está ativo
            if (output.includes('Entering interactive session') || 
                output.includes('Local forwarding listening') ||
                output.includes('Requesting forwarding') ||
                output.includes('channel') && output.includes('open')) {
                if (!connected) {
                    connected = true;
                    rl.resume();
                    console.log('\nTunel SSH estabelecido com sucesso!');
                    // Aguardar mais um pouco antes de resolver para garantir estabilidade
                    setTimeout(() => resolve(), 1000);
                }
            }
        });
        
        sshTunnelProcess.stdout.on('data', (data) => {
            // Capturar stdout também, caso haja alguma saída
            outputBuffer += data.toString();
        });
        
        sshTunnelProcess.on('error', (err) => {
            rl.resume();
            reject(new Error(`Falha ao criar tunel SSH: ${err.message}`));
        });
        
        sshTunnelProcess.on('close', (code) => {
            rl.resume();
            if (!connected) {
                if (authFailed) {
                    reject(new Error('Falha de autenticacao SSH. Verifique suas credenciais.'));
                } else {
                    // Mostrar parte da saída para debug
                    const lastLines = outputBuffer.split('\n').slice(-5).join('\n');
                    reject(new Error(`Tunel SSH encerrado inesperadamente (código ${code}).\nUltimas mensagens:\n${lastLines}`));
                }
            }
        });
        
        // Timeout de 45 segundos para estabelecer conexão
        setTimeout(() => {
            if (!connected) {
                rl.resume();
                if (sshTunnelProcess) {
                    sshTunnelProcess.kill();
                }
                // Mostrar saída para debug
                const lastLines = outputBuffer.split('\n').slice(-10).join('\n');
                reject(new Error(`Timeout ao estabelecer tunel SSH (45s).\nSaida do SSH:\n${lastLines}`));
            }
        }, 45000);
    });
}

// Função para fechar túnel SSH
function closeSSHTunnel() {
    if (sshTunnelProcess) {
        console.log('\nFechando tunel SSH...');
        sshTunnelProcess.kill();
        sshTunnelProcess = null;
    }
}

// Registrar handlers de limpeza para fechar túnel em caso de interrupção
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

// Menu principal
async function showMenu() {
    clearScreen();
    console.log('==========================================');
    console.log('         Menu de Ferramentas RBB');
    console.log('==========================================');
    console.log('1. Metricas de Producao de Blocos');
    console.log('2. Estatisticas do Tempo de Producao de Blocos');
    console.log('3. Acompanhamento das Iniciativas de Maturacao do Piloto');
    console.log('4. Issues em Producao');
    console.log('5. Sair');
    console.log('==========================================');
    
    const choice = await question('Escolha uma opcao (1-5): ');
    
    try {
        switch (choice.trim()) {
            case '1':
                await blockMetrics();
                break;
            case '2':
                await blockAnalytics();
                break;
            case '3':
                await projectMetrics();
                break;
            case '4':
                await issueMetrics();
                break;
            case '5':
                console.log('Saindo...');
                rl.close();
                process.exit(0);
                break;
            default:
                console.log('Opcao invalida!');
                await pause();
                await showMenu();
        }
    } catch (error) {
        console.error('\nERRO:', error.message);
        await pause();
    }
    
    await showMenu();
}

// Opção 1: Métricas de Produção de Blocos
async function blockMetrics() {
    console.log('\n--- Metricas de Producao de Blocos ---\n');
    
    // Calcular primeiro e último dia do mês anterior como padrão
    const now = new Date();
    const firstDayLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastDayLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);
    
    const defaultStartDate = `${String(firstDayLastMonth.getDate()).padStart(2, '0')}/${String(firstDayLastMonth.getMonth() + 1).padStart(2, '0')}/${firstDayLastMonth.getFullYear()}`;
    const defaultEndDate = `${String(lastDayLastMonth.getDate()).padStart(2, '0')}/${String(lastDayLastMonth.getMonth() + 1).padStart(2, '0')}/${lastDayLastMonth.getFullYear()}`;
    
    const startDate = await questionWithDefault('Digite a data inicial (DD/MM/AAAA)', defaultStartDate);
    const endDate = await questionWithDefault('Digite a data final (DD/MM/AAAA)', defaultEndDate);
    
    // Configuração do túnel SSH
    console.log('\n--- Configuracao do Tunel SSH ---');
    console.log('1. Lab (rbb-writer01.hom.bndes.net - 172.17.64.21)');
    console.log('2. Prod (vrt2675.bndes.net - 172.17.64.34)');
    console.log('3. Customizado');
    
    const tunnelChoice = await question('Escolha o ambiente (1-3): ');
    
    let remoteHost, remotePort, sshHost;
    
    switch (tunnelChoice.trim()) {
        case '1':
            remoteHost = '172.17.64.21';
            remotePort = '8545';
            sshHost = 'rbb-writer01.hom.bndes.net';
            break;
        case '2':
            remoteHost = '172.17.64.34';
            remotePort = '8545';
            sshHost = 'vrt2675.bndes.net';
            break;
        case '3':
            remoteHost = await question('Digite o IP remoto: ');
            remotePort = await questionWithDefault('Digite a porta remota', '8545');
            sshHost = await question('Digite o host SSH: ');
            break;
        default:
            console.log('Opcao invalida! Usando Lab como padrao.');
            remoteHost = '172.17.64.21';
            remotePort = '8545';
            sshHost = 'rbb-writer01.hom.bndes.net';
    }
    
    // Obter username do sistema ou perguntar
    const defaultUsername = process.env.USERNAME || process.env.USER || '';
    const username = await questionWithDefault('Usuario SSH', defaultUsername);
    
    try {
        // Criar túnel SSH
        await createSSHTunnel(remoteHost, remotePort, username, sshHost);
        
        // Aguardar um pouco para garantir que o túnel está completamente estável
        console.log('Aguardando estabilizacao do tunel...');
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Garantir que a pasta result existe e baixar os arquivos nodes se necessário
        const resultDir = path.join(__dirname, 'result');
        
        try {
            await ensureNodesFiles(resultDir);
        } catch (downloadError) {
            console.error(`\nERRO ao baixar arquivos nodes: ${downloadError.message}`);
            console.log('Verifique sua conectividade de rede e configuracoes de proxy.');
            throw downloadError;
        }

        // Provider sempre será localhost:8545 quando usando túnel
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
        // Fechar túnel SSH
        closeSSHTunnel();
    }
    
    await pause();
}

// Opção 2: Estatísticas do Tempo de Produção de Blocos
async function blockAnalytics() {
    console.log('\n--- Estatisticas do Tempo de Producao de Blocos ---\n');
    
    // Calcular mês anterior e ano atual como padrão
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
        
        // Garantir que a pasta result existe
        ensureDir(path.join(__dirname, 'result'));
        
        // Criar arquivo de saída
        const outputPath = path.join(__dirname, 'result', 'Blocos-estat.txt');
        const outputStream = fs.createWriteStream(outputPath);
        
        // Executar o script e redirecionar saída
        const child = spawn('node', [
            path.join(__dirname, 'Blocks', 'block-analytics.js'),
            localPath
        ], { shell: true });
        
        child.stdout.pipe(outputStream);
        child.stderr.pipe(process.stderr);
        
        await new Promise((resolve, reject) => {
            child.on('close', (code) => {
                outputStream.end();
                if (code !== 0) {
                    reject(new Error('Falha ao processar o arquivo'));
                } else {
                    resolve();
                }
            });
        });
        
        console.log('\nProcessamento concluido!');
        console.log(`Resultado salvo em: result\\Blocos-estat.txt`);
        console.log(`Arquivo temporario: ${localPath}`);
        console.log();
        
    } catch (error) {
        console.log(`ERRO: ${error.message}`);
    }
    
    await pause();
}

// Opção 3: Acompanhamento das Iniciativas
async function projectMetrics() {
    console.log('\n--- Acompanhamento das Iniciativas de Maturacao do Piloto ---\n');
    
    // Calcular mês anterior como padrão
    const now = new Date();
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const defaultPeriod = `${String(lastMonth.getMonth() + 1).padStart(2, '0')}/${lastMonth.getFullYear()}`;
    
    const refPeriod = await questionWithDefault('Digite o periodo de referencia (MM/AAAA)', defaultPeriod);
    
    // Calcular o mês anterior ao período de referência para o caminho
    const refPeriodParts = refPeriod.split('/');
    const refMonth = parseInt(refPeriodParts[0]);
    const refYear = parseInt(refPeriodParts[1]);
    
    // Calcular mês anterior (para o caminho do arquivo)
    let pathMonth = refMonth - 1;
    let pathYear = refYear;
    if (pathMonth === 0) {
        pathMonth = 12;
        pathYear = refYear - 1;
    }
    
    // Caminho completo incluindo o nome do arquivo CSV
    const defaultPath = `\\\\bndes.net\\bndes\\Grupos\\BNDES Blockchain\\RBB\\Governança\\09 Indicadores\\${pathYear}-${String(pathMonth).padStart(2, '0')}\\Iniciativas_${pathYear}-${String(pathMonth).padStart(2, '0')}.csv`;
    
    const initiativesPath = await questionWithDefault(
        'Digite o caminho completo para o arquivo CSV de iniciativas',
        defaultPath
    );
    
    // Fechar readline do run.js para permitir que project-metrics.js use o stdin
    rl.close();
    
    await runNode(path.join(__dirname, 'Projects', 'project-metrics.js'), [
        refPeriod,
        initiativesPath
    ]);
    
    // Recriar readline após execução do script filho
    rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });
    
    await pause();
}

// Opção 4: Issues em Produção
async function issueMetrics() {
    console.log('\n--- Issues em Producao ---\n');
    
    // Calcular primeiro e último dia do mês anterior como padrão
    const now = new Date();
    const firstDayLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastDayLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);
    
    const defaultStartDate = `${String(firstDayLastMonth.getDate()).padStart(2, '0')}/${String(firstDayLastMonth.getMonth() + 1).padStart(2, '0')}/${firstDayLastMonth.getFullYear()}`;
    const defaultEndDate = `${String(lastDayLastMonth.getDate()).padStart(2, '0')}/${String(lastDayLastMonth.getMonth() + 1).padStart(2, '0')}/${lastDayLastMonth.getFullYear()}`;
    
    const startDate = await questionWithDefault('Digite a data inicial (DD/MM/AAAA)', defaultStartDate);
    const endDate = await questionWithDefault('Digite a data final (DD/MM/AAAA)', defaultEndDate);
    
    // Fechar readline do run.js para permitir que issue-metrics.js use o stdin
    rl.close();
    
    await runNode(path.join(__dirname, 'Issues', 'issue-metrics.js'), [
        startDate,
        endDate
    ]);
    
    // Recriar readline após execução do script filho
    rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });
    
    await pause();
}

// Iniciar aplicação
console.log('Iniciando Menu de Ferramentas RBB...\n');
showMenu().catch((error) => {
    console.error('Erro fatal:', error);
    rl.close();
    process.exit(1);
});
