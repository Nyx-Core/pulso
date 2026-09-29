/**
 * PULSO — Homologação FASE 17: SERVIÇOS → CONTAS → PAGAMENTOS.
 *
 * Cobre os fluxos que a infraestrutura de homologação não tinha:
 * serviço → recorrência → geração → conta → pagamento, e a garantia
 * de que cada etapa é isolada: nada de dinheiro se move até o pagamento.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { criarBancoTemporario, destruirBancoTemporario, criarServicos } from '../../utils/ambiente-homologacao.mjs';

test('INT serviços→contas | serviço, recorrência, geração e conta em sequência', () => {
  const ambiente = criarBancoTemporario('homolog-int-servico-conta-');
  const s = criarServicos(ambiente.banco);
  try {
    const jogador = s.servicoJogador.criar({ nome: 'Serviços', codinome: 'svc' });
    const saldoInicial = s.servicoFinanca.obterCarteira(jogador.id).saldo;

    // 1. Serviço
    const servico = s.servicoServicos.criar(jogador.id, {
      nome: 'Internet fibra', categoria: 'telecomunicacoes', valorEsperado: 11990,
    });
    assert.equal(s.servicoServicos.obter(servico.id).estado, 'ativo');
    assert.equal(s.servicoFinanca.obterCarteira(jogador.id).saldo, saldoInicial, 'serviço não move saldo');

    // 2. Recorrência mensal
    const recorrencia = s.servicoRecorrencias.criar(jogador.id, {
      servicoId: servico.id, frequencia: 'mensal', dataInicio: '2026-09-01',
      diaVencimento: 10, valorEsperado: 11990,
    });
    assert.equal(s.servicoRecorrencias.obter(recorrencia.id).estado, 'ativa');

    // 3. Geração de ocorrências
    const geracao = s.servicoGeracaoOcorrencias.gerar(recorrencia.id, {
      periodoInicio: '2026-09-01', periodoFim: '2026-09-30', hoje: '2026-09-01',
    });
    assert.equal(geracao.criadas, 1, 'uma conta para setembro');
    assert.equal(s.servicoFinanca.obterCarteira(jogador.id).saldo, saldoInicial, 'gerar conta não move saldo');

    // 4. A conta existe, com o valor esperado do serviço
    const conta = s.servicoContas.listar(jogador.id, { servicoId: servico.id })[0];
    assert.equal(conta.estado, 'pendente');
    assert.equal(conta.valorEsperado, 11990, 'conta herda o valor esperado');
    assert.equal(conta.situacao, 'vencida', 'aparece vencida hoje (o vencimento é 10/09)');
    assert.equal(s.servicoFinanca.obterCarteira(jogador.id).saldo, saldoInicial, 'conta pendente não move saldo');

    // 5. Pagamento: só aqui o dinheiro se move
    s.servicoFinanca.criarTransacao(jogador.id, {
      tipo: 'receita', valorCentavos: 50000, categoria: 'salario', data: '2026-09-01',
    });
    const saldoAntesDoPagamento = s.servicoFinanca.obterCarteira(jogador.id).saldo;
    s.servicoPagamentos.registrarPagamento(jogador.id, conta.id, {
      paidAt: '2026-09-10', valorPagoCentavos: 11990,
    });

    assert.equal(s.servicoFinanca.obterCarteira(jogador.id).saldo, saldoAntesDoPagamento - 11990,
      'o pagamento debita exatamente o valor pago');
    const contaPaga = s.servicoContas.obter(conta.id);
    assert.equal(contaPaga.estado, 'paga');
    assert.equal(contaPaga.paidAmount, 11990);
    assert.ok(contaPaga.transactionId, 'conta fica vinculada à transação de despesa');
  } finally {
    destruirBancoTemporario(ambiente);
  }
});

test('INT serviços→contas | valor pago diferente do esperado registra a diferença', () => {
  const ambiente = criarBancoTemporario('homolog-int-pgto-diferenca-');
  const s = criarServicos(ambiente.banco);
  try {
    const jogador = s.servicoJogador.criar({ nome: 'Diferença' });
    s.servicoFinanca.criarTransacao(jogador.id, {
      tipo: 'receita', valorCentavos: 100000, categoria: 'salario', data: '2026-09-01',
    });
    const servico = s.servicoServicos.criar(jogador.id, {
      nome: 'Internet', categoria: 'telecomunicacoes', valorEsperado: 10000,
    });
    const recorrencia = s.servicoRecorrencias.criar(jogador.id, {
      servicoId: servico.id, frequencia: 'mensal', dataInicio: '2026-09-01',
      diaVencimento: 10, valorEsperado: 10000,
    });
    s.servicoGeracaoOcorrencias.gerar(recorrencia.id, {
      periodoInicio: '2026-09-01', periodoFim: '2026-09-30', hoje: '2026-09-01',
    });
    const conta = s.servicoContas.listar(jogador.id, { servicoId: servico.id })[0];

    const antes = s.servicoFinanca.obterCarteira(jogador.id).saldo;
    // Pagou 250 centavos a mais que o previsto.
    s.servicoPagamentos.registrarPagamento(jogador.id, conta.id, {
      paidAt: '2026-09-10', valorPagoCentavos: 10250,
    });
    assert.equal(s.servicoFinanca.obterCarteira(jogador.id).saldo, antes - 10250,
      'debita o valor REALMENTE pago, não o esperado');
    assert.equal(s.servicoContas.obter(conta.id).paidAmount, 10250, 'a conta guarda o valor real pago');
  } finally {
    destruirBancoTemporario(ambiente);
  }
});
