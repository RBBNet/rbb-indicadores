const fs = require('fs');
const net = require('net');
const path = require('path');

function lerArquivo(nomeArquivo) {
    try {
        const data = fs.readFileSync(nomeArquivo, 'utf8');
        return JSON.parse(data);
    } catch (err) {
        console.error(`Erro ao ler o arquivo ${nomeArquivo}:`, err);
        return null;
    }
}


module.exports = {
    lerArquivo:lerArquivo,
}