import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const RESULT_DIR = path.resolve(__dirname, '..', 'result');
const OUTPUT_PATH = path.join(RESULT_DIR, 'Indicadores.html');

const ORG_ORDER = [
    { key: 'BNDES', label: 'BNDES' },
    { key: 'CPQD', label: 'CPQD' },
    { key: 'DATAPREV', label: 'Dataprev' },
    { key: 'IBICT', label: 'IBICT' },
    { key: 'PRODEMGE', label: 'Prodemge' },
    { key: 'RNP', label: 'RNP' },
    { key: 'SERPRO', label: 'Serpro' },
    { key: 'SGD', label: 'SGD' },
    { key: 'TCU', label: 'TCU' }
];

function loadConfig() {
    const configPath = path.resolve(__dirname, '..', 'config.json');
    if (!fs.existsSync(configPath)) {
        throw new Error('config.json nao encontrado na raiz do projeto');
    }
    const raw = fs.readFileSync(configPath, 'utf8');
    return JSON.parse(raw);
}

function parseCsvBlocks(content) {
    const lines = content.split(/\r?\n/);
    const headerMap = {};
    let i = 0;
    for (; i < lines.length; i += 1) {
        const line = lines[i].trim();
        if (!line) {
            i += 1;
            break;
        }
        const parts = line.split(';');
        if (parts.length < 2) {
            continue;
        }
        const key = parts[0].trim();
        const value = parts.slice(1).join(';').trim();
        headerMap[key] = value;
    }

    const orgMap = new Map();
    for (; i < lines.length; i += 1) {
        const line = lines[i].trim();
        if (!line) {
            continue;
        }
        const parts = line.split(';');
        if (parts.length < 2) {
            continue;
        }
        if (parts[0].toLowerCase().startsWith('organizacao')) {
            continue;
        }
        const org = parts[0].trim();
        const value = parts[1].trim();
        orgMap.set(org.toUpperCase(), value);
    }

    return { headerMap, orgMap };
}

function normalizeKey(value) {
    return value
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function parseStats(content) {
    const lines = content.split(/\r?\n/);
    const map = {};
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) {
            continue;
        }
        const parts = trimmed.split(':');
        if (parts.length < 2) {
            continue;
        }
        const key = normalizeKey(parts[0].trim());
        const value = parts.slice(1).join(':').trim();
        map[key] = value;
    }
    return map;
}

function parseDecimal(value) {
    if (value === undefined || value === null) {
        return null;
    }
    const raw = String(value).trim();
    if (!raw) {
        return null;
    }
    if (raw.includes(',')) {
        return parseFloat(raw.replace(/\./g, '').replace(',', '.'));
    }
    return parseFloat(raw);
}

function parseInteger(value) {
    if (value === undefined || value === null) {
        return null;
    }
    const raw = String(value).trim();
    if (!raw) {
        return null;
    }
    return parseInt(raw.replace(/\./g, ''), 10);
}

function formatDate(value) {
    const parts = String(value).trim().split('/');
    if (parts.length !== 3) {
        return value;
    }
    const day = parts[0].padStart(2, '0');
    const month = parts[1].padStart(2, '0');
    const year = parts[2];
    return `${day}/${month}/${year}`;
}

function formatMonthLabel(dateValue) {
    const parts = String(dateValue).trim().split('/');
    if (parts.length !== 3) {
        return dateValue;
    }
    const month = parseInt(parts[1], 10);
    const year = parts[2];
    const labels = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
    const label = labels[month - 1] || String(month);
    return `${label}/${year.slice(-2)}`;
}

function formatMonthHeader(headerValue) {
    const match = /^01\/(0[1-9]|1[0-2])\/(20\d{2})$/.exec(String(headerValue).trim());
    if (!match) {
        return headerValue;
    }
    const month = parseInt(match[1], 10);
    const year = match[2];
    const labels = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
    const label = labels[month - 1] || String(month);
    return `${label}/${year.slice(-2)}`;
}

function formatInteger(value) {
    if (value === null || value === undefined || Number.isNaN(value)) {
        return '-';
    }
    return new Intl.NumberFormat('pt-BR').format(Math.round(value));
}

function formatDecimal(value, digits) {
    if (value === null || value === undefined || Number.isNaN(value)) {
        return '-';
    }
    return value.toFixed(digits).replace('.', ',');
}

