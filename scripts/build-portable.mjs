#!/usr/bin/env node
/**
 * PULSO - Geracao de pacotes para a Fase 18 (Portabilidade).
 *
 * Subcomandos:
 *   node scripts/build-portable.mjs portatil  -> pasta PULSO-PORTATIL/ (fonte)
 *   node scripts/build-portable.mjs linux     -> dist/PULSO-0.1.0-linux-portatil.tar.gz
 *   node scripts/build-portable.mjs windows   -> dist/PULSO-0.1.0-windows-portatil.zip
 *
 * Requisitos:
 *   - node_modules/electron/dist/ (binario do Electron da plataforma em que
 *     o build roda). No Ubuntu, o binario win32 e extraido automaticamente
 *     do cache do Electron (~/.cache/electron/<hash>/electron-v<versao>-win32-x64.zip)
 *     quando disponivel; caso contrario a aplicacao Windows e omitida (AVISO).
 *   - Os artefatos ficam em dist/ (ignorados pelo Git).
 */

import { cpSync, mkdirSync, rmSync, readFileSync, writeFileSync, existsSync, renameSync, readdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join, dirname, basename } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const packageJson = JSON.parse(readFileSync(join(raiz, 'package.json'), 'utf-8'));
const versao = packageJson.version || '0.1.0';
const nomeArquivo = 'PULSO-' + versao;

const DIST = join(raiz, 'dist');
const SAIDA = join(raiz, 'out', 'pack');
const ELECTRON_DIST = join(raiz, 'node_modules', 'electron', 'dist');

function escreveLog(nivel, mensagem) {
  console.log('[build:' + nivel + '] ' + mensagem);
}

function garantir(dir) {
  mkdirSync(dir, { recursive: true });
}

function limpar(dir) {
  if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
}

function copiarOrigem(origem, destino) {
  cpSync(origem, destino, { recursive: true, preserveTimestamps: true });
}

/**
 * Resolve o diretório com o runtime do Electron para a plataforma desejada.
 * - Mesma plataforma do build: node_modules/electron/dist/ (raiz).
 * - Cross-build Linux→Windows: node_modules/electron/dist/win32-x64/
 *   (extraído do cache do Electron por `garantirRuntimeWin32`).
 */
function resolverRuntime(plataforma) {
  if (plataforma === process.platform) return ELECTRON_DIST;
  const sufixo = plataforma === 'win32' ? 'win32-x64' : 'linux-x64';
  return join(ELECTRON_DIST, sufixo);
}

/** Procura o zip win32 da versão instalada do Electron no cache do electron. */
function localizarZipCacheWin32(versaoElectron) {
  const nome = 'electron-v' + versaoElectron + '-win32-x64.zip';
  const cacheRaiz = process.env.ELECTRON_CACHE
    || (process.env.XDG_CACHE_HOME ? join(process.env.XDG_CACHE_HOME, 'electron') : join(homedir(), '.cache', 'electron'));
  if (!existsSync(cacheRaiz)) return null;
  const encontrados = readdirSync(cacheRaiz, { recursive: true })
    .map((rel) => join(cacheRaiz, String(rel)))
    .filter((caminho) => basename(caminho) === nome && existsSync(caminho));
  return encontrados[0] || null;
}

/**
 * Garante o runtime win32 em electron/dist/win32-x64 quando o build roda em
 * outra plataforma (Linux). Extrai o zip do cache do Electron; se não houver
 * zip, informa AVISO e a aplicação Windows é omitida.
 */
function garantirRuntimeWin32() {
  const destino = join(ELECTRON_DIST, 'win32-x64');
  if (existsSync(destino)) return true;
  let versaoElectron;
  try {
    versaoElectron = JSON.parse(readFileSync(join(raiz, 'node_modules', 'electron', 'package.json'), 'utf-8')).version;
  } catch {
    versaoElectron = null;
  }
  const zip = versaoElectron ? localizarZipCacheWin32(versaoElectron) : null;
  if (!zip) {
    escreveLog(
      'AVISO',
      'Binário do Electron win32 não encontrado (nem no cache do Electron' +
      (versaoElectron ? ': electron-v' + versaoElectron + '-win32-x64.zip' : '') +
      ') — pulando a aplicação Windows. Gere o pacote Windows em uma máquina Windows.',
    );
    return false;
  }
  garantir(destino);
  try {
    execSync('unzip -q -o ' + JSON.stringify(zip) + ' -d ' + JSON.stringify(destino), { stdio: 'ignore' });
  } catch {
    escreveLog('AVISO', 'Falha ao extrair ' + zip + ' — pulando a aplicação Windows.');
    rmSync(destino, { recursive: true, force: true });
    return false;
  }
  escreveLog('OK', 'Runtime win32 extraído do cache do Electron (' + basename(zip) + ')');
  return true;
}

