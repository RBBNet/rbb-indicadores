const fs = require('fs');
const {addDays} = require('date-fns');
const EthDater = require('ethereum-block-by-date');
const { writeFile } = require('fs/promises');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;

function lerArquivo(nomeArquivo) {
    try {
        const data = fs.readFileSync(nomeArquivo, 'utf8');
        return JSON.parse(data);
    } catch (err) {
        console.error(`Erro ao ler o arquivo ${nomeArquivo}:`, err);
        return null;
    }
}

async function gets_block_number_by_date(date, provider) {
    const dater = new EthDater(provider);
    let block = await dater.getDate(date, true, false);
    return block.block;
}

function string_to_date(dateString) {
    if (!dateString) {
        throw new Error('A string de data está vazia ou é indefinida (undefined).');
    }

    let parts = dateString.split('/');
    let day = parseInt(parts[0], 10);
    let month = parseInt(parts[1], 10) - 1;
    let year = parseInt(parts[2], 10);

    // meia-noite no horário de Brasília (UTC-3). UTC-3 é +3 em UTC
    let date = new Date(Date.UTC(year, month, day, 3, 0, 0, 0));

    //date.setUTCHours(date.getUTCHours() - date.getTimezoneOffset() / 60);

    return date;
}

function update_date_last(date_last){
    date_last = addDays(date_last, 1);
    return date_last;
}

function validate_date(date){
    // Verifica se o objeto Date representa uma data válida. Datas como 31/02 são corrigidas no string_to_date
    if (isNaN(date.getTime())) {
        return false;
    }

    let today = new Date();

    return !(date > today);
}

function write_csv(file_header, data){
    path = 'IndiceProducaoBlocos.csv';
    
    writeFile(path,file_header,(err => console.error('Erro ao gerar head do arquivo CSV', err)));
    
    const csvWriter = createCsvWriter({
        path: path,
        header: [
            { id: 'Organização', title: 'Organizacao' },
            { id: 'Blocos produzidos', title: 'Blocos produzidos' }
        ],
        append: true
    });

    csvWriter
        .writeRecords(data)
        .then(() => console.log('Arquivo CSV gerado com sucesso'))
        .catch(err => console.error('Erro ao gerar arquivo CSV', err));
}

module.exports = {
    string_to_date: string_to_date,
    validate_date: validate_date,
    update_date_last: update_date_last,
    gets_block_number_by_date: gets_block_number_by_date,
    lerArquivo:lerArquivo,
    write_csv:write_csv
}