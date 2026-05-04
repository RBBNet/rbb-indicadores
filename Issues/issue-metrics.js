import functions from './issue-functions.js';
import fs from 'fs';
import path from 'path';
import { exit } from 'process';
import { addDays } from 'date-fns';

const labels = ['incidente', 'incidente-critico', 'vulnerabilidade', 'vulnerabilidade-critica'];

async function listIssues() {
    try {
        if (process.argv.length < 4 || process.argv.length > 5) {
            console.error('Parâmetros incorretos.\nUse: node issue-metrics.js <data-inicial> <data-final> [pasta-mensal]\nFormato: DD/MM/AAAA');
            exit(1);
        }

        let date_first = functions.string_to_date(process.argv[2]);
        if (!functions.validate_date(date_first)) {
            console.error('Data inicial inválida. Formato esperado: DD/MM/AAAA');
            exit(1);
        }

        let date_last = functions.string_to_date(process.argv[3]);
        if (!functions.validate_date(date_last)) {
            console.error('Data final inválida. Formato esperado: DD/MM/AAAA');
            exit(1);
        }

        // Intervalo aberto no final
        date_last = addDays(date_last, 1);

        const monthFolder = process.argv[4] || '';
        const resultsFolder = monthFolder
            ? path.join('.', 'result', monthFolder)
            : path.join('.', 'result');
        if (!fs.existsSync(resultsFolder)) fs.mkdirSync(resultsFolder, { recursive: true });

        let fileData = 'number;title;labels;assignees;daysOpen;state';
        const matchedIssues = new Map();

        for (const label of labels) {
            console.log('\n' + '-'.repeat(50));
            console.log(`ISSUES PARA ${label} + PRD`);

            let closedIssues = [];

            try {
                const paramsClosed = {
                    owner: 'RBBNet',
                    repo: 'incidentes',
                    state: 'closed',
                    labels: `${label},PRD`,
                    per_page: 100,
                    headers: { 'X-GitHub-Api-Version': '2022-11-28' }
                };

                closedIssues = await functions.fetchIssues(paramsClosed);
                if (!Array.isArray(closedIssues)) {
                    console.warn(`Retorno inesperado (closed) para label ${label}`);
                    closedIssues = [];
                } else {
                    closedIssues = closedIssues.filter(issue => {
                        if (!issue.closed_at) {
                            return false;
                        }

                        const closedDate = new Date(issue.closed_at);
                        return closedDate.valueOf() >= date_first.valueOf()
                            && closedDate.valueOf() < date_last.valueOf();
                    });
                }
            } catch (apiErr) {
                console.error(`Falha ao buscar issues para label ${label}: ${apiErr.status || ''} ${apiErr.message}`);
                continue; // passa para próximo label
            }

            if (closedIssues.length > 0) {
                closedIssues.forEach(issue => {
                    matchedIssues.set(issue.number, issue);
                });
                console.table(closedIssues, ['number','title','state']);
            } else {
                console.log(`Nenhuma issue fechada para ${label} + PRD no intervalo.`);
            }
        }

        const finalIssues = Array.from(matchedIssues.values()).sort((left, right) => left.number - right.number);
        finalIssues.forEach(issue => {
            fileData += `\n${issue.number};${sanitize(issue.title)};${serializeLabels(issue.labels)};${serializeAssignees(issue.assignees)};${issue.daysOpen ?? ''};${issue.state}`;
        });

        console.log('\n' + '-'.repeat(50));
        console.log(`Total de issues fechadas no intervalo: ${finalIssues.length}`);

        const fileName = 'Incidentes.csv';
        const filePath = path.join(resultsFolder, fileName);
        console.log(`Gerando arquivo ${fileName}...`);
        fs.writeFile(filePath, fileData, 'utf-8', (err) => {
            if (err) {
                if (err.code === 'EBUSY') {
                    console.error(`Arquivo ${fileName} em uso. Feche e tente novamente.`);
                } else {
                    console.error(`Erro ao gravar CSV: ${err.message}`);
                }
            } else {
                console.log(`Arquivo ${fileName} gerado em: ${filePath}`);
            }
        });

    } catch (error) {
        console.error(`Erro geral: ${error.status || ''} ${error.message}`);
    }
}

// Helpers simples para CSV
function sanitize(txt='') {
    return (''+txt).replace(/[\r\n;]/g,' ').trim();
}
function serializeLabels(labels) {
    if (!labels) return '';
    if (Array.isArray(labels)) return labels.map(l => typeof l === 'string' ? l : l.name).join(',');
    return ''+labels;
}
function serializeAssignees(assignees) {
    if (!assignees) return '';
    if (Array.isArray(assignees)) return assignees.map(a => a.login || a).join(',');
    return ''+assignees;
}

// Execução correta garantindo ordem
(async () => {
    await functions.getTokenOwner().catch(e => {
        console.error('Falha ao obter dono do token:', e.message);
        exit(1);
    });
    await listIssues();
})();