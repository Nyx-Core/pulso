/**
 * PULSO — Homologação FASE 17: FALHAS CONTROLADAS.
 *
 * O que a aplicação faz quando o dado está errado é tão importante quanto
 * o que ela faz quando está certo. Estes testes fixam o comportamento de
 * falha esperado nos caminhos que a Fase 17 exige:
 *
 *   registros inexistentes · IDs inválidos · valores inválidos ·
 *   datas inválidas · transições proibidas · pagamento duplicado ·
 *   compra duplicada · recorrência arquivada · conta cancelada
 *
 * Duas garantias valem para TODOS eles:
 *   1. a falha é sinalizada (exceção com mensagem compreensível);
 *   2. nada é gravado — o saldo e as tabelas ficam como estavam.
 *
 * Uma exceção engolida aqui significaria dado corrompido em silêncio.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { criarBancoTemporario, destruirBancoTemporario, criarServicos } from '../utils/ambiente-homologacao.mjs';

/** Cria jogador + serviço + recorrência + conta de setembro, prontos para o teste. */
function cenario(banco) {
  const s = criarServicos(banco);
  const jogador = s.servicoJogador.criar({ nome: 'Falhas', codinome: 'falhas' });
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
  s.servicoFinanca.criarTransacao(jogador.id, {
    tipo: 'receita', valorCentavos: 100000, categoria: 'salario', data: '2026-09-01',
  });
  return { s, jogador, servico, recorrencia, conta };
}

// ── Registros inexistentes e IDs inválidos ──────────────────────────────

test('CRÍTICO falhas | obter registro inexistente falha com mensagem clara', () => {
  const ambiente = criarBancoTemporario('homolog-f17-falha-inexistente-');
  try {
    const { s } = cenario(ambiente.banco);
    for (const [nome, chamar] of [
      ['missão', () => s.servicoMissao.obter(99999)],
      ['serviço', () => s.servicoServicos.obter(99999)],
      ['conta', () => s.servicoContas.obter(99999)],
      ['recorrência', () => s.servicoRecorrencias.obter(99999)],
      ['projeto', () => s.servicoProjeto.obter(99999)],
    ]) {
      assert.throws(chamar, (erro) => {
        assert.match(erro.message, new RegExp(nome, 'i'), `${nome}: mensagem deve citar o registro`);
        assert.match(erro.message, /99999/, `${nome}: mensagem deve citar o id procurado`);
        return true;
      }, `${nome} inexistente deveria falhar`);
    }
  } finally {
    destruirBancoTemporario(ambiente);
  }
});

// ── Valores e datas inválidos: nada pode ser gravado ────────────────────

test('CRÍTICO falhas | transação inválida não altera saldo nem histórico', () => {
  const ambiente = criarBancoTemporario('homolog-f17-falha-valor-');
  try {
    const { s, jogador } = cenario(ambiente.banco);
    const saldoAntes = s.servicoFinanca.obterCarteira(jogador.id).saldo;
    const transacoesAntes = s.servicoFinanca.listarTransacoes(jogador.id).length;

    const invalidas = [
      ['valor zero', { tipo: 'receita', valorCentavos: 0, categoria: 'salario', data: '2026-09-10' }],
      ['valor negativo', { tipo: 'receita', valorCentavos: -100, categoria: 'salario', data: '2026-09-10' }],
      ['valor fracionário', { tipo: 'receita', valorCentavos: 10.5, categoria: 'salario', data: '2026-09-10' }],
      ['data impossível', { tipo: 'receita', valorCentavos: 100, categoria: 'salario', data: '31/02/2026' }],
      ['data fora do formato', { tipo: 'receita', valorCentavos: 100, categoria: 'salario', data: '10/09/2026' }],
      ['categoria de despesa em receita', { tipo: 'receita', valorCentavos: 100, categoria: 'moradia', data: '2026-09-10' }],
      ['categoria inexistente', { tipo: 'receita', valorCentavos: 100, categoria: 'inexistente', data: '2026-09-10' }],
    ];
    for (const [nome, dados] of invalidas) {
      assert.throws(() => s.servicoFinanca.criarTransacao(jogador.id, dados), `${nome} deveria ser recusado`);
    }

    assert.equal(s.servicoFinanca.obterCarteira(jogador.id).saldo, saldoAntes, 'saldo não pode ter mudado');
    assert.equal(s.servicoFinanca.listarTransacoes(jogador.id).length, transacoesAntes, 'nenhuma transação gravada');
  } finally {
    destruirBancoTemporario(ambiente);
  }
});