function formatPercent(value, digits) {
    if (value === null || value === undefined || Number.isNaN(value)) {
        return '-';
    }
    return `${formatDecimal(value, digits)}%`;
}

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

function formatFolder(period) {
    return `${period.year}-${String(period.month).padStart(2, '0')}`;
}

function nextMonth(period) {
    const month = period.month + 1;
    if (month === 13) {
        return { month: 1, year: period.year + 1 };
    }
    return { month, year: period.year };
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
            return { index, month: null, year: null };
        }
        return { index, month: parseInt(match[1], 10), year: parseInt(match[2], 10) };
    });

    const filteredIndexes = monthMeta
        .filter(meta => meta.month !== null)
        .filter(meta => {
            const afterStart = meta.year > startPeriod.year || (meta.year === startPeriod.year && meta.month >= startPeriod.month);
            const beforeEnd = meta.year < endPeriod.year || (meta.year === endPeriod.year && meta.month <= endPeriod.month);
            return afterStart && beforeEnd;
        })
        .map(meta => meta.index);

    const monthHeaders = filteredIndexes.map(index => formatMonthHeader(rawMonthHeaders[index]));
    const rows = [];
    let lastInitiative = '';
    let lastResponsibles = '';
    for (let i = 1; i < lines.length; i += 1) {
        const cols = lines[i].split(';');
        const initiativeRaw = (cols[1] || '').trim();
        const initiativeKey = initiativeRaw || lastInitiative;
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
        if (!initiativeKey && !responsibles) {
            continue;
        }
        rows.push({ initiative: initiativeKey, responsibles, values });
    }
    return { monthHeaders, rows };
}

function parseIncidentsCsv(filePath) {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split(/\r?\n/).filter(line => line.trim().length > 0);
    if (lines.length === 0) {
        return [];
    }
    const rows = [];
    for (let i = 1; i < lines.length; i += 1) {
        const cols = lines[i].split(';');
        const title = (cols[1] || '').trim();
        const daysOpen = (cols[4] || '').trim();
        if (!title) {
            continue;
        }
        rows.push({ title, daysOpen });
    }
    return rows;
}

