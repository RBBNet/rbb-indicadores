import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { fileURLToPath } from 'url';
import { decodeRlp } from 'ethers';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.join(__dirname, '..');
const defaultDumpRoot = path.join(projectRoot, 'result', 'dump');

function toHex(value) {
    return typeof value === 'string' ? value : String(value ?? '');
}

function printUsage() {
    console.error('Uso: node Blocks/decode-extra-data.js <numero-do-bloco> [arquivo-ou-pasta]');
    console.error('Exemplo: node Blocks/decode-extra-data.js 16476213');
    console.error('Exemplo: node Blocks/decode-extra-data.js 16476213 .\\result\\dump\\prd\\2026-04\\blocks2026-04.csv');
}

function collectBlockFiles(inputPath) {
    const resolvedPath = inputPath ? path.resolve(inputPath) : defaultDumpRoot;
    if (!fs.existsSync(resolvedPath)) {
        throw new Error(`Caminho nao encontrado: ${resolvedPath}`);
    }

    const stats = fs.statSync(resolvedPath);
    if (stats.isFile()) {
        return [resolvedPath];
    }

    const files = [];
    const stack = [resolvedPath];
    while (stack.length > 0) {
        const currentDir = stack.pop();
        const entries = fs.readdirSync(currentDir, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.join(currentDir, entry.name);
            if (entry.isDirectory()) {
                stack.push(fullPath);
                continue;
            }

            if (/^blocks\d{4}-\d{2}\.csv$/i.test(entry.name)) {
                files.push(fullPath);
            }
        }
    }

    return files.sort();
}

async function findBlockInFile(filePath, targetBlock) {
    const stream = fs.createReadStream(filePath);
    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
    let headers = null;

    try {
        for await (const line of rl) {
            if (!headers) {
                headers = line.split(',');
                continue;
            }

            if (!line.startsWith(`${targetBlock},`)) {
                continue;
            }

            const parts = line.split(',');
            const get = (name) => parts[headers.indexOf(name)];
            const extraData = get('extra_data');
            const decodedExtraData = decodeRlp(extraData);
            return {
                filePath,
                block_number: get('number'),
                block_hash: get('hash'),
                extra_data: extraData,
                decoded_extra_data: decodedExtraData
            };
        }
    } finally {
        rl.close();
        stream.close();
    }

    return null;
}

function extractDumpContext(filePath) {
    const relativePath = path.relative(defaultDumpRoot, filePath);
    const parts = relativePath.split(path.sep);
    return {
        environment: parts.length >= 3 ? parts[0] : '',
        month: parts.length >= 3 ? parts[1] : ''
    };
}

function formatDecodedExtraData(decodedExtraData) {
    if (!Array.isArray(decodedExtraData)) {
        return {
            raw_list: decodedExtraData,
            named_fields: null
        };
    }

    const validators = Array.isArray(decodedExtraData[1])
        ? decodedExtraData[1].map(toHex)
        : [];
    const voteField = Array.isArray(decodedExtraData[2])
        ? {
            raw: decodedExtraData[2].map(toHex),
            target: toHex(decodedExtraData[2][0] || ''),
            flag: toHex(decodedExtraData[2][1] || '')
        }
        : {
            raw: toHex(decodedExtraData[2]),
            target: '',
            flag: ''
        };
    const seals = Array.isArray(decodedExtraData[4])
        ? decodedExtraData[4].map(toHex)
        : [];

    return {
        raw_list: decodedExtraData,
        named_fields: {
            vanity: toHex(decodedExtraData[0]),
            validators,
            vote: voteField,
            round: toHex(decodedExtraData[3]),
            seals
        }
    };
}

function formatOutput(match) {
    const dumpContext = extractDumpContext(match.filePath);
    return {
        block: {
            number: match.block_number,
            hash: match.block_hash,
            source_file: match.filePath,
            environment: dumpContext.environment,
            month: dumpContext.month
        },
        extra_data_raw: match.extra_data,
        extra_data_decoded: formatDecodedExtraData(match.decoded_extra_data)
    };
}

async function main() {
    const blockNumber = process.argv[2];
    const inputPath = process.argv[3];

    if (!blockNumber || !/^\d+$/.test(blockNumber)) {
        printUsage();
        process.exit(1);
    }

    const files = collectBlockFiles(inputPath);
    if (files.length === 0) {
        throw new Error('Nenhum arquivo blocksAAAA-MM.csv foi encontrado.');
    }

    for (const filePath of files) {
        const match = await findBlockInFile(filePath, blockNumber);
        if (!match) {
            continue;
        }

        console.log(JSON.stringify(formatOutput(match), null, 2));
        return;
    }

    console.error(`Bloco ${blockNumber} nao encontrado em ${inputPath ? path.resolve(inputPath) : defaultDumpRoot}`);
    process.exit(2);
}

main().catch((error) => {
    console.error(error.message);
    process.exit(1);
});