function construirAplicacao(destino, { plataforma }) {
  garantir(destino);
  if (plataforma !== process.platform && plataforma === 'win32' && !garantirRuntimeWin32()) {
    return;
  }
  const electron = resolverRuntime(plataforma);
  if (!existsSync(electron)) {
    escreveLog(
      'AVISO',
      'Binário do Electron ' + plataforma + ' não encontrado em ' + electron +
      ' — pulando a aplicação ' + plataforma + '.',
    );
    return;
  }

  const raizApp = join(destino, 'resources', 'app');
  const binario = join(destino, plataforma === 'linux' ? 'PULSO' : 'PULSO.exe');

  // 1. Binario do Electron (self-contained: icudtl.dat, libs, locales...).
  copiarOrigem(electron, destino);
  // Nome original do binário: "electron" no Linux, "electron.exe" no Windows.
  const binarioOrigem = join(destino, plataforma === 'linux' ? 'electron' : 'electron.exe');
  if (existsSync(binarioOrigem)) {
    renomearArquivo(binarioOrigem, binario);
  }

  // 2. Codigo-fonte e recursos da aplicacao (viajam dentro do pacote).
  copiarOrigem(join(raiz, 'src'), join(raizApp, 'src'));
  copiarOrigem(join(raiz, 'config'), join(raizApp, 'config'));
  copiarOrigem(join(raiz, 'assets'), join(raizApp, 'assets'));
  copiarOrigem(join(raiz, 'package.json'), join(raizApp, 'package.json'));

  escreveLog('OK', 'Aplicacao ' + plataforma + ' montada em ' + destino);
}

function renomearArquivo(origem, destino) {
  try {
    renameSync(origem, destino);
  } catch (erro) {
    if (erro.code !== 'EXDEV') throw erro;
    cpSync(origem, destino, { recursive: true });
    rmSync(origem, { recursive: true, force: true });
  }
}

function construirPacote(destino) {
  garantir(destino);

  writeFileSync(join(destino, 'pulso-portatil.json'), JSON.stringify({
    aplicacao: 'PULSO',
    portatil: true,
    canal: 'pre-alpha',
    versao: versao,
    descricao: 'Raiz do pacote portatil do PULSO. A pasta data/ guarda o banco.',
  }, null, 2) + '\n', 'utf-8');

  garantir(join(destino, 'data'));
  writeFileSync(join(destino, 'data', 'LEIA-ME.txt'), 'pulso.db vive aqui - o MESMO arquivo para Linux e Windows.', 'utf-8');

  garantir(join(destino, 'config'));
  writeFileSync(join(destino, 'config', 'LEIA-ME.txt'), 'Configuracoes portatil do PULSO.', 'utf-8');

  garantir(join(destino, 'backups'));
  writeFileSync(join(destino, 'backups', 'LEIA-ME.txt'), 'Copias de seguranca do banco. Nao apagar por atualizacao.', 'utf-8');

  garantir(join(destino, 'runtime'));
  writeFileSync(join(destino, 'runtime', 'LEIA-ME.txt'), 'Caches do Electron. Descartavel; populado na primeira execucao.', 'utf-8');

  garantir(join(destino, 'iniciar'));
  copiarOrigem(join(raiz, 'scripts', 'iniciadores'), join(destino, 'iniciar'));

  writeFileSync(join(destino, 'README.txt'), PORTATIL_README, 'utf-8');

  escreveLog('OK', 'Pacote portatil base montado em ' + destino);
}

function buildPortatil() {
  const destino = join(SAIDA, nomeArquivo + '-portatil');
  limpar(destino);
  construirPacote(destino);

  const linux = join(destino, 'Linux');
  const windows = join(destino, 'Windows');
  garantir(linux);
  garantir(windows);

  construirAplicacao(linux, { plataforma: 'linux' });
  construirAplicacao(windows, { plataforma: 'win32' });

  escreveLog('OK', 'Pacote portatil completo em ' + destino);
  return destino;
}

