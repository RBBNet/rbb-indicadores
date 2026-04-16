import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const RESULT_DIR = path.resolve(__dirname, '..', 'result');
const DEFAULT_OUTPUT_PATH = path.join(RESULT_DIR, 'Indicadores-evolucao.html');

function parsePeriod(period) {
    const match = /^([0-1]\d)\/(20\d{2})$/.exec(String(period).trim());
    if (!match) {
        return null;
    }

    return {
        month: parseInt(match[1], 10),
        year: parseInt(match[2], 10)
    };
}

function comparePeriods(left, right) {
    if (left.year !== right.year) {
        return left.year - right.year;
    }
    return left.month - right.month;
}

function formatMonthHeader(headerValue) {
    const match = /^01\/(0[1-9]|1[0-2])\/(20\d{2})$/.exec(String(headerValue).trim());
    if (!match) {
        return headerValue;
    }

    const month = parseInt(match[1], 10);
    const year = match[2];
    const labels = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
    return `${labels[month - 1]}/${year.slice(-2)}`;
}

function buildRowspans(items) {
    const rowspans = new Array(items.length).fill(0);
    let i = 0;
    while (i < items.length) {
        let j = i + 1;
        while (j < items.length && items[j] === items[i]) {
            j += 1;
        }
        rowspans[i] = j - i;
        i = j;
    }
    return rowspans;
}

function parseInitiativesCsv(filePath, startPeriod, endPeriod) {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split(/\r?\n/).filter(line => line.trim().length > 0);
    if (lines.length === 0) {
        throw new Error('Arquivo de iniciativas vazio');
    }

    const headers = lines[0].split(';').map(item => item.trim());
    const rawMonthHeaders = headers.slice(3);
    const monthMeta = rawMonthHeaders.map((value, index) => {
        const match = /^01\/(0[1-9]|1[0-2])\/(20\d{2})$/.exec(String(value).trim());
        if (!match) {
            return { index, period: null };
        }

        return {
            index,
            period: {
                month: parseInt(match[1], 10),
                year: parseInt(match[2], 10)
            }
        };
    });

    const filteredIndexes = monthMeta
        .filter(meta => meta.period !== null)
        .filter(meta => comparePeriods(meta.period, startPeriod) >= 0 && comparePeriods(meta.period, endPeriod) <= 0)
        .map(meta => meta.index);

    if (filteredIndexes.length === 0) {
        throw new Error('Nenhuma coluna de periodo encontrada no intervalo informado.');
    }

    const monthHeaders = filteredIndexes.map(index => formatMonthHeader(rawMonthHeaders[index]));
    const rows = [];
    let lastInitiative = '';
    let lastResponsibles = '';

    for (let i = 1; i < lines.length; i += 1) {
        const cols = lines[i].split(';');
        const initiativeRaw = (cols[1] || '').trim();
        const initiative = initiativeRaw || lastInitiative;
        if (initiativeRaw) {
            lastInitiative = initiativeRaw;
        }

        const responsiblesRaw = (cols[2] || '').trim();
        const responsibles = responsiblesRaw || lastResponsibles;
        if (responsiblesRaw) {
            lastResponsibles = responsiblesRaw;
        }

        const valuesRaw = cols.slice(3).map(value => (value || '').trim());
        const values = filteredIndexes.map(index => valuesRaw[index] ?? '');
        if (!initiative && !responsibles) {
            continue;
        }

        rows.push({ initiative, responsibles, values });
    }

    return { monthHeaders, rows };
}

function getStatusLabel(value) {
    switch (value) {
        case 'Nao_iniciado':
            return 'Nao iniciado';
        case 'Sem_andamento':
            return 'Sem andamento';
        case 'Andamento':
            return 'Em andamento';
        case 'Encerrado':
            return 'Encerrado';
        default:
            return '-';
    }
}

function getStatusClass(value) {
    switch (value) {
        case 'Nao_iniciado':
            return 'status-nao';
        case 'Sem_andamento':
            return 'status-sem';
        case 'Andamento':
            return 'status-and';
        case 'Encerrado':
            return 'status-enc';
        default:
            return 'status-empty';
    }
}

function summarizeByMonth(initiatives) {
    return initiatives.monthHeaders.map((header, index) => {
        const summary = {
            monthLabel: header,
            total: 0,
            naoIniciado: 0,
            semAndamento: 0,
            andamento: 0,
            encerrado: 0
        };

        initiatives.rows.forEach((row) => {
            const value = row.values[index] || '';
            if (!value) {
                return;
            }
            summary.total += 1;
            if (value === 'Nao_iniciado') {
                summary.naoIniciado += 1;
            } else if (value === 'Sem_andamento') {
                summary.semAndamento += 1;
            } else if (value === 'Andamento') {
                summary.andamento += 1;
            } else if (value === 'Encerrado') {
                summary.encerrado += 1;
            }
        });

        return summary;
    });
}

