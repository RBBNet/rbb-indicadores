import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const RESULT_DIR = path.resolve(__dirname, '..', 'result');
const DEFAULT_OUTPUT_PATH = path.join(RESULT_DIR, 'Indicadores-operacao.html');
const MONTH_LABELS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

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
        orgMap.set(normalizeOrganizationKey(org), { label: org, value });
    }

    return { headerMap, orgMap };
}

function normalizeOrganizationKey(value) {
    return normalizeKey(value);
}

function buildParticipantsFromCsv(orgMap) {
    return [...orgMap.entries()].map(([key, entry]) => ({ key, label: entry.label }));
}

function mergeParticipants(target, source) {
    const existing = new Set(target.map(item => item.key));
    for (const participant of source) {
        if (existing.has(participant.key)) {
            continue;
        }
        target.push(participant);
        existing.add(participant.key);
    }
}

function buildProductionRow(headerMap, orgMap, participants) {
    const startDate = formatDate(headerMap['Data inicial']);
    const endDate = formatDate(headerMap['Data final']);
    const monthLabel = formatMonthLabel(headerMap['Data inicial']);
    const expectedBlocks = parseInteger(headerMap['Qtd max ideal']);
    const producedBlocks = parseInteger(headerMap['Blocos produzidos']);
    const efficiency = parseDecimal(headerMap['Rendimento']);
    const productionByOrg = new Map();
    const participantKeys = new Set(participants.map(participant => participant.key));

    for (const participant of participants) {
        const rawEntry = orgMap.get(participant.key);
        const produced = rawEntry ? parseInteger(rawEntry.value) : 0;
        const percent = producedBlocks ? (produced / producedBlocks) * 100 : 0;
        productionByOrg.set(participant.key, percent);
    }

    return {
        startDate,
        endDate,
        monthLabel,
        expectedBlocks,
        producedBlocks,
        efficiency,
        productionByOrg,
        participantKeys,
        hasData: true
    };
}

function buildEmptyProductionRow({ startDate, endDate, monthLabel }) {
    return {
        startDate,
        endDate,
        monthLabel,
        expectedBlocks: null,
        producedBlocks: null,
        efficiency: null,
        productionByOrg: new Map(),
        participantKeys: new Set(),
        hasData: false
    };
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
    const label = MONTH_LABELS[month - 1] || String(month);
    return `${label}/${year.slice(-2)}`;
}

