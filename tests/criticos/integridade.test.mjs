/**
 * PULSO — Homologação CRÍTICA 2: integridade entre entidades.
 * Severidade: CRÍTICA — FK órfã corrompe carteira/histórico/progresso.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ErroConflito } from '../../src/core/erros.js';
import { criarBancoTemporario, destruirBancoTemporario, criarServicos } from '../utils/ambiente-homologacao.mjs';

test('CRÍTICO integridade | transação de jogador inexistente bloqueada', () => {
  const ambiente = criarBancoTemporario('homolog-crit-integ-');
  const s = criarServicos(ambiente.banco);
  try {
    s.servicoJogador.criar({ nome: 'Dono' });
    assert.throws(() => s.servicoFinanca.criarTransacao(99999, { tipo: 'receita', valorCentavos: 100, categoria: 'venda', data: '2026-09-10' }), ErroConflito);
  } finally {
    destruirBancoTemporario(ambiente);
  }
});

test('CRÍTICO integridade | missão órfã rejeitada pelo banco (FK)', () => {
  const ambiente = criarBancoTemporario('homolog-crit-fk-');
  const s = criarServicos(ambiente.banco);
  try {
    assert.throws(() => ambiente.banco.prepare('INSERT INTO missao (jogador_id, titulo) VALUES (424242, ?)').run('órfã'));
    assert.equal(ambiente.banco.prepare('SELECT COUNT(*) AS n FROM missao WHERE jogador_id = 424242').get().n, 0);
  } finally {
    destruirBancoTemporario(ambiente);
  }
});

test('CRÍTICO integridade | CASCADE: remover jogador limpa status/progresso/missões', () => {
  const ambiente = criarBancoTemporario('homolog-crit-cascade-');
  const s = criarServicos(ambiente.banco);
  try {
    const jogador = s.servicoJogador.criar({ nome: 'Ecosistema' });
    s.servicoMissao.criar(jogador.id, { titulo: 'Dependente' });
    ambiente.banco.prepare('DELETE FROM jogador WHERE id = ?').run(jogador.id);
    assert.equal(ambiente.banco.prepare('SELECT COUNT(*) AS n FROM jogador_status WHERE jogador_id = ?').get(jogador.id).n, 0);
    assert.equal(ambiente.banco.prepare('SELECT COUNT(*) AS n FROM missao WHERE jogador_id = ?').get(jogador.id).n, 0);
    assert.equal(ambiente.banco.prepare('SELECT COUNT(*) AS n FROM jogador_progressao WHERE jogador_id = ?').get(jogador.id).n, 0);
  } finally {
    destruirBancoTemporario(ambiente);
  }
});

/** Popula todas as tabelas de negócio das Fases 08 a 16 para um jogador. */
function povoarTudo(s, jogador) {
  s.servicoFinanca.criarTransacao(jogador.id, {
    tipo: 'receita', valorCentavos: 50000, categoria: 'salario', data: '2026-09-01',
  });
  s.servicoMissao.criar(jogador.id, { titulo: 'Missão' });
  s.servicoProjeto.criar(jogador.id, { titulo: 'Projeto' });
  s.servicoLoja.criar(jogador.id, {
    titulo: 'Desejo', categoria: 'tecnologia', prioridade: 'alta', precoEsperado: 1000,
  });
  const servico = s.servicoServicos.criar(jogador.id, {
    nome: 'Serviço', categoria: 'contas', valorEsperado: 1000,
  });
  const recorrencia = s.servicoRecorrencias.criar(jogador.id, {
    servicoId: servico.id, frequencia: 'mensal', dataInicio: '2026-09-01',
    diaVencimento: 10, valorEsperado: 1000,
  });
  s.servicoGeracaoOcorrencias.gerar(recorrencia.id, {
    periodoInicio: '2026-09-01', periodoFim: '2026-09-30', hoje: '2026-09-01',
  });
}

/**
 * CASCADE por TODAS as tabelas de negócio, incluindo as das Fases 08 a 16.
 * O teste acima cobria só status/progressão/missões porque foi escrito na
 * Fase 06. Um `ON DELETE` faltando numa tabela das fases seguintes deixaria
 * dado órfão sem nenhuma tela do dia a dia acusar.
 */
test('CRÍTICO integridade | CASCADE limpa também as tabelas das Fases 08 a 16', () => {
  const ambiente = criarBancoTemporario('homolog-crit-cascade-16-');
  const s = criarServicos(ambiente.banco);
  try {
    const jogador = s.servicoJogador.criar({ nome: 'Ecosistema completo' });
    povoarTudo(s, jogador);

    const tabelas = ['jogador_status', 'jogador_progressao', 'jogador_atributos', 'carteira',
      'transacao', 'missao', 'projeto', 'desejo', 'servico', 'servico_recorrencia', 'servico_conta'];
    for (const tabela of tabelas) {
      const antes = ambiente.banco.prepare(`SELECT COUNT(*) AS n FROM ${tabela}`).get().n;
      assert.ok(antes > 0, `${tabela} deveria ter dado antes do teste`);
    }

    ambiente.banco.prepare('DELETE FROM jogador WHERE id = ?').run(jogador.id);

    for (const tabela of tabelas) {
      const restante = ambiente.banco.prepare(`SELECT COUNT(*) AS n FROM ${tabela}`).get().n;
      assert.equal(restante, 0, `${tabela} não foi limpa em CASCADE`);
    }
  } finally {
    destruirBancoTemporario(ambiente);
  }
});

test('CRÍTICO integridade | banco completo não tem FK violada nem dado órfão', () => {
  const ambiente = criarBancoTemporario('homolog-crit-fkcheck-');
  const s = criarServicos(ambiente.banco);
  try {
    const jogador = s.servicoJogador.criar({ nome: 'Completo' });
    povoarTudo(s, jogador);

    assert.deepEqual(ambiente.banco.prepare('PRAGMA foreign_key_check').all(), [],
      'nenhuma violação de chave estrangeira');
    assert.equal(ambiente.banco.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');

    // Nenhuma linha apontando para um pai inexistente.
    for (const [nome, consulta] of [
      ['missão', 'SELECT COUNT(*) AS n FROM missao m LEFT JOIN jogador j ON j.id = m.jogador_id WHERE j.id IS NULL'],
      ['projeto', 'SELECT COUNT(*) AS n FROM projeto p LEFT JOIN jogador j ON j.id = p.jogador_id WHERE j.id IS NULL'],
      ['transação', 'SELECT COUNT(*) AS n FROM transacao t LEFT JOIN carteira c ON c.id = t.carteira_id WHERE c.id IS NULL'],
      ['conta', 'SELECT COUNT(*) AS n FROM servico_conta sc LEFT JOIN servico sv ON sv.id = sc.servico_id WHERE sv.id IS NULL'],
      ['recorrência', 'SELECT COUNT(*) AS n FROM servico_recorrencia r LEFT JOIN servico sv ON sv.id = r.servico_id WHERE sv.id IS NULL'],
      ['desejo', 'SELECT COUNT(*) AS n FROM desejo d LEFT JOIN jogador j ON j.id = d.jogador_id WHERE j.id IS NULL'],
    ]) {
      assert.equal(ambiente.banco.prepare(consulta).get().n, 0, `${nome} órfã encontrada`);
    }
  } finally {
    destruirBancoTemporario(ambiente);
  }
});

