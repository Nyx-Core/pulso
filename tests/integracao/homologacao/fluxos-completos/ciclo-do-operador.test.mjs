/**
 * PULSO — Homologação FASE 17: CICLO COMPLETO DO OPERADOR.
 *
 * Percorre, num único cenário e num único banco, a cadeia inteira:
 *
 *   jogador → status → missão → projeto → progressão → finanças →
 *   serviço → recorrência → conta → pagamento → transação → carteira →
 *   dashboard
 *
 * É o teste que a Fase 17 exige: prova que as peças se encaixam de fato
 * e que o saldo exibido no dashboard é o saldo real, não um número
 * montado pela tela.
 *
 * Valores em centavos, como o domínio exige. Banco temporário isolado.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { criarBancoTemporario, destruirBancoTemporario, criarServicos } from '../../../utils/ambiente-homologacao.mjs';

const ANO_MES = '2026-09';

test('INT ciclo completo | jogador ao dashboard com serviço, conta e pagamento', () => {
  const ambiente = criarBancoTemporario('homolog-f17-ciclo-');
  const s = criarServicos(ambiente.banco);
  try {
    // ── 1. Jogador (criação atômica: status + progressão + carteira) ────
    const jogador = s.servicoJogador.criar({ nome: 'Ana Homologação', codinome: 'ana' });
    assert.equal(s.servicoStatus.obter(jogador.id).energia, 100);
    assert.equal(s.servicoProgressao.obter(jogador.id).nivel, 1);
    assert.equal(s.servicoFinanca.obterCarteira(jogador.id).saldo, 0, 'carteira começa zerada');

    // ── 2. Missão (Fase 05) ─────────────────────────────────────────────
    const missao = s.servicoMissao.criar(jogador.id, {
      titulo: 'Renovar contrato de banda larga',
      prioridade: 'alta',
    });
    assert.equal(s.servicoMissao.obter(missao.id).estado, 'pendente');

    // ── 3. Projeto (Fase 07) recebe a missão ───────────────────────────
    const projeto = s.servicoProjeto.criar(jogador.id, { titulo: 'Casa digital' });
    s.servicoProjeto.associarMissao(projeto.id, missao.id);
    assert.equal(s.servicoProjeto.obter(projeto.id).progresso, 0, 'progresso começa em 0');

    // ── 4. Missão iniciada e concluída → projeto acompanha ──────────────
    s.servicoMissao.iniciar(missao.id);
    s.servicoMissao.concluir(missao.id);
    assert.equal(s.servicoMissao.obter(missao.id).estado, 'concluida');
    assert.equal(s.servicoProjeto.obter(projeto.id).progresso, 100, 'missão concluída fecha o progresso');

    // ── 5. Progressão (Fase 06) — comportamento já existente ───────────
    const antesDoXp = s.servicoProgressao.obter(jogador.id);
    const comXp = s.servicoProgressao.adicionarXp(jogador.id, 150);
    assert.equal(comXp.xpTotal, antesDoXp.xpTotal + 150, 'XP acumulado');

    // ── 6. Finanças (Fase 08): receita manual ──────────────────────────
    s.servicoFinanca.criarTransacao(jogador.id, {
      tipo: 'receita', valorCentavos: 400000, categoria: 'salario', data: '2026-09-05',
    });
    assert.equal(s.servicoFinanca.obterCarteira(jogador.id).saldo, 400000, 'saldo após receita');

    // ── 7. Serviço (Fase 10.1) ─────────────────────────────────────────
    const servico = s.servicoServicos.criar(jogador.id, {
      nome: 'Internet fibra', categoria: 'telecomunicacoes', valorEsperado: 11990,
    });
    assert.equal(s.servicoServicos.obter(servico.id).estado, 'ativo');
    // Serviço sozinho NÃO move dinheiro.
    assert.equal(s.servicoFinanca.obterCarteira(jogador.id).saldo, 400000, 'cadastrar serviço não move saldo');

    // ── 8. Recorrência (Fase 10.3) ─────────────────────────────────────
    const recorrencia = s.servicoRecorrencias.criar(jogador.id, {
      servicoId: servico.id, frequencia: 'mensal', dataInicio: '2026-09-01',
      diaVencimento: 10, valorEsperado: 11990,
    });
    assert.equal(s.servicoRecorrencias.obter(recorrencia.id).estado, 'ativa');

    // ── 9. Geração de ocorrências (Fase 10.4) → conta concreta ─────────
    // `hoje` antes do vencimento (10/09) para a conta nascer PENDENTE;
    // com a data real de hoje ela já nasceria vencida, que é o esperado.
    const geracao = s.servicoGeracaoOcorrencias.gerar(recorrencia.id, {
      periodoInicio: '2026-09-01', periodoFim: '2026-09-30', hoje: '2026-09-05',
    });
    assert.equal(geracao.criadas, 1, 'deve criar 1 conta para setembro');
    assert.equal(geracao.existentes, 0);

    const contas = s.servicoContas.listar(jogador.id, { servicoId: servico.id });
    assert.equal(contas.length, 1);
    const conta = contas[0];
    // `listar` deriva a situação da data REAL de hoje; a conta vence em
    // 10/09, então em 29/09 ela está de fato vencida. O que importa aqui
    // é que gerar a conta NÃO moveu dinheiro.
    assert.equal(conta.estado, 'pendente', 'a conta nasce pendente no banco');
    assert.equal(conta.situacao, 'vencida', 'e aparece vencida para o operador hoje');
    assert.equal(s.servicoFinanca.obterCarteira(jogador.id).saldo, 400000, 'gerar conta não move saldo');

    // Geração repetida é idempotente: não duplica a conta.
    const repetida = s.servicoGeracaoOcorrencias.gerar(recorrencia.id, {
      periodoInicio: '2026-09-01', periodoFim: '2026-09-30', hoje: '2026-09-05',
    });
    assert.equal(repetida.criadas, 0, 'repetir a geração não cria contas novas');
    assert.equal(repetida.existentes, 1);
    assert.equal(s.servicoContas.listar(jogador.id, { servicoId: servico.id }).length, 1);

    // ── 10. Pagamento (Fase 10.5) → despesa + conta paga ───────────────
    const pagamento = s.servicoPagamentos.registrarPagamento(jogador.id, conta.id, {
      paidAt: '2026-09-10', valorPagoCentavos: 11990,
    });
    assert.equal(pagamento.conta.situacao, 'paga');
    assert.equal(s.servicoContas.obter(conta.id).transactionId, pagamento.transacao.id, 'conta vinculada à transação');

    // ── 11. Carteira: saldo é exatamente o esperado ────────────────────
    const saldoFinal = s.servicoFinanca.obterCarteira(jogador.id).saldo;
    assert.equal(saldoFinal, 400000 - 11990, 'saldo = receita − pagamento do serviço');

    // ── 12. Dashboard reflete os DADOS REAIS (Fase 15) ─────────────────
    const visao = s.servicoDashboard.visao({ anoMes: ANO_MES });
    assert.equal(visao.jogador.nome, 'Ana Homologação');
    assert.equal(visao.missoes.concluidas, 1);
    assert.equal(visao.projetos.total, 1);
    assert.equal(visao.financas.saldoAtualCentavos, saldoFinal, 'dashboard mostra o saldo real');
    assert.equal(visao.contas.pendentes, 0, 'conta paga não aparece mais como pendente');
    assert.equal(visao.contas.pagas, 1);
    assert.equal(visao.servicos.ativos, 1);

    // O dashboard é somente leitura: consultar de novo não muda nada.
    const saldoDepoisDeConsultar = s.servicoFinanca.obterCarteira(jogador.id).saldo;
    s.servicoDashboard.visao({ anoMes: ANO_MES });
    assert.equal(s.servicoFinanca.obterCarteira(jogador.id).saldo, saldoDepoisDeConsultar,
      'consultar o dashboard não pode mover dinheiro');
  } finally {
    destruirBancoTemporario(ambiente);
  }
});