test('CRÍTICO falhas | serviço sem nome, valor ou categoria válida é recusado', () => {
  const ambiente = criarBancoTemporario('homolog-f17-falha-servico-');
  try {
    const { s, jogador } = cenario(ambiente.banco);
    const total = s.servicoServicos.listar(jogador.id).length;
    assert.throws(() => s.servicoServicos.criar(jogador.id, { nome: '', categoria: 'contas', valorEsperado: 100 }));
    assert.throws(() => s.servicoServicos.criar(jogador.id, { nome: 'X', categoria: 'contas', valorEsperado: 0 }));
    assert.throws(() => s.servicoServicos.criar(jogador.id, { nome: 'X', categoria: 'inexistente', valorEsperado: 100 }));
    assert.equal(s.servicoServicos.listar(jogador.id).length, total, 'nenhum serviço criado');
  } finally {
    destruirBancoTemporario(ambiente);
  }
});

// ── Operações repetidas: o erro clássico de duplicar dinheiro ───────────

test('CRÍTICO falhas | pagar a mesma conta duas vezes não debita em dobro', () => {
  const ambiente = criarBancoTemporario('homolog-f17-falha-pagdup-');
  try {
    const { s, jogador, conta } = cenario(ambiente.banco);
    s.servicoPagamentos.registrarPagamento(jogador.id, conta.id, {
      paidAt: '2026-09-10', valorPagoCentavos: 10000,
    });
    const saldoAposPrimeiro = s.servicoFinanca.obterCarteira(jogador.id).saldo;
    const transacoesAposPrimeiro = s.servicoFinanca.listarTransacoes(jogador.id).length;

    assert.throws(
      () => s.servicoPagamentos.registrarPagamento(jogador.id, conta.id, {
        paidAt: '2026-09-11', valorPagoCentavos: 10000,
      }),
      /já foi paga/i,
      'segundo pagamento da mesma conta deveria ser recusado',
    );

    assert.equal(s.servicoFinanca.obterCarteira(jogador.id).saldo, saldoAposPrimeiro,
      'o saldo NÃO pode ser debitado duas vezes');
    assert.equal(s.servicoFinanca.listarTransacoes(jogador.id).length, transacoesAposPrimeiro,
      'nenhuma transação extra pode ser criada');
  } finally {
    destruirBancoTemporario(ambiente);
  }
});

test('CRÍTICO falhas | comprar o mesmo desejo duas vezes não gera duas despesas', () => {
  const ambiente = criarBancoTemporario('homolog-f17-falha-compradup-');
  try {
    const { s, jogador } = cenario(ambiente.banco);
    const desejo = s.servicoLoja.criar(jogador.id, {
      titulo: 'Fone', categoria: 'tecnologia', prioridade: 'alta', precoEsperado: 50000,
    });
    // A Fase 09 exige analisar → planejar → comprar.
    s.servicoLoja.analisar(desejo.id);
    s.servicoLoja.planejar(desejo.id);
    s.servicoLoja.comprar(desejo.id, { precoFinal: 45000, data: '2026-09-05' });
    const saldoAposPrimeira = s.servicoFinanca.obterCarteira(jogador.id).saldo;
    const transacoesAposPrimeira = s.servicoFinanca.listarTransacoes(jogador.id).length;

    assert.throws(
      () => s.servicoLoja.comprar(desejo.id, { precoFinal: 45000, data: '2026-09-05' }),
      /já foi comprado|comprado/i,
      'segunda compra do mesmo desejo deveria ser recusada',
    );

    assert.equal(s.servicoFinanca.obterCarteira(jogador.id).saldo, saldoAposPrimeira,
      'o saldo NÃO pode ser debitado duas vezes');
    assert.equal(s.servicoFinanca.listarTransacoes(jogador.id).length, transacoesAposPrimeira,
      'nenhuma despesa extra pode ser criada');
    assert.equal(s.servicoLoja.obter(desejo.id).estado, 'comprado');
  } finally {
    destruirBancoTemporario(ambiente);
  }
});

