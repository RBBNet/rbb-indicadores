import fs from 'fs';
import readline from 'readline';
import * as ss from 'simple-statistics';

async function getBlocks(caminho_do_arquivo_csv) {
    const fileStream = fs.createReadStream(caminho_do_arquivo_csv, { encoding: 'utf8' });
    const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });
 
    let headerRead;
    let headers;
    let numberIndex;
    let timestampIndex;
    const rows = [];
 
    for await (let line of rl) {
        if (!headerRead) {
            headerRead = true;
            headers = line.split(',');
            numberIndex = headers.indexOf('number');
            if (numberIndex == -1) {
                throw Error('Coluna "number" nao encontrada');
            }
            timestampIndex = headers.indexOf('timestamp');
            if (timestampIndex == -1) {
                throw Error('Coluna "timestamp" nao encontrada');
            }
            continue;
        }
        line = line.trim();
        if (line) {
            const row = line.split(',');
            rows.push({
                number: Number(row[numberIndex]),
                timestamp: Number(row[timestampIndex])
            });
        }
    }
 
    // Ordena os blocos pelo número do bloco
    rows.sort((a, b) => a.number - b.number);
 
    return rows;
}

async function main() {
    if (process.argv.length !== 3) {
        console.error('Forma correta: node Blocks/block-analitcs.js <caminho_do_arquivo_csv>');
        process.exit(1);
    }

    const caminho_do_arquivo_csv = process.argv[2];
    const blocks = await getBlocks(caminho_do_arquivo_csv);

    // Calcula as diferenças de tempo entre blocos consecutivos
    const timeDifferences = [];
    for(let i = 1; i < blocks.length; ++i) {
        console.assert(blocks[i].number - blocks[i-1].number == 1, `Descontinuidade na leitura de blocos: ${blocks[i-1].number} --> ${blocks[i].number}`);
        timeDifferences.push(blocks[i].timestamp - blocks[i-1].timestamp);
    }

    // Estatísticas com simple-statistics
    const maxProductionTime = ss.max(timeDifferences);
    const minProductionTime = ss.min(timeDifferences);
    const meanProductionTime = ss.mean(timeDifferences);
    const medianProductionTime = ss.median(timeDifferences);
    const stdDevProductionTime = ss.standardDeviation(timeDifferences);
    const quantile99 = ss.quantile(timeDifferences, 0.99);
    
    console.log(`Blocos produzidos: ${blocks.length}`);
    console.log(`Tempo mínimo: ${minProductionTime}s`);
    console.log(`Tempo médio: ${meanProductionTime.toFixed(3)}s`);
    console.log(`Tempo máximo: ${maxProductionTime}s`);
    console.log(`Mediana: ${medianProductionTime}s`);
    console.log(`Desvio padrão: ${stdDevProductionTime.toFixed(3)}s`);
    console.log(`Quantil 99%: ${quantile99}s`);
}

main();