function getInitiativeCellClass(value) {
    switch (value) {
        case 'Nao_iniciado':
            return 'status-nao';
        case 'Sem_andamento':
            return 'status-sem';
        case 'Andamento':
            return 'status-and';
        default:
            return 'status-empty';
    }
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

function buildHtml({ rows, initiatives, incidents }) {
    const productionHeader = ORG_ORDER.map(org => `<th>${org.label}</th>`).join('');
    const topRows = rows.map(row => {
        const productionValues = ORG_ORDER.map(org => {
            const value = row.productionByOrg.get(org.key) ?? 0;
            return `<td>${formatPercent(value, 2)}</td>`;
        }).join('');
        return `
                <tr>
                    <td>${row.startDate}</td>
                    <td>${row.endDate}</td>
                    <td>${row.monthLabel}</td>
                    <td>${formatInteger(row.expectedBlocks)}</td>
                    <td>${formatInteger(row.producedBlocks)}</td>
                    <td>${formatPercent(row.efficiency, 2)}</td>
                    ${productionValues}
                </tr>`;
    }).join('');

    const statsRows = rows.map(row => {
        return `
                <tr>
                    <td>${row.monthLabel}</td>
                    <td>${formatInteger(row.stats.min)}</td>
                    <td>${formatDecimal(row.stats.mean, 3)}</td>
                    <td>${formatInteger(row.stats.max)}</td>
                    <td>${formatInteger(row.stats.median)}</td>
                    <td>${formatDecimal(row.stats.stdDev, 3)}</td>
                    <td>${formatInteger(row.stats.quantile99)}</td>
                </tr>`;
    }).join('');

    const initiativesSection = initiatives
        ? (() => {
            const { monthHeaders, rows: initiativeRows } = initiatives;
            const initiativeRowspans = buildRowspans(initiativeRows.map(row => row.initiative));
            const responsiblesRowspans = buildRowspans(initiativeRows.map(row => row.responsibles));
            const headerCells = monthHeaders.map(header => `<th>${header}</th>`).join('');
            const bodyRows = initiativeRows.map((row, index) => {
                const cells = row.values.map(value => {
                    const cellClass = getInitiativeCellClass(value);
                    return `<td class="${cellClass}"></td>`;
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
                    ${cells}
                </tr>`;
            }).join('');

            return `
    <div class="table-wrap">
        <table class="table-initiatives">
            <thead>
                <tr>
                    <th>Iniciativa</th>
                    <th>Responsaveis</th>
                    ${headerCells}
                </tr>
            </thead>
            <tbody>
                ${bodyRows}
            </tbody>
        </table>
    </div>`;
        })()
        : '';

    const incidentsSection = incidents && incidents.items.length > 0
        ? (() => {
            const bodyRows = incidents.items.map(item => {
                return `
                <tr>
                    <td>${incidents.monthLabel}</td>
                    <td>${item.title}</td>
                    <td>${item.daysOpen}</td>
                </tr>`;
            }).join('');
            return `
    <div class="table-wrap">
        <table class="table-incidents">
            <thead>
                <tr>
                    <th>Mes</th>
                    <th>Descricao</th>
                    <th>Dias aberto</th>
                </tr>
            </thead>
            <tbody>
                ${bodyRows}
            </tbody>
        </table>
    </div>`;
        })()
        : '';

    return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<title>Indicadores</title>
<style>
    body {
        font-family: "Segoe UI", Arial, sans-serif;
        background: #ffffff;
        color: #111827;
        margin: 24px;
    }
    .table-wrap {
        margin-bottom: 24px;
    }
    table {
        border-collapse: collapse;
        width: auto;
        table-layout: auto;
        margin: 0 auto;
    }
    thead tr:first-child th {
        background: #1f2937;
        color: #ffffff;
        font-weight: 600;
        text-transform: uppercase;
        font-size: 12px;
        letter-spacing: 0.04em;
        border: 1px solid #111827;
    }
    thead tr:nth-child(2) th {
        background: #111827;
        color: #ffffff;
        font-weight: 600;
        border: 1px solid #111827;
    }
    th, td {
        padding: 8px 10px;
        text-align: center;
        border: 1px solid #d1d5db;
        font-size: 13px;
        white-space: nowrap;
    }
    tbody tr:nth-child(even) {
        background: #f3f4f6;
    }
    caption {
        caption-side: top;
        text-align: left;
        font-weight: 600;
        margin-bottom: 8px;
    }
    .table-initiatives th,
    .table-initiatives td {
        text-align: center;
        vertical-align: middle;
    }
    .table-initiatives td {
        height: 24px;
    }
    .status-nao {
        background: #ff0000;
    }
    .status-sem {
        background: #ffff00;
    }
    .status-and {
        background: #93d050;
    }
    .status-empty {
        background: #ffffff;
    }
    .table-incidents th:nth-child(2),
    .table-incidents td:nth-child(2) {
        text-align: left;
    }
</style>
</head>
<body>
    <div class="table-wrap">
        <table>
            <thead>
                <tr>
                    <th colspan="3">Periodo</th>
                    <th colspan="3">Blocos</th>
                    <th colspan="${ORG_ORDER.length}">Producao %</th>
                </tr>
                <tr>
                    <th>Inicio</th>
                    <th>Fim</th>
                    <th>Mes</th>
                    <th>Previstos</th>
                    <th>Produzidos</th>
                    <th>Eficiencia</th>
                    ${productionHeader}
                </tr>
            </thead>
            <tbody>
                ${topRows}
            </tbody>
        </table>
    </div>

    <div class="table-wrap">
        <table>
            <thead>
                <tr>
                    <th colspan="7">Estatisticas</th>
                </tr>
                <tr>
                    <th>Mes</th>
                    <th>Min.</th>
                    <th>Med.</th>
                    <th>Max.</th>
                    <th>Mediana</th>
                    <th>Desvio</th>
                    <th>Perc. 99%</th>
                </tr>
            </thead>
            <tbody>
                ${statsRows}
            </tbody>
        </table>
    </div>
${initiativesSection}
${incidentsSection}
</body>
</html>`;
}

function main() {
    if (process.argv.length !== 4 && process.argv.length !== 5 && process.argv.length !== 6) {
        throw new Error('Uso: node Blocks/block-report.js <mes-inicial/MM/AAAA> <mes-final/MM/AAAA> [arquivo_iniciativas] [arquivo_incidentes]');
    }

    const startPeriod = parsePeriod(process.argv[2]);
    const endPeriod = parsePeriod(process.argv[3]);
    if (!startPeriod || !endPeriod) {
        throw new Error('Periodo invalido. Use MM/AAAA.');
    }

    const config = loadConfig();
    const baseDir = config.INDICADORES_BASE_DIR;
    if (!baseDir) {
        throw new Error('INDICADORES_BASE_DIR nao definido no config.json');
    }

    const rows = [];
    let current = { ...startPeriod };
    while (current.year < endPeriod.year || (current.year === endPeriod.year && current.month <= endPeriod.month)) {
        const folderName = formatFolder(current);
        const folderPath = path.join(baseDir, folderName);
        const csvPath = path.join(folderPath, 'Blocos.csv');
        const statPath = path.join(folderPath, 'Blocos-estat.txt');

        if (!fs.existsSync(csvPath) || !fs.existsSync(statPath)) {
            console.warn(`Aviso: arquivos nao encontrados em ${folderPath}`);
            current = nextMonth(current);
            continue;
        }

        const csvContent = fs.readFileSync(csvPath, 'utf8');
        const statContent = fs.readFileSync(statPath, 'utf8');

        const { headerMap, orgMap } = parseCsvBlocks(csvContent);
        const statsMap = parseStats(statContent);

        const startDate = formatDate(headerMap['Data inicial']);
        const endDate = formatDate(headerMap['Data final']);
        const monthLabel = formatMonthLabel(headerMap['Data inicial']);
        const expectedBlocks = parseInteger(headerMap['Qtd max ideal']);
        const producedBlocks = parseInteger(headerMap['Blocos produzidos']);
        const efficiency = parseDecimal(headerMap['Rendimento']);

        const productionByOrg = new Map();
        for (const org of ORG_ORDER) {
            const rawValue = orgMap.get(org.key);
            if (!rawValue || !producedBlocks) {
                productionByOrg.set(org.key, 0);
                continue;
            }
            const produced = parseInteger(rawValue);
            const percent = producedBlocks ? (produced / producedBlocks) * 100 : 0;
            productionByOrg.set(org.key, percent);
        }

        const stats = {
            min: parseDecimal(statsMap['tempo minimo']?.replace('s', '')),
            mean: parseDecimal(statsMap['tempo medio']?.replace('s', '')),
            max: parseDecimal(statsMap['tempo maximo']?.replace('s', '')),
            median: parseDecimal(statsMap['mediana']?.replace('s', '')),
            stdDev: parseDecimal(statsMap['desvio padrao']?.replace('s', '')),
            quantile99: parseDecimal(statsMap['quantil 99%']?.replace('s', ''))
        };

        rows.push({
            startDate,
            endDate,
            monthLabel,
            expectedBlocks,
            producedBlocks,
            efficiency,
            productionByOrg,
            stats
        });

        current = nextMonth(current);
    }

    if (rows.length === 0) {
        throw new Error('Nenhum mes encontrado no periodo informado.');
    }

    let initiativesData = null;
    const initiativesPath = process.argv[4];
    if (initiativesPath) {
        if (!fs.existsSync(initiativesPath)) {
            throw new Error(`Arquivo de iniciativas nao encontrado: ${initiativesPath}`);
        }
        initiativesData = parseInitiativesCsv(initiativesPath, startPeriod, endPeriod);
    }

    let incidentsData = null;
    const incidentsPath = process.argv[5];
    if (incidentsPath) {
        if (!fs.existsSync(incidentsPath)) {
            throw new Error(`Arquivo de incidentes nao encontrado: ${incidentsPath}`);
        }
        const items = parseIncidentsCsv(incidentsPath);
        const monthLabel = `${['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'][endPeriod.month - 1]}/${String(endPeriod.year).slice(-2)}`;
        incidentsData = { monthLabel, items };
    }

    const html = buildHtml({ rows, initiatives: initiativesData, incidents: incidentsData });

    if (!fs.existsSync(RESULT_DIR)) {
        fs.mkdirSync(RESULT_DIR, { recursive: true });
    }

    fs.writeFileSync(OUTPUT_PATH, html, 'utf8');
    console.log(`HTML gerado com sucesso em: ${OUTPUT_PATH}`);
}

try {
    main();
} catch (error) {
    console.error(`ERRO: ${error.message}`);
    process.exit(1);
}
