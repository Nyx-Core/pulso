/**
 * PULSO — Testes unitários da resolução de locais (Fase 18 — Portabilidade).
 *
 * O módulo `src/main/portabilidade.js` não importa o Electron, então estes
 * testes rodam em Node puro (sem janela, sem Electron) e validam:
 *   - diretório explícito via PULSO_DIRETORIO_DADOS;
 *   - modo portátil via PULSO_PORTABLE=1;
 *   - modo portátil via marcador pulso-portatil.json;
 *   - padrão <appData>/pulso;
 *   - localização da raiz de um pacote portátil.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const {
  resolverDiretórioDados,
  detectorPortabilidade,
  localizarRaizPacote,
} = await import('../../src/main/portabilidade.js');

let diretorioTemp = '';

test.before(async () => {
  diretorioTemp = mkdtempSync(join(tmpdir(), 'pulso-portabilidade-'));
});

test.after(() => {
  rmSync(diretorioTemp, { recursive: true, force: true });
});

test('PULSO_DIRETORIO_DADOS aponta para um diretório explícito', () => {
  const explícito = join(diretorioTemp, 'explicit');
  const resultado = resolverDiretórioDados({ explicito: explícito });
  assert.equal(resultado.portable, false);
  assert.equal(resultado.motivo, 'explicito');
  assert.equal(resultado.diretorioDados, resolve(explícito));
});

test('não há marcador, nem appData: o padrão é appData/pulso', () => {
  const resultado = resolverDiretórioDados({
    exeDir: join(diretorioTemp, 'qualquer'),
  });
  assert.equal(resultado.portable, false);
  assert.equal(resultado.motivo, 'padrao');
});

test('detecta modo portátil por PULSO_PORTABLE=1', () => {
  const { portable, motivo } = detectorPortabilidade({ portável: true });
  assert.equal(portable, true);
  assert.equal(motivo, 'ambiente');
});

test('detecta raiz de pacote por marcador (pulso-portatil.json)', () => {
  const raiz = join(diretorioTemp, 'pacote');
  mkdirSync(join(raiz, 'A', 'B'), { recursive: true });
  writeFileSync(join(raiz, 'pulso-portatil.json'), '{"portatil":true}');
  const localizada = localizarRaizPacote(join(raiz, 'A', 'B', 'c', 'd'));
  assert.equal(localizada, raiz);
});

test('resolve <appData>/pulso como padrão quando não há marcador', () => {
  const resultado = resolverDiretórioDados({ appData: join(diretorioTemp, 'appdata') });
  assert.equal(resultado.portable, false);
  assert.equal(resultado.motivo, 'padrao');
  assert.equal(resultado.diretorioDados, join(diretorioTemp, 'appdata', 'pulso'));
  assert.equal(resultado.raizPacote, '');
});

test('modo portátil resolve <raiz>/data e expõe raizPacote (marcador)', () => {
  const raiz = join(diretorioTemp, 'pacote-raiz');
  mkdirSync(join(raiz, 'Linux'), { recursive: true });
  writeFileSync(join(raiz, 'pulso-portatil.json'), '{"portatil":true}');
  const resultado = resolverDiretórioDados({ exeDir: join(raiz, 'Linux') });
  assert.equal(resultado.portable, true);
  assert.equal(resultado.motivo, 'marcador');
  assert.equal(resultado.diretorioDados, join(raiz, 'data'));
  assert.equal(resultado.raizPacote, raiz);
});

test('PULSO_PORTABLE=1 força modo portátil mesmo sem marcador (usa cwd)', () => {
  const resultado = resolverDiretórioDados({
    exeDir: join(diretorioTemp, 'sem-marcador'),
    portavel: true,
  });
  assert.equal(resultado.portable, true);
  assert.equal(resultado.motivo, 'ambiente');
  assert.equal(resultado.diretorioDados, join(process.cwd(), 'data'));
  assert.equal(resultado.raizPacote, process.cwd());
});

test('variável PULSO_PORTABLE=1 no ambiente ativa o modo portátil', () => {
  process.env.PULSO_PORTABLE = '1';
  try {
    const resultado = resolverDiretórioDados({ exeDir: join(diretorioTemp, 'outro') });
    assert.equal(resultado.portable, true);
    assert.equal(resultado.motivo, 'ambiente');
    assert.equal(resultado.diretorioDados, join(process.cwd(), 'data'));
  } finally {
    delete process.env.PULSO_PORTABLE;
  }
});