function formatMonthHeader(headerValue) {
    const match = /^01\/(0[1-9]|1[0-2])\/(20\d{2})$/.exec(String(headerValue).trim());
    if (!match) {
        return headerValue;
    }
    const month = parseInt(match[1], 10);
    const year = match[2];
    const label = MONTH_LABELS[month - 1] || String(month);
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

function buildProductionTableHtml(title, rows, participants) {
    if (participants.length === 0 || rows.length === 0) {
        return '';
    }

    const productionHeader = participants.map(participant => `<th>${participant.label}</th>`).join('');
    const bodyRows = rows.map(row => {
        const productionValues = participants.map(participant => {
            if (!row.participantKeys.has(participant.key)) {
                return '<td>-</td>';
            }

            const value = row.productionByOrg.get(participant.key);
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

    return `
    <div class="table-wrap">
        <table>
            <caption>${title}</caption>
            <thead>
                <tr>
                    <th colspan="3">Periodo</th>
                    <th colspan="3">Blocos</th>
                    <th colspan="${participants.length}">Producao %</th>
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
                ${bodyRows}
            </tbody>
        </table>
    </div>`;
}

function buildHtml({ prdRows, labRows, prdParticipants, labParticipants, initiatives, incidents }) {
    const prdTable = buildProductionTableHtml('Producao % - Prd', prdRows, prdParticipants);
    const labTable = buildProductionTableHtml('Producao % - Lab', labRows, labParticipants);

    const statsRows = prdRows.map(row => {
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
<title>Indicadores Operacionais</title>
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
${prdTable}
${labTable}
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
    if (process.argv.length < 4 || process.argv.length > 7) {
        throw new Error('Uso: node Blocks/block-report.js <mes-inicial/MM/AAAA> <mes-final/MM/AAAA> [arquivo_iniciativas|arquivo_incidentes|arquivo_saida_html ...]');
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

    const prdRows = [];
    const labRows = [];
    const prdParticipants = [];
    const labParticipants = [];
    let current = { ...startPeriod };
    while (current.year < endPeriod.year || (current.year === endPeriod.year && current.month <= endPeriod.month)) {
        const folderName = formatFolder(current);
        const folderPath = path.join(baseDir, folderName);
        const csvPath = path.join(folderPath, 'Blocos.csv');
        const labCsvPath = path.join(folderPath, 'Blocos_lab.csv');
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
    const prdParticipantsForMonth = buildParticipantsFromCsv(orgMap);
        mergeParticipants(prdParticipants, prdParticipantsForMonth);
        const prdRow = buildProductionRow(headerMap, orgMap, prdParticipantsForMonth);

        const stats = {
            min: parseDecimal(statsMap['tempo minimo']?.replace('s', '')),
            mean: parseDecimal(statsMap['tempo medio']?.replace('s', '')),
            max: parseDecimal(statsMap['tempo maximo']?.replace('s', '')),
            median: parseDecimal(statsMap['mediana']?.replace('s', '')),
            stdDev: parseDecimal(statsMap['desvio padrao']?.replace('s', '')),
            quantile99: parseDecimal(statsMap['quantil 99%']?.replace('s', ''))
        };

        prdRows.push({
            ...prdRow,
            stats
        });

        if (fs.existsSync(labCsvPath)) {
            const labCsvContent = fs.readFileSync(labCsvPath, 'utf8');
            const { headerMap: labHeaderMap, orgMap: labOrgMap } = parseCsvBlocks(labCsvContent);
            const labParticipantsForMonth = buildParticipantsFromCsv(labOrgMap);
            mergeParticipants(labParticipants, labParticipantsForMonth);
            labRows.push(buildProductionRow(labHeaderMap, labOrgMap, labParticipantsForMonth));
        } else {
            console.warn(`Aviso: arquivo nao encontrado em ${labCsvPath}. A linha de Lab ficara sem dados para ${folderName}.`);
            labRows.push(buildEmptyProductionRow(prdRow));
        }

        current = nextMonth(current);
    }

    if (prdRows.length === 0) {
        throw new Error('Nenhum mes encontrado no periodo informado.');
    }

    let initiativesData = null;
    let incidentsData = null;
    let outputPath = DEFAULT_OUTPUT_PATH;
    const extraArgs = process.argv.slice(4);

    for (const extraArg of extraArgs) {
        const normalized = path.basename(extraArg).toLowerCase();
        if (normalized.endsWith('.html')) {
            outputPath = extraArg;
            continue;
        }

        if (!fs.existsSync(extraArg)) {
            throw new Error(`Arquivo nao encontrado: ${extraArg}`);
        }

        if (normalized.startsWith('iniciativas_') && normalized.endsWith('.csv')) {
            initiativesData = parseInitiativesCsv(extraArg, startPeriod, endPeriod);
            continue;
        }

        if (normalized === 'incidentes.csv') {
            const items = parseIncidentsCsv(extraArg);
            const monthLabel = `${MONTH_LABELS[endPeriod.month - 1]}/${String(endPeriod.year).slice(-2)}`;
            incidentsData = { monthLabel, items };
        }
    }

    const html = buildHtml({
        prdRows,
        labRows,
        prdParticipants,
        labParticipants,
        initiatives: initiativesData,
        incidents: incidentsData
    });

    if (!fs.existsSync(RESULT_DIR)) {
        fs.mkdirSync(RESULT_DIR, { recursive: true });
    }

    fs.writeFileSync(outputPath, html, 'utf8');
    console.log(`HTML gerado com sucesso em: ${outputPath}`);
}

try {
    main();
} catch (error) {
    console.error(`ERRO: ${error.message}`);
    process.exit(1);
}
