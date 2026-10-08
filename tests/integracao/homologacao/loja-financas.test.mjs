/**
 * PULSO — Homologação FASE 17: LOJA → FINANÇAS.
 *
 * A compra é o ponto onde a lista de desejos (que por si só não move
 * dinheiro) encosta nas finanças. Este teste confirma a cadeia completa e
 * o detalhe que mais importa: o desejado vira uma DESPESA na carteira, e
 * o histórico registra a diferença entre o preço esperado e o pago.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { criarBancoTemporario, destruirBancoTemporario, criarServicos } from '../../utils/ambiente-homologacao.mjs';

test('INT loja→finanças | comprar um desejo cria despesa e atualiza a carteira', () => {
  const ambiente = criarBancoTemporario('homolog-int-loja-fin-');
  const s = criarServicos(ambiente.banco);
  try {
    const jogador = s.servicoJogador.criar({ nome: 'Compras', codinome: 'cmp' });
    s.servicoFinanca.criarTransacao(jogador.id, {
      tipo: 'receita', valorCentavos: 200000, categoria: 'salario', data: '2026-09-01',
    });
    const saldoAntes = s.servicoFinanca.obterCarteira(jogador.id).saldo;

    // 1. Desejo — por si só não move dinheiro
    const desejo = s.servicoLoja.criar(jogador.id, {
      titulo: 'Monitor 24"', categoria: 'tecnologia', prioridade: 'alta', precoEsperado: 80000,
    });
    assert.equal(s.servicoLoja.obter(desejo.id).estado, 'desejado');
    assert.equal(s.servicoFinanca.obterCarteira(jogador.id).saldo, saldoAntes, 'desejar não move saldo');

    // 2. Análise e planejamento — a Fase 09 exige as duas etapas
    s.servicoLoja.analisar(desejo.id);
    assert.equal(s.servicoLoja.obter(desejo.id).estado, 'em_analise');
    s.servicoLoja.planejar(desejo.id);
    assert.equal(s.servicoLoja.obter(desejo.id).estado, 'planejado');
    assert.equal(s.servicoFinanca.obterCarteira(jogador.id).saldo, saldoAntes, 'planejar não move saldo');

    // 3. Compra por menos que o esperado
    s.servicoLoja.comprar(desejo.id, { precoFinal: 75000, data: '2026-09-05', observacao: 'Promoção' });
    const comprado = s.servicoLoja.obter(desejo.id);
    assert.equal(comprado.estado, 'comprado');
    assert.equal(comprado.precoFinal, 75000);
    assert.equal(comprado.diferencaCentavos, -5000, 'guarda a diferença (pago a menos)');
    assert.ok(comprado.transacaoId, 'a compra aponta para a transação criada');

    // 4. A carteira sente a DESPESA
    assert.equal(s.servicoFinanca.obterCarteira(jogador.id).saldo, saldoAntes - 75000,
      'a compra debita o preço final, não o esperado');

    // 5. O histórico financeiro registra a despesa
    const transacoes = s.servicoFinanca.listarTransacoes(jogador.id);
    const despesaDaCompra = transacoes.find((t) => t.id === comprado.transacaoId);
    assert.ok(despesaDaCompra, 'a transação da compra existe no histórico');
    assert.equal(despesaDaCompra.tipo, 'despesa');
    assert.equal(despesaDaCompra.valorCentavos, 75000);

    // 6. A compra aparece no histórico da loja
    const comprados = s.servicoLoja.listarComprados(jogador.id);
    assert.equal(comprados.length, 1);
    assert.equal(comprados[0].id, desejo.id);
  } finally {
    destruirBancoTemporario(ambiente);
  }
});

test('INT loja→finanças | resumo da loja bate com o que está gravado', () => {
  const ambiente = criarBancoTemporario('homolog-int-loja-resumo-');
  const s = criarServicos(ambiente.banco);
  try {
    const jogador = s.servicoJogador.criar({ nome: 'Resumo' });
    const d1 = s.servicoLoja.criar(jogador.id, {
      titulo: 'Item A', categoria: 'tecnologia', prioridade: 'normal', precoEsperado: 10000,
    });
    const d2 = s.servicoLoja.criar(jogador.id, {
      titulo: 'Item B', categoria: 'lazer', prioridade: 'baixa', precoEsperado: 20000,
    });
    s.servicoLoja.analisar(d2.id);
    s.servicoLoja.planejar(d2.id);
    s.servicoLoja.comprar(d2.id, { precoFinal: 18000, data: '2026-09-05' });

    const resumo = s.servicoLoja.resumo(jogador.id);
    assert.equal(resumo.total, 2);
    assert.equal(resumo.comprados, 1);
    assert.equal(resumo.ativos, 1, 'o item ainda desejado continua ativo');
    assert.equal(resumo.valorEstimado, 10000, 'soma só o que ainda está no plano');
    assert.equal(resumo.economiaHistorica, 2000, 'economia do que foi pago a menos');
  } finally {
    destruirBancoTemporario(ambiente);
  }
});
