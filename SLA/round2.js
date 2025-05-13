import fs from 'fs';
import csv from 'csv-parser';
import XLSX from 'xlsx';
import RLP from 'rlp';
import ProgressBar from 'progress';

function getFileNameFromPath(path) {
  return path.split(/[\\/\\\\]/).pop().replace('.csv', '');
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
      .on('data', chunk => {
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
    console.error('Erro ao decodificar extra_data:', error);
    return null;
  }
}

function formatTime(timestamp) {
  const date = new Date((timestamp - 3 * 3600) * 1000);
  const pad = n => n.toString().padStart(2, '0');
  return `${pad(date.getUTCDate())}/${pad(date.getUTCMonth()+1)}/${date.getUTCFullYear()} ` +
         `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}`;
}

function formatDuration(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const pad = n => n.toString().padStart(2, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

async function analyzeValidatorDowntime(filePath, outputPath) {
  try {
    const blocks = await readCsv(filePath);
    if (!blocks.length) throw new Error('Nenhum bloco encontrado');

    // Determina validadores iniciais e quorum BFT
    const validators = getValidators(blocks[0].extra_data);
    if (!validators) throw new Error('Ciclo de validadores não encontrado');
    const n = validators.length;
    const requiredUp = Math.ceil((2 * n) / 3);
    console.log(`Validadores: ${n}, quorum BFT (up): ${requiredUp}`);

    // Estatísticas
    const downtimeTotals = {};
    const downtimeDetalhado = [];
    const validatorState = {};
    validators.forEach(v => {
      downtimeTotals[v] = { total: 0, eventos: 0 };
      validatorState[v] = 'online';
    });

    const cycleSize = n;
    const totalCycles = Math.floor(blocks.length / cycleSize);

    for (let cycleIdx = 0; cycleIdx < totalCycles; cycleIdx++) {
      const i = cycleIdx * cycleSize;
      const cycle = blocks.slice(i, i + cycleSize);
      if (cycle.length < cycleSize) break;

      const startTs = Number(cycle[0].timestamp);
      const endTs = Number(cycle[cycle.length - 1].timestamp);
      const duration = endTs - startTs;

      // Lista de validators esperados para o ciclo atual
      const cycleValidators = getValidators(cycle[0].extra_data);
      if (!cycleValidators) continue;

      const presentCount = cycleValidators.filter(v =>
        cycle.some(b => b.miner === v)
      ).length;

      // Se presentCount < requiredUp, parada global
      if (presentCount < requiredUp) {
        console.log(`Parada global no ciclo ${cycleIdx}: apenas ${presentCount}/${n} validadores ativos`);
        // reseta estados (evita marcar transições incorretas)
        validators.forEach(v => validatorState[v] = 'online');
        continue;
      }

      // Caso normal: contabiliza downtime individual
      cycleValidators.forEach(v => {
        const prev = validatorState[v];
        const isPresent = cycle.some(b => b.miner === v);
        let downtime = 0;
        let status = 'online';

        if (!isPresent) {
          downtime = (prev === 'online') ? duration / 2 : duration;
          status = (prev === 'online') ? 'offline' : 'permaneceu offline';
          validatorState[v] = 'offline';
        } else if (prev === 'offline') {
          downtime = duration / 2;
          status = 'retornou';
          validatorState[v] = 'online';
        }

        if (downtime > 0) {
          downtimeTotals[v].total += downtime;
          downtimeTotals[v].eventos++;
          downtimeDetalhado.push({
            Validador: v,
            'Bloco Inicial': cycle[0].number,
            'Bloco Final': cycle[cycle.length - 1].number,
            'Data Inicial': formatTime(startTs),
            'Data Final': formatTime(endTs),
            DowntimeSegundos: downtime,
            Status: status
          });
        }
      });
    }

    // Exporta resultados para Excel
    const totalSheet = validators.map(v => ({
      Validador: v,
      'Tempo Offline Total (s)': downtimeTotals[v].total.toFixed(2),
      'Tempo Offline Total': formatDuration(downtimeTotals[v].total),
      'Total de Eventos': downtimeTotals[v].eventos
    }));

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(totalSheet), 'Downtime Total');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(downtimeDetalhado), 'Downtime Detalhado');

    // Quedas contínuas
    const quedaContinua = [];
    validators.forEach(v => {
      const events = downtimeDetalhado
        .filter(e => e.Validador === v)
        .sort((a, b) => Number(a['Bloco Inicial']) - Number(b['Bloco Inicial']));
      let segment = null;
      events.forEach(e => {
        if (!segment && e.Status === 'offline') {
          segment = { ...e };
        } else if (segment) {
          segment.DowntimeSegundos += e.DowntimeSegundos;
          segment['Bloco Final'] = e['Bloco Final'];
          segment['Data Final'] = e['Data Final'];
          if (e.Status === 'retornou') {
            quedaContinua.push(segment);
            segment = null;
          }
        }
      });
    });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(quedaContinua), 'Queda Contínua');

    XLSX.writeFile(wb, outputPath);
    console.log(`Relatório gerado: ${outputPath}`);
  } catch (error) {
    console.error('Erro na análise:', error);
  }
}

const inputFile = process.argv[2] || './blocks.csv';
const outputFile = `./validadores_${getFileNameFromPath(inputFile)}.xlsx`;
analyzeValidatorDowntime(inputFile, outputFile);
