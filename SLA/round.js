const fs = require('fs');
const csv = require('csv-parser');
const XLSX = require('xlsx');
const RLP = require('rlp');
const ProgressBar = require('progress');
 

function getFileNameFromPath(path) {
    return path.split(/[\/\\]/).pop().replace('.csv', '');
}
 
function readCsv(filePath) {
    return new Promise((resolve, reject) => {
        if (!fs.existsSync(filePath))
            return reject(new Error(`Arquivo não encontrado: ${filePath}`));
        const fileSize = fs.statSync(filePath).size;
        let processedBytes = 0;
        const bar = new ProgressBar('Lendo CSV [:bar] :percent :etas', {
            width: 50,
            total: fileSize
        });
        const results = [];
        fs.createReadStream(filePath)
            .on('data', (chunk) => {
                processedBytes += chunk.length;
                bar.update(processedBytes / fileSize);
            })
            .pipe(csv())
            .on('data', data => results.push(data))
            .on('end', () => {
                bar.terminate();
                console.log(`Blocos carregados: ${results.length}`);
                resolve(results.sort((a, b) => Number(a.number) - Number(b.number)));
            })
            .on('error', reject);
    });
}
 
function getValidators(extraData) {
    if (!extraData?.startsWith('0x')) return null;
    try {
        const decoded = RLP.decode(Buffer.from(extraData.slice(2), 'hex'));
        return decoded[1]?.map(buf => '0x' + buf.toString('hex'));
    } catch (error) {
        console.error("Erro ao decodificar extra_data:", error);
        return null;
    }
}
 
function formatTime(timestamp) {
    const date = new Date((timestamp - 3 * 3600) * 1000);
    return date.toISOString().replace('T', ' ').slice(0, 19);
}
 
function formatDuration(seconds) {
    const h = Math.floor(seconds / 3600).toString().padStart(2, '0');
    const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, '0');
    const s = Math.floor(seconds % 60).toString().padStart(2, '0');
    return `${h}:${m}:${s}`;
}


async function analyzeValidatorDowntime(filePath, outputPath) {
    try {
        const blocks = await readCsv(filePath);
        if (blocks.length === 0) throw new Error("Nenhum bloco encontrado");
 

        const validators = getValidators(blocks[0].extra_data);
        if (!validators) throw new Error("Ciclo de validadores não encontrado");
        console.log(`Validadores detectados (${validators.length}):`, validators);
        
        
        const downtimeTotals = {};
        const downtimeDetalhado = [];
        const validatorState = {};

        validators.forEach(v => {
            downtimeTotals[v] = { total: 0, eventos: 0 };
            validatorState[v] = "online";
        });

        const cycleLength = validators.length;
        const totalCycles = Math.floor(blocks.length / cycleLength);
 
        for (let cycleIdx = 0; cycleIdx < totalCycles; cycleIdx++) {
            const i = cycleIdx * cycleLength;
            const cycle = blocks.slice(i, i + cycleLength);
            if (cycle.length < cycleLength) break;
 
            const cycleStartTimestamp = Number(cycle[0].timestamp);
            const cycleEndTimestamp = Number(cycle[cycle.length - 1].timestamp);
            const realCycleDuration = cycleEndTimestamp - cycleStartTimestamp;
            const offset = cycleIdx % validators.length;

            for (let j = 0; j < cycleLength; j++) {
                const expectedValidator = validators[(offset + j) % validators.length];
                const presente = cycle.some(block => block.miner === expectedValidator);
                const prevState = validatorState[expectedValidator];
                let downtime = 0;
                let status = "online";
 
                if (!presente) {
                    if (prevState === "online") {
                        downtime = realCycleDuration / 2;
                        status = "offline";
                    } else if (prevState === "offline") {
                        downtime = realCycleDuration;
                        status = "permaneceu offline";
                    }
                    validatorState[expectedValidator] = "offline";
                } else {
                    if (prevState === "offline") {
                        downtime = realCycleDuration / 2;
                        status = "retornou";
                    }
                    validatorState[expectedValidator] = "online";
                }
 
                // Se houve downtime, registra o evento
                if (downtime > 0) {
                    downtimeTotals[expectedValidator].total += downtime;
                    downtimeTotals[expectedValidator].eventos++;
                    downtimeDetalhado.push({
                        "Validador": expectedValidator,
                        "Bloco Inicial": cycle[0].number,
                        "Bloco Final": cycle[cycle.length - 1].number,
                        "Início": formatTime(cycleStartTimestamp),
                        "Fim": formatTime(cycleEndTimestamp),
                        "Downtime Aplicado": formatDuration(downtime),
                        "Status": status
                    });
                }
            }
        }
        const downtimeTotalSheet = validators.map(v => ({
            "Validador": v,
            "Tempo Offline Total (s)": downtimeTotals[v].total.toFixed(2),
            "Tempo Offline Total": formatDuration(downtimeTotals[v].total)
        }));
        const downtimeDetalhadoSheet = downtimeDetalhado;
        const resumoSheet = validators.map(v => ({
            "Validador": v,
            "Tempo Offline Total (s)": downtimeTotals[v].total.toFixed(2),
            "Tempo Offline Total": formatDuration(downtimeTotals[v].total),
            "Total de Eventos": downtimeTotals[v].eventos
        }));
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(downtimeTotalSheet), 'Downtime Total');
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(downtimeDetalhadoSheet), 'Downtime Detalhado');
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(resumoSheet), 'Resumo');
        XLSX.writeFile(wb, outputPath);
        console.log(`Relatório gerado: ${outputPath}`);
    } catch (error) {
        console.error("Erro na análise:", error);
    }
}

const inputFile = process.argv[2] || './blocks.csv';
const outputFile = `./validadores_${getFileNameFromPath(inputFile)}.xlsx`;
analyzeValidatorDowntime(inputFile, outputFile);