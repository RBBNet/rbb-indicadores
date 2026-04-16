#!/usr/bin/env node

import readline from 'readline';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

function question(query) {
    return new Promise(resolve => rl.question(query, resolve));
}

function clearScreen() {
    console.clear();
}

function appendTail(buffer, chunk, maxLength = 12000) {
    const next = `${buffer}${chunk}`;
    if (next.length <= maxLength) {
        return next;
    }
    return next.slice(-maxLength);
}

function summarizeOutput(output) {
    const lines = output
        .split(/\r?\n/)
        .map(line => line.trimEnd())
        .filter(Boolean)
        .filter(line => !/^\s*at\s/.test(line))
        .filter(line => !line.startsWith('node:internal'))
        .filter(line => !line.startsWith('Node.js v'));

    if (lines.length === 0) {
        return '';
    }

    const highlighted = lines.filter(line => /erro|error|failed|falha|denied|timeout|http|exception/i.test(line));
    const selected = highlighted.length > 0 ? highlighted : lines;
    return selected.slice(-6).join('\n');
}

function runNode(scriptPath) {
    return new Promise((resolve, reject) => {
        const child = spawn('node', [scriptPath], {
            stdio: ['inherit', 'pipe', 'pipe'],
            shell: true
        });

        let stdoutOutput = '';
        let stderrOutput = '';

        child.stdout.on('data', (data) => {
            const text = data.toString();
            stdoutOutput = appendTail(stdoutOutput, text);
            process.stdout.write(data);
        });

        child.stderr.on('data', (data) => {
            stderrOutput = appendTail(stderrOutput, data.toString());
        });

        child.on('close', (code) => {
            if (code !== 0) {
                const details = summarizeOutput(`${stderrOutput}\n${stdoutOutput}`);
                reject(new Error(details ? `${path.basename(scriptPath)} falhou com codigo ${code}.\n${details}` : `Processo encerrado com codigo ${code}`));
            } else {
                resolve();
            }
        });

        child.on('error', reject);
    });
}

async function showMenu() {
    clearScreen();
    console.log('==========================================');
    console.log('         Menu de Perfis RBB');
    console.log('==========================================');
    console.log('1. Perfil Operacao');
    console.log('2. Perfil Evolucao');
    console.log('3. Sair');
    console.log('==========================================');

    const choice = await question('Escolha uma opcao (1-3): ');

    try {
        switch (choice.trim()) {
            case '1':
                rl.close();
                await runNode(path.join(__dirname, 'run-operacao.js'));
                return;
            case '2':
                rl.close();
                await runNode(path.join(__dirname, 'run-evolucao.js'));
                return;
            case '3':
                console.log('Saindo...');
                rl.close();
                process.exit(0);
                break;
            default:
                console.log('Opcao invalida!');
                await showMenu();
        }
    } catch (error) {
        console.error('Erro fatal:', error.message);
        process.exit(1);
    }
}

console.log('Iniciando seletor de perfis RBB...\n');
showMenu();
