const fs = require('fs');
const csv = require('csv-parser');
const XLSX = require('xlsx');
const RLP = require('rlp');
const ProgressBar = require('progress');

// Funções auxiliares
function getFileNameFromPath(path) {
    return path.split(/[\/\\]/).pop().replace('.csv', '');
}



function readCsv(filePath) {
    return new Promise((resolve, reject) => {
        if (!fs.existsSync(filePath)) return reject(new Error(`Arquivo não encontrado: ${filePath}`));
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
            .on('data', (data) => results.push(data))
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
        console.error("Erro ao decodificar extradata:", error);
        return null;
    }
}

function formatTime(timestamp) {
    const date = new Date((timestamp - 3 * 3600) * 1000); //Horário de Brasília
    return date.toISOString().replace('T', ' ').slice(0, 19);
}

function formatDuration(seconds) {
    const h = Math.floor(seconds / 3600).toString().padStart(2, '0');
    const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, '0');
    const s = Math.floor(seconds % 60).toString().padStart(2, '0');
    return `${h}:${m}:${s}`;
}
// Função principal de análise

async function analyzeValidatorDowntime(filePath, outputPath) {
    try {
        // 1. Carregar e processar blocos
        const blocks = await readCsv(filePath);
        if (blocks.length === 0) return console.error("Nenhum bloco encontrado");
        // 2. Extrair ciclo de validadores
        const validators = getValidators(blocks[0].extra_data);
        if (!validators) return console.error("Ciclo de validadores não encontrado");
        console.log(`Validadores detectados (${validators.length}):`, validators);
        // 3. Inicializar estruturas de dados

        const detalhes = [];
        const estatisticas = {};
        const porHora = {};
        validators.forEach(v => {
            estatisticas[v] = { total: 0, eventos: 0 };
            porHora[v] = {};
        });
        // 4. Processar cada ciclo
            const cycleLength = validators.length;
            const validatorStates = validators.reduce((acc, validador) => {
                acc[validador] = {
                    lastActiveCycle: null,
                    currentStatus: 'online',
                    pendingDowntime: 0
                };
                return acc;
            }, {});
            for (let i = 0; i < blocks.length; i += cycleLength) {
                const ciclo = blocks.slice(i, i + cycleLength);
                if (ciclo.length < cycleLength) break;
                const cicloStart = Number(ciclo[0].timestamp);
                const cicloEnd = Number(ciclo[ciclo.length - 1].timestamp);
                const cycleDuration = cicloEnd - cicloStart;

                // Mapear validadores presentes neste ciclo
                const presentes = new Set(ciclo.map(b => b.miner));
                validators.forEach(validador => {
                    const state = validatorStates[validador];
                    const expectedPosition = (i / cycleLength) % validators.length;
                    const isCurrentValidator = validators[expectedPosition] === validador;
                    if (!isCurrentValidator) return;
                    const presente = presentes.has(validador);
                    const horaKey = new Date(cicloStart * 1000)
                    .toLocaleString('en-US', {
                        timeZone: 'America/Sao_Paulo',
                        hour12: false,
                        year: 'numeric',
                        month: '2-digit',
                        day: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit'
                    })
                    .replace(/(\d+\/\d+\/\d+), (\d+:\d+):\d+/, '$1 $2:00')
                    .replace(/(\d{2})\/(\d{2})\/(\d{4})/, '$3-$1-$2')
                    .replace(',', '');
                    // Determinar status baseado nas regras
                    let duration = 0;
                    let status = 'online';
                    if (!presente) {
                        if (state.currentStatus === 'online') {
                            // Regra corrigida: Online -> Offline (metade do ciclo como offline)
                            status = 'offline';
                            duration = cycleDuration / 2;
                            state.pendingDowntime = cycleDuration / 2;
                        } else {
                            // Regra: Offline -> Offline (todo o ciclo como offline)
                            status = 'permaneceu offline';
                            duration = cycleDuration;
                            state.pendingDowntime += cycleDuration;
                        }
                    } else {
                        if (state.currentStatus === 'offline') {
                            // Regra: Offline -> Online (metade do ciclo atual)
                            status = 'retornou';
                            duration = cycleDuration / 2;
                            state.pendingDowntime = 0;
                        }
                        state.currentStatus = 'online';
                    }
                    // Registrar apenas se houver downtime
                    if (status !== 'online') {

                        // Atualizar estatísticas gerais
                        estatisticas[validador].total += duration;
                        if (status !== 'permaneceu offline') {
                            estatisticas[validador].eventos++;
                        }

                        // Registrar detalhes
                        detalhes.push({
                            Validador: validador,
                            "Bloco Inicial": ciclo[0].number,
                            "Bloco Final": ciclo[ciclo.length - 1].number,
                            Início: formatTime(cicloStart),
                            Fim: formatTime(cicloEnd),
                            "Duração (s)": duration,
                            "Duração Formatada": formatDuration(duration),
                            Status: status
                        });

                        // Atualizar estatísticas por hora
                        if (!porHora[validador][horaKey]) {
                            porHora[validador][horaKey] = { tempo: 0, eventos: 0 };
                        }
                        porHora[validador][horaKey].tempo += duration;
                        porHora[validador][horaKey].eventos++;
                    }

                    // Atualizar estado atual
                    if (!presente) state.currentStatus = 'offline';
                });
            }

        // 5. Preparar dados para exportação
        const resumo = validators.map(validador => ({
            Validador: validador,
            "Total de Eventos": estatisticas[validador].eventos
        }));
        const estatisticasHorarias = [];
        validators.forEach(validador => {
            Object.entries(porHora[validador]).forEach(([hora, dados]) => {
                estatisticasHorarias.push({
                    Validador: validador,
                    Hora: hora,
                    "Tempo Offline": formatDuration(dados.tempo),
                    "Eventos": dados.eventos
                });
            });
        });

        // 6. Gerar arquivo Excel
        const wb = XLSX.utils.book_new();       

        // Aba Resumo
        XLSX.utils.book_append_sheet(wb,
            XLSX.utils.json_to_sheet(resumo),
            'Resumo');

        // Aba Detalhes
        XLSX.utils.book_append_sheet(wb,
            XLSX.utils.json_to_sheet(detalhes.map(d => ({
                ...d,
                "Duração Formatada": formatDuration(d["Duração (s)"])
            }))),
            'Downtime Detalhado');

        // Aba Estatísticas Horárias
        XLSX.utils.book_append_sheet(wb,
            XLSX.utils.json_to_sheet(estatisticasHorarias),
            'Estatística Horária');
        XLSX.writeFile(wb, outputPath);
        console.log(`Relatório gerado: ${outputPath}`);
    } catch (error) {
        console.error("Erro na análise:", error);
    }
}

// Execução
const inputFile = process.argv[2] || './blocks.csv';
const outputFile = `./validadores_${getFileNameFromPath(inputFile)}.xlsx`;

analyzeValidatorDowntime(inputFile, outputFile);