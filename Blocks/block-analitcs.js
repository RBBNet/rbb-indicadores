import fs from 'fs';
import readline from 'readline';
import * as ss from 'simple-statistics';

async function sortCSV(caminho_do_arquivo_csv) {
    const fileStream = fs.createReadStream(caminho_do_arquivo_csv, { encoding: 'utf8' });
    const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });
 
    let header;
    let headers;
    const rows = [];
 
    for await (const line of rl) {
        if (!header) {
            header = line;
            headers = header.split(',');
        } else if (line.trim()) {
            const row = line.split(',');
            const numberIndex = headers.indexOf('number');
            const timestampIndex = headers.indexOf('timestamp');
 
            if (numberIndex !== -1 && timestampIndex !== -1) {
                rows.push({
                    number: Number(row[numberIndex]),
                    timestamp: Number(row[timestampIndex])
                });
            }
        }
    }
 
    // Ordena os blocos pelo número do bloco
    rows.sort((a, b) => a.number - b.number);
 
    // Calcula as diferenças de tempo entre blocos consecutivos
    const timeDifferences = rows.slice(1).map((row, i) => row.timestamp - rows[i].timestamp);
 
    // Estatísticas com simple-statistics
    const maxProductionTime = ss.max(timeDifferences);
    const minProductionTime = ss.min(timeDifferences);
    const meanProductionTime = ss.mean(timeDifferences);
    const stdDevProductionTime = ss.standardDeviation(timeDifferences);
 
    return { maxProductionTime, minProductionTime, meanProductionTime, stdDevProductionTime };
}
const args = process.argv.slice(2);
if (args.length !== 1) {
    console.error('Forma correta: node Blocks/block-analitcs.js <caminho_do_arquivo_csv>');
    process.exit(1);
}
const caminho_do_arquivo_csv = args[0];
sortCSV(caminho_do_arquivo_csv);

    const { maxProductionTime, minProductionTime, meanProductionTime, stdDevProductionTime } = await sortCSV(caminho_do_arquivo_csv);
    console.log(`Tempo máximo/bloco: ${maxProductionTime} segundos`);
    console.log(`Tempo mínimo/bloco: ${minProductionTime} segundos`);
    console.log(`Tempo médio/bloco: ${meanProductionTime.toFixed(3)} segundos`);
    console.log(`Desvio padrão do tempo de produção: ${stdDevProductionTime.toFixed(3)} segundos`);
