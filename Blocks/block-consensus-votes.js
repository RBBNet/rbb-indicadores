import fs from 'fs';
import https from 'https';
import path from 'path';
import readline from 'readline';
import { fileURLToPath } from 'url';
import { decodeRlp, getAddress } from 'ethers';
import { HttpsProxyAgent } from 'https-proxy-agent';

const BRAZIL_TIMEZONE = 'America/Sao_Paulo';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let config = {};
try {
    const configPath = path.join(__dirname, '..', 'config.json');
    if (fs.existsSync(configPath)) {
        config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    }
} catch (error) {
    console.warn(`Aviso: nao foi possivel carregar config.json: ${error.message}`);
}

function printUsage() {
    console.error('Parametros incorretos.');
    console.error('Uso: node Blocks/block-consensus-votes.js <arquivo-blocos.csv> <pasta-mensal-result> <ambiente> <arquivo-saida.csv>');
}

function stripHexPrefix(value) {
    return String(value || '').trim().replace(/^0x/i, '');
}

function normalizeHex(value) {
    const stripped = stripHexPrefix(value);
    return stripped ? `0x${stripped}` : '0x';
}

function normalizeAddress(value) {
    const hex = normalizeHex(value);
    if (!/^0x[0-9a-fA-F]{40}$/.test(hex)) {
        return null;
    }

    try {
        return getAddress(hex);
    } catch {
        return hex.toLowerCase();
    }
}

function isAddressLike(value) {
    return normalizeAddress(value) !== null;
}

function classifyVoteFlag(flagValue) {
    if (Array.isArray(flagValue)) {
        if (flagValue.length === 0) {
            return 'unknown';
        }
        return classifyVoteFlag(flagValue[0]);
    }

    const stripped = stripHexPrefix(flagValue).toLowerCase();
    if (!stripped) {
        return 'unknown';
    }

    if (/^0+$/.test(stripped)) {
        return 'exclusion';
    }

    if (/^f+$/i.test(stripped)) {
        return 'inclusion';
    }

    if (/^0*1$/.test(stripped)) {
        return 'inclusion';
    }

    return 'unknown';
}

function parseVoteField(voteField) {
    if (Array.isArray(voteField)) {
        if (voteField.length === 0) {
            return null;
        }

        if (voteField.length === 1) {
            return parseVoteField(voteField[0]);
        }

        const targetAddress = normalizeAddress(voteField[0]);
        const voteType = classifyVoteFlag(voteField[1]);

        if (!targetAddress || voteType === 'unknown') {
            return null;
        }

        return {
            targetAddress,
            voteType,
            rawVote: JSON.stringify(voteField)
        };
    }

    const stripped = stripHexPrefix(voteField);
    if (!stripped) {
        return null;
    }

    if (stripped.length < 40) {
        return {
            targetAddress: null,
            voteType: classifyVoteFlag(voteField),
            rawVote: normalizeHex(voteField)
        };
    }

    const targetAddress = normalizeAddress(`0x${stripped.slice(0, 40)}`);
    const flagHex = stripped.length > 40 ? `0x${stripped.slice(40)}` : '0x';
    const voteType = classifyVoteFlag(flagHex);

    if (!targetAddress || voteType === 'unknown') {
        return null;
    }

    return {
        targetAddress,
        voteType,
        rawVote: normalizeHex(voteField)
    };
}

function parseObservedVote(extraData) {
    try {
        const decoded = decodeRlp(extraData);
        if (!Array.isArray(decoded) || decoded.length < 3) {
            return null;
        }

        const vote = parseVoteField(decoded[2]);
        if (!vote) {
            return null;
        }

        const validators = Array.isArray(decoded[1])
            ? decoded[1].map(normalizeAddress).filter(Boolean)
            : [];

        return {
            ...vote,
            validatorCount: validators.length
        };
    } catch {
        return null;
    }
}

function buildNodeMetadataMap(monthDir) {
    const files = ['nodes_lab.json', 'nodes_piloto.json'];
    const nodeMap = new Map();

    const registerNode = (rawAddress, meta) => {
        const address = normalizeAddress(rawAddress);
        if (!address || nodeMap.has(address.toLowerCase())) {
            return;
        }

        nodeMap.set(address.toLowerCase(), meta);
    };

    for (const fileName of files) {
        const filePath = path.join(monthDir, fileName);
        if (!fs.existsSync(filePath)) {
            continue;
        }

        let orgEntries;
        try {
            orgEntries = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        } catch (error) {
            console.warn(`Aviso: nao foi possivel ler ${filePath}: ${error.message}`);
            continue;
        }

        if (!Array.isArray(orgEntries)) {
            continue;
        }

        for (const orgEntry of orgEntries) {
            const organization = orgEntry.organization || orgEntry.org || 'Desconhecida';
            const nodes = Array.isArray(orgEntry.nodes) ? orgEntry.nodes : [];

            for (const node of nodes) {
                const meta = {
                    organization,
                    nodeName: node.name || node.id || node.address || 'Desconhecido'
                };

                const candidateValues = Object.values(node).filter(isAddressLike);
                for (const candidate of candidateValues) {
                    registerNode(candidate, meta);
                }
            }
        }
    }

    return nodeMap;
}

function downloadFile(url, destination) {
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

        https.get(url, options, (response) => {
            if ([301, 302, 307, 308].includes(response.statusCode)) {
                downloadFile(response.headers.location, destination).then(resolve).catch(reject);
                return;
            }

            if (response.statusCode >= 400) {
                reject(new Error(`HTTP ${response.statusCode}: ${url}`));
                return;
            }

            const chunks = [];
            response.on('data', chunk => chunks.push(chunk));
            response.on('end', () => {
                try {
                    fs.writeFileSync(destination, Buffer.concat(chunks));
                    resolve();
                } catch (error) {
                    if (fs.existsSync(destination)) {
                        fs.unlinkSync(destination);
                    }
                    reject(error);
                }
            });
            response.on('error', reject);
        }).on('error', reject);
    });
}