// ── Estados terminais: arquivado e cancelado são sem volta ──────────────

test('CRÍTICO falhas | recorrência arquivada não gera nem aceita edição', () => {
  const ambiente = criarBancoTemporario('homolog-f17-falha-arquiv-');
  try {
    const { s, jogador, servico } = cenario(ambiente.banco);
    const arquivada = s.servicoRecorrencias.criar(jogador.id, {
      servicoId: servico.id, frequencia: 'mensal', dataInicio: '2026-10-01',
      diaVencimento: 10, valorEsperado: 10000,
    });
    s.servicoRecorrencias.arquivar(arquivada.id);
    const contasAntes = s.servicoContas.listar(jogador.id, { servicoId: servico.id }).length;

    assert.throws(() => s.servicoGeracaoOcorrencias.gerar(arquivada.id, {
      periodoInicio: '2026-10-01', periodoFim: '2026-10-31', hoje: '2026-10-01',
    }), /arquivada/i, 'gerar de recorrência arquivada deveria ser recusado');

    assert.throws(() => s.servicoRecorrencias.atualizar(arquivada.id, { valorEsperado: 20000 }),
      /arquivada/i, 'editar recorrência arquivada deveria ser recusado');

    assert.equal(s.servicoContas.listar(jogador.id, { servicoId: servico.id }).length, contasAntes,
      'nenhuma conta pode ser criada a partir de regra arquivada');
  } finally {
    destruirBancoTemporario(ambiente);
  }
});

test('CRÍTICO falhas | serviço arquivado não é editado nem gera ocorrência', () => {
  const ambiente = criarBancoTemporario('homolog-f17-falha-serv-');
  try {
    const { s, jogador, servico } = cenario(ambiente.banco);
    s.servicoServicos.arquivar(servico.id);
    assert.throws(() => s.servicoServicos.atualizar(servico.id, { nome: 'Renomeado' }),
      /arquivado/i, 'editar serviço arquivado deveria ser recusado');
    assert.throws(() => s.servicoContas.criar(jogador.id, {
      servicoId: servico.id, referencia: '2026-11', vencimento: '2026-11-10', valorEsperado: 10000,
    }), /arquivado|encerrado/i, 'gerar conta de serviço arquivado deveria ser recusado');
  } finally {
    destruirBancoTemporario(ambiente);
  }
});

test('CRÍTICO falhas | conta cancelada não é paga', () => {
  const ambiente = criarBancoTemporario('homolog-f17-falha-cancel-');
  try {
    const { s, jogador, conta } = cenario(ambiente.banco);
    s.servicoContas.cancelar(conta.id);
    const saldoAntes = s.servicoFinanca.obterCarteira(jogador.id).saldo;
    assert.throws(() => s.servicoPagamentos.registrarPagamento(jogador.id, conta.id, {
      paidAt: '2026-09-10', valorPagoCentavos: 10000,
    }), /cancelada/i, 'pagar conta cancelada deveria ser recusado');
    assert.equal(s.servicoFinanca.obterCarteira(jogador.id).saldo, saldoAntes, 'saldo intocado');
  } finally {
    destruirBancoTemporario(ambiente);
  }
});

test('CRÍTICO falhas | transição de missão proibida é recusada sem mudar o estado', () => {
  const ambiente = criarBancoTemporario('homolog-f17-falha-missao-');
  try {
    const { s, jogador } = cenario(ambiente.banco);
    const missao = s.servicoMissao.criar(jogador.id, { titulo: 'Sem início' });
    assert.throws(() => s.servicoMissao.concluir(missao.id), 'concluir missão pendente deveria falhar');
    s.servicoMissao.iniciar(missao.id);
    s.servicoMissao.concluir(missao.id);
    // Concluída é terminal: nem recomeçar nem reconcluir.
    assert.throws(() => s.servicoMissao.iniciar(missao.id), 'reiniciar missão concluída deveria falhar');
    assert.throws(() => s.servicoMissao.concluir(missao.id), 'reconcluir deveria falhar');
    assert.equal(s.servicoMissao.obter(missao.id).estado, 'concluida', 'estado não muda após erro');
  } finally {
    destruirBancoTemporario(ambiente);
  }
});