function tarGz(origem, destinoPacote) {
  const cmd = 'tar -czf ' + JSON.stringify(destinoPacote) + ' -C ' + JSON.stringify(dirname(origem)) + ' ' + JSON.stringify(basename(origem));
  execSync(cmd, { stdio: 'ignore' });
}

function zip(origem, destinoPacote) {
  // `zip -r` ADICIONA/atualiza entradas num arquivo existente: apague o zip
  // anterior para não embalar entradas de builds antigos.
  limpar(destinoPacote);
  const cmd = 'cd ' + JSON.stringify(dirname(origem)) + ' && zip -r ' + JSON.stringify(destinoPacote) + ' ' + JSON.stringify(basename(origem));
  execSync(cmd, { stdio: 'ignore' });
}

function buildLinux() {
  const destino = join(DIST, nomeArquivo + '-linux-portatil');
  limpar(destino);
  const pasta = join(destino, 'PULSO-LINUX');
  construirPacote(pasta);
  // Aplicação em Linux/ (mesmo layout do pacote fonte; o iniciar-linux.sh
  // executa ./Linux/PULSO a partir da raiz do pacote).
  construirAplicacao(join(pasta, 'Linux'), { plataforma: 'linux' });
  tarGz(pasta, join(DIST, nomeArquivo + '-linux-portatil.tar.gz'));
  escreveLog('OK', 'Pacote Linux portatil -> ' + join(DIST, nomeArquivo + '-linux-portatil.tar.gz'));
}

function buildWindows() {
  const destino = join(DIST, nomeArquivo + '-windows-portatil');
  limpar(destino);
  const pasta = join(destino, 'PULSO-WINDOWS');
  construirPacote(pasta);
  // Aplicação em Windows/ (o iniciar-windows.bat executa Windows\PULSO.exe).
  construirAplicacao(join(pasta, 'Windows'), { plataforma: 'win32' });
  zip(pasta, join(DIST, nomeArquivo + '-windows-portatil.zip'));
  escreveLog('OK', 'Pacote Windows portatil -> ' + join(DIST, nomeArquivo + '-windows-portatil.zip'));
}

const PORTATIL_README =
  '# PULSO PRETA-ALFA 0.1.0 - PACOTE PORTATIL\n' +
  '============================================================\n' +
  '\n' +
  'Este pacote roda direto do pendrive, sem instalacao, e serve\n' +
  'Linux e Windows a partir da MESMA pasta de dados.\n' +
  '\n' +
  'ESTRUTURA\n' +
  '---------\n' +
  '  Linux/     aplicacao para Linux (executavel: PULSO)\n' +
  '  Windows/   aplicacao para Windows (executavel: PULSO.exe)\n' +
  '  data/      pulso.db - o banco UNICO, compartilhado pelos dois\n' +
  '  backups/   copias de seguranca do banco\n' +
  '  config/    configuracoes portatil\n' +
  '  runtime/   caches do Electron (descartavel, pode apagar)\n' +
  '\n' +
  'COMO USAR\n' +
  '---------\n' +
  '  No Linux:   execute  Linux/PULSO\n' +
  '  No Windows: execute  Windows\\PULSO.exe\n' +
  '\n' +
  'Ambas as versoes leem e gravam em data/pulso.db.\n' +
  '\n' +
  'REGLAS IMPORTANTES\n' +
  '------------------\n' +
  '  * Feche o PULSO antes de remover o pendrive.\n' +
  '  * Nao abra o Linux e o Windows ao mesmo tempo: o SQLite e um banco\n' +
  '    unico - duas instancias simultaneas podem conflitar.\n' +
  '  * NAO apague data/ nem backups/.\n' +
  '  * Faca uma copia de data/ em backups/ antes de atualizacoes importantes.\n' +
  '\n' +
  'ATUALIZACAO\n' +
  '-----------\n' +
  '  Atualize apenas as pastas Linux/ e Windows/. Nunca substitua data/.\n' +
  '  O PULSO aplica as migracoes necessarias ao abrir um banco existente.\n';

const comando = process.argv[2] || 'portatil';
if (comando === 'portatil') {
  buildPortatil();
} else if (comando === 'linux') {
  buildLinux();
} else if (comando === 'windows') {
  buildWindows();
} else {
  escreveLog('ERRO', 'Comando nao reconhecido: ' + comando + ' (uso: portatil | linux | windows)');
  process.exit(1);
}
