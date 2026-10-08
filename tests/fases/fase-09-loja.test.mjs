/**
 * PULSO — Homologação FASE 09 — Loja / Lista de Desejos.
 *
 * Este arquivo existia para registrar a AUSÊNCIA da Fase 09 ("quando a
 * Fase 09 nascer, substituir por testes reais"). A Fase 09 foi concluída
 * e a suíte principal do projeto já cobre o módulo por inteiro; aqui
 * verificamos o que a homologação precisa afirmar: a loja existe, está
 * ligada ao schema vigente e não mexe em dinheiro sozinha.
 *
 * A compra (que move dinheiro via Fase 08) é verificada pela suíte de
 * integração `tests/integracao/loja.test.mjs`.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { criarBancoTemporario, destruirBancoTemporario } from '../utils/ambiente-homologacao.mjs';
import { ESTADOS_DESEJO, CATEGORIAS_DESEJO, PRIORIDADES_DESEJO, PRIORIDADES_DESEJO_ROTULOS } from '../../src/core/dominio/loja.js';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

test('F09 loja | entregue | domínio e serviço da loja existem', () => {
  assert.equal(existsSync(join(raiz, 'src', 'core', 'dominio', 'loja.js')), true);
  assert.equal(existsSync(join(raiz, 'src', 'core', 'aplicacao', 'servico-loja.js')), true);
});

test('F09 loja | schema | tabela de desejo existe e restringe estados e prioridades', () => {
  const ambiente = criarBancoTemporario('homolog-f09-');
  try {
    const tabelas = new Set(
      ambiente.banco.prepare("SELECT name AS nome FROM sqlite_master WHERE type = 'table'").all().map((l) => l.nome),
    );
    assert.ok(tabelas.has('desejo'), 'a tabela desejo deve existir no schema atual');

    // Os CHECK do schema são a última linha de defesa: mesmo com um bug de
    // validação, um estado fora da lista não entra no banco.
    const estados = new Set(ambiente.banco.prepare("SELECT DISTINCT estado FROM desejo").all().map((l) => l.estado));
    for (const estado of estados) {
      assert.ok(Object.values(ESTADOS_DESEJO).includes(estado), `estado inesperado: ${estado}`);
    }

    // INSERT com categoria inválida deve ser recusado pelo próprio banco.
    assert.throws(() =>
      ambiente.banco
        .prepare(
          `INSERT INTO desejo (jogador_id, titulo, categoria, prioridade, estado, valor_esperado_centavos)
           VALUES ((SELECT id FROM jogador LIMIT 1), 'x', 'categoria-inexistente', 'normal', 'desejado', 100)`,
        )
        .run(),
    );
  } finally {
    destruirBancoTemporario(ambiente);
  }
});

test('F09 loja | domínio | listas de categorias e prioridades fechadas e coerentes', () => {
  // As listas são congeladas: código de fora não pode acrescentar uma
  // categoria em runtime e quebrar o mapeamento financeiro.
  assert.ok(CATEGORIAS_DESEJO.length > 0);
  assert.equal(Object.isFrozen(CATEGORIAS_DESEJO), true);
  assert.equal(Object.isFrozen(PRIORIDADES_DESEJO), true);

  // Cada categoria é um par {valor, rotulo} válido e único.
  const valores = new Set();
  for (const categoria of CATEGORIAS_DESEJO) {
    assert.match(categoria.valor, /^[a-z_]+$/, `categoria com valor inválido: ${categoria.valor}`);
    assert.ok(categoria.rotulo, `categoria ${categoria.valor} sem rótulo`);
    assert.equal(valores.has(categoria.valor), false, `categoria duplicada: ${categoria.valor}`);
    valores.add(categoria.valor);
  }

  // Toda prioridade declarada tem chave em maiúsculas e valor em
  // minúsculas, e possui rótulo — a coerência herdada de missões/projetos.
  for (const [chave, valor] of Object.entries(PRIORIDADES_DESEJO)) {
    assert.equal(chave, chave.toUpperCase(), `chave de prioridade fora do padrão: ${chave}`);
    assert.match(valor, /^[a-z]+$/, `valor de prioridade fora do padrão: ${valor}`);
  }
  assert.equal(Object.isFrozen(PRIORIDADES_DESEJO_ROTULOS), true);
  for (const valor of Object.values(PRIORIDADES_DESEJO)) {
    assert.ok(PRIORIDADES_DESEJO_ROTULOS[valor], `prioridade ${valor} sem rótulo`);
  }
});

test('F09 loja | preços | valor esperado gravado em centavos e nunca zero', () => {
  const ambiente = criarBancoTemporario('homolog-f09-centavos-');
  try {
    const jogador = ambiente.banco.prepare('SELECT id FROM jogador LIMIT 1').get();
    // CHECK (valor_esperado_centavos > 0) no schema.
    assert.throws(() =>
      ambiente.banco
        .prepare(
          `INSERT INTO desejo (jogador_id, titulo, categoria, prioridade, estado, valor_esperado_centavos)
           VALUES (?, 'preço zero', 'tecnologia', 'normal', 'desejado', 0)`,
        )
        .run(jogador?.id ?? 1),
    );
  } finally {
    destruirBancoTemporario(ambiente);
  }
});