function buildHtml(initiatives) {
    const summary = summarizeByMonth(initiatives);
    const summaryRows = summary.map(item => `
                <tr>
                    <td>${item.monthLabel}</td>
                    <td>${item.total}</td>
                    <td>${item.naoIniciado}</td>
                    <td>${item.semAndamento}</td>
                    <td>${item.andamento}</td>
                    <td>${item.encerrado}</td>
                </tr>`).join('');

    const initiativeRowspans = buildRowspans(initiatives.rows.map(row => row.initiative));
    const responsiblesRowspans = buildRowspans(initiatives.rows.map(row => row.responsibles));
    const headerCells = initiatives.monthHeaders.map(header => `<th>${header}</th>`).join('');
    const detailRows = initiatives.rows.map((row, index) => {
        const statusCells = row.values.map(value => {
            return `<td class="${getStatusClass(value)}"></td>`;
        }).join('');

        const initiativeCell = initiativeRowspans[index]
            ? `<td rowspan="${initiativeRowspans[index]}">${row.initiative}</td>`
            : '';
        const responsiblesCell = responsiblesRowspans[index]
            ? `<td rowspan="${responsiblesRowspans[index]}">${row.responsibles}</td>`
            : '';

        return `
                <tr>
                    ${initiativeCell}
                    ${responsiblesCell}
                    ${statusCells}
                </tr>`;
    }).join('');

    return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<title>Indicadores de Evolucao</title>
<style>
    body {
        font-family: "Segoe UI", Arial, sans-serif;
        background: #ffffff;
        color: #111827;
        margin: 24px;
    }
    h1 {
        text-align: center;
        font-size: 24px;
        margin-bottom: 24px;
    }
    .table-wrap {
        margin-bottom: 24px;
    }
    table {
        border-collapse: collapse;
        width: 100%;
        table-layout: auto;
    }
    th, td {
        padding: 8px 10px;
        border: 1px solid #d1d5db;
        font-size: 13px;
        text-align: center;
        vertical-align: middle;
    }
    thead th {
        background: #0f172a;
        color: #ffffff;
        font-weight: 600;
    }
    tbody tr:nth-child(even) {
        background: #f8fafc;
    }
    .status-nao {
        background: #fecaca;
    }
    .status-sem {
        background: #fef08a;
    }
    .status-and {
        background: #bbf7d0;
    }
    .status-enc {
        background: #bfdbfe;
    }
    .status-empty {
        background: #ffffff;
    }
    .legend {
        display: flex;
        gap: 12px;
        flex-wrap: wrap;
        margin: 0 0 16px;
        justify-content: center;
    }
    .legend-item {
        padding: 6px 10px;
        border: 1px solid #d1d5db;
        font-size: 12px;
    }
</style>
</head>
<body>
    <h1>Indicadores de Evolucao</h1>
    <div class="legend">
        <div class="legend-item status-nao">Nao iniciado</div>
        <div class="legend-item status-sem">Sem andamento</div>
        <div class="legend-item status-and">Em andamento</div>
        <div class="legend-item status-enc">Encerrado</div>
    </div>
    <div class="table-wrap">
        <table>
            <thead>
                <tr>
                    <th>Mes</th>
                    <th>Total com status</th>
                    <th>Nao iniciado</th>
                    <th>Sem andamento</th>
                    <th>Em andamento</th>
                    <th>Encerrado</th>
                </tr>
            </thead>
            <tbody>
                ${summaryRows}
            </tbody>
        </table>
    </div>
    <div class="table-wrap">
        <table>
            <thead>
                <tr>
                    <th>Iniciativa</th>
                    <th>Responsaveis</th>
                    ${headerCells}
                </tr>
            </thead>
            <tbody>
                ${detailRows}
            </tbody>
        </table>
    </div>
</body>
</html>`;
}

function main() {
    if (process.argv.length !== 5 && process.argv.length !== 6) {
        throw new Error('Uso: node Projects/project-report.js <mes-inicial/MM/AAAA> <mes-final/MM/AAAA> <arquivo_iniciativas> [arquivo_saida_html]');
    }

    const startPeriod = parsePeriod(process.argv[2]);
    const endPeriod = parsePeriod(process.argv[3]);
    const initiativesPath = process.argv[4];
    const outputPath = process.argv[5] || DEFAULT_OUTPUT_PATH;

    if (!startPeriod || !endPeriod) {
        throw new Error('Periodo invalido. Use MM/AAAA.');
    }
    if (comparePeriods(startPeriod, endPeriod) > 0) {
        throw new Error('Periodo inicial deve ser menor ou igual ao periodo final.');
    }
    if (!fs.existsSync(initiativesPath)) {
        throw new Error(`Arquivo de iniciativas nao encontrado: ${initiativesPath}`);
    }

    const initiatives = parseInitiativesCsv(initiativesPath, startPeriod, endPeriod);
    const html = buildHtml(initiatives);
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, html, 'utf8');
    console.log(`HTML gerado com sucesso em: ${outputPath}`);
}

try {
    main();
} catch (error) {
    console.error(`ERRO: ${error.message}`);
    process.exit(1);
}