async function ensureNodesFiles(monthDir) {
    fs.mkdirSync(monthDir, { recursive: true });

    const files = [
        {
            fileName: 'nodes_lab.json',
            url: 'https://api.github.com/repos/RBBNet/participantes/contents/lab/nodes.json'
        },
        {
            fileName: 'nodes_piloto.json',
            url: 'https://api.github.com/repos/RBBNet/participantes/contents/piloto/nodes.json'
        }
    ];

    for (const file of files) {
        const filePath = path.join(monthDir, file.fileName);
        if (fs.existsSync(filePath)) {
            continue;
        }

        try {
            await downloadFile(file.url, filePath);
            console.log(`Metadado baixado: ${file.fileName}`);
        } catch (error) {
            console.warn(`Aviso: nao foi possivel baixar ${file.fileName}: ${error.message}`);
        }
    }
}

function resolveParticipant(nodeMap, address) {
    const normalized = normalizeAddress(address);
    if (!normalized) {
        return {
            address: address || '',
            organization: 'Desconhecida',
            nodeName: 'Desconhecido'
        };
    }

    const metadata = nodeMap.get(normalized.toLowerCase());
    return {
        address: normalized,
        organization: metadata?.organization || 'Desconhecida',
        nodeName: metadata?.nodeName || 'Desconhecido'
    };
}

function formatBlockDate(timestampSeconds) {
    const timestamp = Number(timestampSeconds);
    if (!Number.isFinite(timestamp)) {
        return '';
    }

    return new Intl.DateTimeFormat('pt-BR', {
        timeZone: BRAZIL_TIMEZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    }).format(new Date(timestamp * 1000));
}

function csvEscape(value) {
    const text = String(value ?? '');
    if (!/[";\n\r]/.test(text)) {
        return text;
    }

    return `"${text.replace(/"/g, '""')}"`;
}

function writeCsv(outputPath, rows) {
    const headers = [
        'block_number',
        'block_timestamp',
        'block_date',
        'environment',
        'validator_count',
        'voter_address',
        'voter_institution',
        'voter_node',
        'target_address',
        'target_institution',
        'target_node',
        'vote_type',
        'raw_vote',
        'block_hash'
    ];

    const lines = [headers.join(';')];
    for (const row of rows) {
        lines.push(headers.map(header => csvEscape(row[header])).join(';'));
    }

    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, `${lines.join('\n')}\n`, 'utf8');
}

async function main() {
    if (process.argv.length !== 6) {
        printUsage();
        process.exit(1);
    }

    const blocksPath = process.argv[2];
    const monthDir = process.argv[3];
    const environment = String(process.argv[4] || '').toLowerCase();
    const outputPath = process.argv[5];

    if (!fs.existsSync(blocksPath)) {
        throw new Error(`Arquivo de blocos nao encontrado: ${blocksPath}`);
    }

    await ensureNodesFiles(monthDir);

    const nodeMap = buildNodeMetadataMap(monthDir);
    const rows = [];
    let headers = null;
    let parseErrors = 0;

    const rl = readline.createInterface({
        input: fs.createReadStream(blocksPath),
        crlfDelay: Infinity
    });

    for await (const line of rl) {
        if (!headers) {
            headers = line.split(',');
            continue;
        }

        if (!line.trim()) {
            continue;
        }

        const parts = line.split(',');
        const extraData = parts[headers.indexOf('extra_data')];
        const blockNumber = parts[headers.indexOf('number')];
        const blockTimestamp = parts[headers.indexOf('timestamp')];
        const miner = parts[headers.indexOf('miner')];
        const blockHash = parts[headers.indexOf('hash')];

        const parsedVote = parseObservedVote(extraData);
        if (!parsedVote) {
            continue;
        }

        const voter = resolveParticipant(nodeMap, miner);
        const target = resolveParticipant(nodeMap, parsedVote.targetAddress);

        rows.push({
            block_number: blockNumber,
            block_timestamp: blockTimestamp,
            block_date: formatBlockDate(blockTimestamp),
            environment,
            validator_count: parsedVote.validatorCount,
            voter_address: voter.address,
            voter_institution: voter.organization,
            voter_node: voter.nodeName,
            target_address: target.address,
            target_institution: target.organization,
            target_node: target.nodeName,
            vote_type: parsedVote.voteType,
            raw_vote: parsedVote.rawVote,
            block_hash: blockHash
        });
    }

    if (!headers) {
        throw new Error(`Arquivo CSV vazio ou invalido: ${blocksPath}`);
    }

    writeCsv(outputPath, rows);

    console.log(`Votos observados: ${rows.length}`);
    console.log(`Arquivo gerado: ${outputPath}`);
    if (nodeMap.size === 0) {
        console.log('Aviso: nenhum arquivo nodes_*.json encontrado na pasta mensal. O CSV foi gerado com instituicoes desconhecidas quando necessario.');
    }
    if (parseErrors > 0) {
        console.log(`Aviso: ${parseErrors} blocos tiveram erro de parse no extra_data.`);
    }
    if (rows.length === 0) {
        console.log('Nenhum voto observavel foi encontrado no extra_data para o periodo informado.');
    }
}

main().catch((error) => {
    console.error(`ERRO: ${error.message}`);
    process.exit(1);
});