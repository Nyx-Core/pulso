/**
 * Testes unitários — sistema de migrações (Fase 02 — Banco de Dados)
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { abrirConexao, fecharConexao } from '../../src/core/database/conexao.js';
import { aplicarMigracoes, versaoAtual, MIGRACOES } from '../../src/core/database/migracoes.js';
import { calcularNivel } from '../../src/core/dominio/progressao.js';

test('banco vazio recebe as migrações oficiais: schema v15 com infraestrutura, jogador, status, missões, progressão, projetos, finanças, lista de desejos, conciliação legada, serviços, contas, recorrências, vínculo da geração, campos de pagamento e autocorreção do schema legado', () => {
  const banco = abrirConexao({ caminho: ':memory:' });
  try {
    const resultado = aplicarMigracoes(banco);
    assert.deepEqual(resultado.aplicadas, [
      { versao: 1, nome: 'criar-infraestrutura-base' },
      { versao: 2, nome: 'criar-tabela-jogador' },
      { versao: 3, nome: 'criar-tabela-status' },
      { versao: 4, nome: 'criar-tabela-missoes' },
      { versao: 5, nome: 'criar-tabelas-progressao' },
      { versao: 6, nome: 'criar-tabela-projetos' },
      { versao: 7, nome: 'criar-tabelas-financas' },
      { versao: 8, nome: 'criar-tabela-desejo' },
      { versao: 9, nome: 'conciliar-progressao-legado' },
      { versao: 10, nome: 'criar-tabela-servico' },
      { versao: 11, nome: 'criar-tabela-servico-conta' },
      { versao: 12, nome: 'criar-tabela-servico-recorrencia' },
      { versao: 13, nome: 'adicionar-recorrencia-id-em-servico-conta' },
      { versao: 14, nome: 'campos-de-pagamento-e-estado-paga-em-servico-conta' },
      { versao: 15, nome: 'criar-servico-ausente-e-restaurar-integridade-do-vinculo' },
    ]);
    assert.equal(resultado.versaoAtual, 15);
    assert.equal(versaoAtual(banco), 15);

    assert.equal(banco.prepare("SELECT valor FROM meta WHERE chave = 'aplicacao'").get().valor, 'PULSO');
    // a tabela do jogador existe e aceita inserção mínima
    banco.prepare("INSERT INTO jogador (nome) VALUES ('Teste')").run();
    assert.equal(banco.prepare('SELECT COUNT(*) AS n FROM jogador').get().n, 1);
    // a tabela de status existe e aceita inserção mínima
    banco.prepare("INSERT INTO jogador_status (jogador_id, energia, foco, estresse, criatividade) VALUES (1, 100, 100, 0, 100)").run();
    assert.equal(banco.prepare('SELECT COUNT(*) AS n FROM jogador_status').get().n, 1);
    // a tabela de missões existe e aceita inserção mínima (com projeto_id NULL)
    banco.prepare("INSERT INTO missao (jogador_id, titulo, estado, prioridade) VALUES (1, 'Teste', 'pendente', 'normal')").run();
    assert.equal(banco.prepare('SELECT COUNT(*) AS n FROM missao').get().n, 1);
    assert.equal(banco.prepare('SELECT projeto_id FROM missao WHERE id = 1').get().projeto_id, null);
    // as tabelas de progressão existem e aceitam inserção mínima
    banco.prepare('INSERT INTO jogador_progressao (jogador_id, xp_total, nivel, pontos_disponiveis) VALUES (1, 0, 1, 0)').run();
    assert.equal(banco.prepare('SELECT COUNT(*) AS n FROM jogador_progressao').get().n, 1);
    banco.prepare('INSERT INTO jogador_atributos (jogador_id, tecnologia, criatividade, musica, social, energia, foco, disciplina) VALUES (1, 1, 1, 1, 1, 1, 1, 1)').run();
    assert.equal(banco.prepare('SELECT COUNT(*) AS n FROM jogador_atributos').get().n, 1);
    // a tabela de projetos existe, aceita inserção mínima e vincula missão
    banco.prepare("INSERT INTO projeto (jogador_id, titulo) VALUES (1, 'Projeto')").run();
    assert.equal(banco.prepare('SELECT COUNT(*) AS n FROM projeto').get().n, 1);
    // as tabelas de finanças existem, aceitam inserção mínima e validam CHECKs
    banco.prepare("INSERT INTO carteira (jogador_id, nome, moeda) VALUES (1, 'Carteira Principal', 'BRL')").run();
    assert.equal(banco.prepare('SELECT COUNT(*) AS n FROM carteira').get().n, 1);
    banco.prepare("INSERT INTO transacao (carteira_id, tipo, valor_centavos, categoria, ocorrida_em) VALUES (1, 'receita', 1000, 'salario', '2026-09-01')").run();
    assert.equal(banco.prepare('SELECT COUNT(*) AS n FROM transacao').get().n, 1);
    banco.prepare("INSERT INTO orcamento (jogador_id, categoria, valor_centavos, inicio, fim) VALUES (1, 'alimentacao', 50000, '2026-09-01', '2026-09-30')").run();
    assert.equal(banco.prepare('SELECT COUNT(*) AS n FROM orcamento').get().n, 1);
    // a tabela da lista de desejos existe, aceita inserção mínima e valida CHECKs
    banco.prepare("INSERT INTO desejo (jogador_id, titulo, categoria, prioridade, estado, valor_esperado_centavos) VALUES (1, 'SSD NVMe', 'tecnologia', 'alta', 'desejado', 45000)").run();
    assert.equal(banco.prepare('SELECT COUNT(*) AS n FROM desejo').get().n, 1);
    assert.throws(
      () => banco.prepare("INSERT INTO desejo (jogador_id, titulo, categoria, prioridade, estado, valor_esperado_centavos) VALUES (1, 'X', 'tecnologia', 'alta', 'estado_invalido', 100)").run(),
      /CHECK/,
    );
    // a tabela de serviços existe, aceita inserção mínima e valida CHECKs
    banco.prepare("INSERT INTO servico (jogador_id, nome, categoria, valor_esperado_centavos, estado) VALUES (1, 'Internet', 'telecomunicacoes', 12000, 'ativo')").run();
    assert.equal(banco.prepare('SELECT COUNT(*) AS n FROM servico').get().n, 1);
    assert.throws(
      () => banco.prepare("INSERT INTO servico (jogador_id, nome, categoria, valor_esperado_centavos, estado) VALUES (1, 'X', 'categoria_invalida', 12000, 'ativo')").run(),
      /CHECK/,
    );
    assert.throws(
      () => banco.prepare("INSERT INTO servico (jogador_id, nome, categoria, valor_esperado_centavos, estado) VALUES (1, 'X', 'contas', 0, 'ativo')").run(),
      /CHECK/,
    );
    assert.throws(
      () => banco.prepare("INSERT INTO servico (jogador_id, nome, categoria, valor_esperado_centavos, estado) VALUES (1, 'X', 'contas', 12000, 'estado_invalido')").run(),
      /CHECK/,
    );
    // a tabela de contas de serviço existe, aceita inserção mínima e valida CHECKs
    banco.prepare("INSERT INTO servico_conta (jogador_id, servico_id, referencia, valor_esperado_centavos, vencimento, estado) VALUES (1, 1, '2026-09', 12000, '2026-09-15', 'pendente')").run();
    assert.equal(banco.prepare('SELECT COUNT(*) AS n FROM servico_conta').get().n, 1);
    assert.throws(
      () => banco.prepare("INSERT INTO servico_conta (jogador_id, servico_id, referencia, valor_esperado_centavos, vencimento, estado) VALUES (1, 1, '2026-10', 0, '2026-10-15', 'pendente')").run(),
      /CHECK/,
    );
    assert.throws(
      () => banco.prepare("INSERT INTO servico_conta (jogador_id, servico_id, referencia, valor_esperado_centavos, vencimento, estado) VALUES (1, 1, '2026-11', 12000, '2026-11-15', 'vencida')").run(),
      /CHECK/,
    );
    assert.throws(
      () => banco.prepare("INSERT INTO servico_conta (jogador_id, servico_id, referencia, valor_esperado_centavos, vencimento, estado) VALUES (1, 1, '2026-09', 12000, '2026-09-15', 'pendente')").run(),
      /UNIQUE/,
      'a mesma ocorrência (serviço + referência) não pode duplicar',
    );
    assert.throws(
      () => banco.prepare("INSERT INTO servico_conta (jogador_id, servico_id, referencia, valor_esperado_centavos, vencimento, estado) VALUES (1, 999, '2026-09', 12000, '2026-09-15', 'pendente')").run(),
      /FOREIGN KEY/,
      'a conta exige um serviço existente',
    );
    // a tabela de recorrências existe, aceita inserção mínima e valida CHECKs
    banco.prepare("INSERT INTO servico_recorrencia (jogador_id, servico_id, frequencia, data_inicio, data_fim, dia_vencimento, valor_esperado_centavos, estado) VALUES (1, 1, 'mensal', '2026-09-01', NULL, 15, 12000, 'ativa')").run();
    assert.equal(banco.prepare('SELECT COUNT(*) AS n FROM servico_recorrencia').get().n, 1);
    assert.throws(
      () => banco.prepare("INSERT INTO servico_recorrencia (jogador_id, servico_id, frequencia, data_inicio, data_fim, dia_vencimento, valor_esperado_centavos, estado) VALUES (1, 1, 'quinzenal', '2026-09-01', NULL, 15, 12000, 'ativa')").run(),
      /CHECK/,
      'frequência fora da lista controlada é rejeitada',
    );
    assert.throws(
      () => banco.prepare("INSERT INTO servico_recorrencia (jogador_id, servico_id, frequencia, data_inicio, data_fim, dia_vencimento, valor_esperado_centavos, estado) VALUES (1, 1, 'mensal', '2026-09-01', NULL, 0, 12000, 'ativa')").run(),
      /CHECK/,
      'dia de vencimento fora de 1–31 é rejeitado',
    );
    assert.throws(
      () => banco.prepare("INSERT INTO servico_recorrencia (jogador_id, servico_id, frequencia, data_inicio, data_fim, dia_vencimento, valor_esperado_centavos, estado) VALUES (1, 1, 'mensal', '2026-09-01', NULL, 15, -100, 'ativa')").run(),
      /CHECK/,
      'valor esperado negativo é rejeitado',
    );
    assert.throws(
      () => banco.prepare("INSERT INTO servico_recorrencia (jogador_id, servico_id, frequencia, data_inicio, data_fim, dia_vencimento, valor_esperado_centavos, estado) VALUES (1, 1, 'mensal', '2026-09-01', NULL, 15, 12000, 'ativa2')").run(),
      /CHECK/,
      'estado fora da lista controlada é rejeitado',
    );
    assert.throws(
      () => banco.prepare("INSERT INTO servico_recorrencia (jogador_id, servico_id, frequencia, data_inicio, data_fim, dia_vencimento, valor_esperado_centavos, estado) VALUES (1, 1, 'mensal', '1-9-2026', NULL, 15, 12000, 'ativa')").run(),
      /CHECK/,
      'data fora do formato AAAA-MM-DD é rejeitada',
    );
    assert.throws(
      () => banco.prepare("INSERT INTO servico_recorrencia (jogador_id, servico_id, frequencia, data_inicio, data_fim, dia_vencimento, valor_esperado_centavos, estado) VALUES (1, 999, 'mensal', '2026-09-01', NULL, 15, 12000, 'ativa')").run(),
      /FOREIGN KEY/,
      'a recorrência exige um serviço existente',
    );
    // vínculo da geração (Fase 10.4): servico_conta.recorrencia_id existe,
    // aceita NULL (contas manuais) e valida a chave estrangeira
    const colunasConta = banco
      .prepare('PRAGMA table_info(servico_conta)')
      .all()
      .map((coluna) => coluna.name);
    assert.ok(colunasConta.includes('recorrencia_id'), 'servico_conta deve ter recorrencia_id');
    banco.prepare("INSERT INTO servico_conta (jogador_id, servico_id, referencia, valor_esperado_centavos, vencimento, estado, recorrencia_id) VALUES (1, 1, '2026-12', 12000, '2026-12-31', 'pendente', 1)").run();
    assert.equal(
      banco.prepare("SELECT recorrencia_id FROM servico_conta WHERE referencia = '2026-12'").get().recorrencia_id,
      1,
      'a conta gerada guarda a recorrência de origem',
    );
    assert.throws(
      () => banco.prepare("INSERT INTO servico_conta (jogador_id, servico_id, referencia, valor_esperado_centavos, vencimento, estado, recorrencia_id) VALUES (1, 1, '2027-01', 12000, '2027-01-31', 'pendente', 999)").run(),
      /FOREIGN KEY/,
      'recorrencia_id exige uma recorrência existente',
    );
  } finally {
    fecharConexao(banco);
  }
});

test('migrações já aplicadas não são executadas novamente', () => {
  const banco = abrirConexao({ caminho: ':memory:' });
  try {
    aplicarMigracoes(banco);
    const registroOriginal = banco
      .prepare('SELECT aplicada_em FROM schema_migrations WHERE versao = 1')
      .get();

    const segundaExecucao = aplicarMigracoes(banco);
    assert.deepEqual(segundaExecucao.aplicadas, [], 'nenhuma migração deveria rodar de novo');

    const registroDepois = banco
      .prepare('SELECT aplicada_em FROM schema_migrations WHERE versao = 1')
      .get();
    assert.equal(registroDepois.aplicada_em, registroOriginal.aplicada_em, 'registro inalterado');
    assert.equal(
      banco.prepare('SELECT COUNT(*) AS n FROM schema_migrations').get().n,
      MIGRACOES.length,
      'todas as migrações oficiais registradas uma única vez',
    );
  } finally {
    fecharConexao(banco);
  }
});

test('migração pendente é executada quando o banco já existe (evolução)', () => {
  const banco = abrirConexao({ caminho: ':memory:' });
  try {
    const m1 = MIGRACOES[0];
    aplicarMigracoes(banco, [m1]);

    const m2 = {
      versao: 2,
      nome: 'teste-migracao-pendente',
      cima(db) {
        db.exec('CREATE TABLE pendente_teste (id INTEGER PRIMARY KEY) STRICT');
      },
    };
    const resultado = aplicarMigracoes(banco, [m1, m2]);
    assert.deepEqual(resultado.aplicadas, [{ versao: 2, nome: 'teste-migracao-pendente' }]);
    assert.equal(versaoAtual(banco), 2);
    banco.prepare('INSERT INTO pendente_teste (id) VALUES (1)').run(); // tabela existe
  } finally {
    fecharConexao(banco);
  }
});

test('falha de migração reverte a transação e produz erro identificável', () => {
  const banco = abrirConexao({ caminho: ':memory:' });
  try {
    const m1 = MIGRACOES[0];
    const mRuim = {
      versao: 2,
      nome: 'migracao-que-falha',
      cima(db) {
        db.exec('CREATE TABLE antes_da_falha (id INTEGER PRIMARY KEY) STRICT');
        db.exec('INSERT INTO tabela_que_nao_existe VALUES (1)'); // provoca o erro
      },
    };

    assert.throws(
      () => aplicarMigracoes(banco, [m1, mRuim]),
      /Falha na migração 2 \(migracao-que-falha\) — transação revertida/,
    );

    const tabelaRevertida = banco
      .prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE name = 'antes_da_falha'")
      .get().n;
    assert.equal(tabelaRevertida, 0, 'DDL executado antes da falha deve ser revertido');
    assert.equal(versaoAtual(banco), 1, 'migração falha não pode ficar registrada');
  } finally {
    fecharConexao(banco);
  }
});

test('lista de migrações inválida é rejeitada antes de tocar no banco', () => {
  const banco = abrirConexao({ caminho: ':memory:' });
  try {
    assert.throws(
      () =>
        aplicarMigracoes(banco, [
          { versao: 1, nome: 'a', cima() {} },
          { versao: 1, nome: 'b', cima() {} },
        ]),
      /sequência sem lacunas/,
    );
    assert.throws(
      () => aplicarMigracoes(banco, [{ versao: 2, nome: 'pula-a-versao-1', cima() {} }]),
      /sequência sem lacunas/,
    );
    assert.throws(
      () => aplicarMigracoes(banco, [{ versao: 1, nome: 'Nome Invalido', cima() {} }]),
      /nome inválido/,
    );
  } finally {
    fecharConexao(banco);
  }
});

/**
 * Réplica do problema real: banco criado pela PRIMEIRA implementação da
 * Fase 06 registra as versões 5–8 como aplicadas, mas com
 * `jogador_progressao` SEM `nivel` e `jogador_atributo` no singular.
 * A Migração 009 reconstrói as tabelas no formato atual SEM perder dados.
 */
test('migração 009 concilia banco legado da Fase 06: restaura nivel e jogador_atributos preservando dados', () => {
  const banco = abrirConexao({ caminho: ':memory:' });
  try {
    // 1) Base com as migrações 1–4 atuais (infraestrutura, jogador, status, missões).
    aplicarMigracoes(banco, MIGRACOES.slice(0, 4));
    banco.prepare("INSERT INTO jogador (nome) VALUES ('Legado')").run();

    // 2) Tabelas de progressão na forma LEGADA (commit 7473e06, Fase 06 v1).
    banco.exec(`
      CREATE TABLE jogador_progressao (
        id                   INTEGER PRIMARY KEY,
        jogador_id           INTEGER NOT NULL UNIQUE REFERENCES jogador(id) ON DELETE CASCADE,
        xp_total             INTEGER NOT NULL DEFAULT 0,
        pontos_disponiveis   INTEGER NOT NULL DEFAULT 0,
        criado_em            TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        atualizado_em        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        CHECK (xp_total >= 0),
        CHECK (pontos_disponiveis >= 0)
      ) STRICT
    `);
    banco.exec(`
      CREATE TABLE jogador_atributo (
        id                   INTEGER PRIMARY KEY,
        jogador_id           INTEGER NOT NULL UNIQUE REFERENCES jogador(id) ON DELETE CASCADE,
        tecnologia           INTEGER NOT NULL DEFAULT 1,
        criatividade         INTEGER NOT NULL DEFAULT 1,
        musica               INTEGER NOT NULL DEFAULT 1,
        social               INTEGER NOT NULL DEFAULT 1,
        energia              INTEGER NOT NULL DEFAULT 1,
        foco                 INTEGER NOT NULL DEFAULT 1,
        disciplina           INTEGER NOT NULL DEFAULT 1,
        criado_em            TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        atualizado_em        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        CHECK (tecnologia BETWEEN 1 AND 100),
        CHECK (criatividade BETWEEN 1 AND 100),
        CHECK (musica BETWEEN 1 AND 100),
        CHECK (social BETWEEN 1 AND 100),
        CHECK (energia BETWEEN 1 AND 100),
        CHECK (foco BETWEEN 1 AND 100),
        CHECK (disciplina BETWEEN 1 AND 100)
      ) STRICT
    `);
    banco.exec('CREATE INDEX IF NOT EXISTS idx_progressao_jogador ON jogador_progressao(jogador_id)');
    banco.exec('CREATE INDEX IF NOT EXISTS idx_atributo_jogador ON jogador_atributo(jogador_id)');

    // 3) Dados reais do usuário: XP acumulado e atributos já distribuídos.
    banco.prepare('INSERT INTO jogador_progressao (jogador_id, xp_total, pontos_disponiveis) VALUES (1, 450, 2)').run();
    banco.prepare('INSERT INTO jogador_atributo (jogador_id, tecnologia, criatividade, musica) VALUES (1, 7, 3, 5)').run();

    // 4) O banco legado registra as versões 5–8 como aplicadas (nunca reexecuta).
    const registrar = banco.prepare('INSERT INTO schema_migrations (versao, nome) VALUES (?, ?)');
    for (let versao = 5; versao <= 8; versao += 1) registrar.run(versao, `legado-${versao}`);

    // 5) A aplicação atual aplica a conciliação (v9), os serviços (v10),
    //    as contas (v11), as recorrências (v12), o vínculo da geração (v13),
    //    os campos de pagamento (v14) e a autocorreção (v15).
    const resultado = aplicarMigracoes(banco);
    assert.deepEqual(resultado.aplicadas, [
      { versao: 9, nome: 'conciliar-progressao-legado' },
      { versao: 10, nome: 'criar-tabela-servico' },
      { versao: 11, nome: 'criar-tabela-servico-conta' },
      { versao: 12, nome: 'criar-tabela-servico-recorrencia' },
      { versao: 13, nome: 'adicionar-recorrencia-id-em-servico-conta' },
      { versao: 14, nome: 'campos-de-pagamento-e-estado-paga-em-servico-conta' },
      { versao: 15, nome: 'criar-servico-ausente-e-restaurar-integridade-do-vinculo' },
    ]);
    assert.equal(versaoAtual(banco), 15);

    // 6) Progressão reconstruída: nivel derivado do XP pela regra do domínio.
    const colunas = banco
      .prepare('PRAGMA table_info(jogador_progressao)')
      .all()
      .map((coluna) => coluna.name);
    assert.ok(colunas.includes('nivel'), 'a coluna nivel deve ser restaurada');
    const progressao = banco.prepare('SELECT * FROM jogador_progressao WHERE jogador_id = 1').get();
    assert.equal(progressao.xp_total, 450, 'XP preservado');
    assert.equal(progressao.pontos_disponiveis, 2, 'pontos preservados');
    assert.equal(progressao.nivel, calcularNivel(450), 'nivel segue a regra do domínio');

    // 7) Atributos reconstruídos no plural, valores preservados; legada removida.
    const tabelaLegada = banco
      .prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'table' AND name = 'jogador_atributo'")
      .get().n;
    assert.equal(tabelaLegada, 0, 'a tabela legada no singular deve ser removida');
    const atributos = banco.prepare('SELECT * FROM jogador_atributos WHERE jogador_id = 1').get();
    assert.equal(atributos.tecnologia, 7);
    assert.equal(atributos.criatividade, 3);
    assert.equal(atributos.musica, 5);

    // 8) Reexecução: conciliação é idempotente (nada roda, nada muda).
    const segunda = aplicarMigracoes(banco);
    assert.deepEqual(segunda.aplicadas, []);
    assert.equal(banco.prepare('SELECT COUNT(*) AS n FROM jogador_progressao').get().n, 1);
    assert.equal(banco.prepare('SELECT COUNT(*) AS n FROM jogador_atributos').get().n, 1);
  } finally {
    fecharConexao(banco);
  }
});

test('migração 009 não altera banco que já está no formato atual', () => {
  const banco = abrirConexao({ caminho: ':memory:' });
  try {
    // Banco novo: schema v8 correto + v9 que não encontra forma legada.
    aplicarMigracoes(banco);
    const tabelas = banco
      .prepare("SELECT name FROM sqlite_master WHERE name LIKE 'jogador_progress%' OR name LIKE 'jogador_atribut%' ORDER BY name")
      .all()
      .map((linha) => linha.name);
    assert.deepEqual(
      tabelas,
      ['jogador_atributos', 'jogador_progressao'],
      'somente as tabelas no formato atual devem existir',
    );
  } finally {
    fecharConexao(banco);
  }
});

// ── Regressão: banco sem a tabela `servico` (Fase 17) ──────────────────
//
// A migração 014 criava `servico_conta_pagamento` com
// `REFERENCES servico(id)` e logo depois copiava as linhas com
// `INSERT ... SELECT`. Com `PRAGMA foreign_keys = ON`, o SQLite aceita o
// CREATE, mas valida a FK no DML — e o INSERT quebrava com
// "no such table: main.servico", travando a abertura da aplicação em
// bancos legados/sintéticos que registrassem a v11+ sem a tabela `servico`.
//
// A mesma proteção que já existia para `transacao` passou a valer para
// `servico` e `servico_recorrencia`.

test('migração 014: banco sem a tabela `servico` migra sem travar (regressão)', () => {
  const banco = abrirConexao({ caminho: ':memory:' });
  try {
    // Sobe até a v13 e remove a tabela que a v14 referencia.
    aplicarMigracoes(banco, MIGRACOES.slice(0, 13));
    banco.exec('DROP TABLE servico');
    const temServico = banco
      .prepare("SELECT 1 AS existe FROM sqlite_master WHERE type = 'table' AND name = 'servico'")
      .get();
    assert.equal(temServico, undefined, 'pré-condição: a tabela servico realmente não existe');

    // Antes da correção isto lançava "no such table: main.servico".
    const resultado = aplicarMigracoes(banco, MIGRACOES);
    assert.equal(versaoAtual(banco), MIGRACOES.length, 'a migração deve concluir');

    // A tabela final existe, com os CHECKs de sempre e sem FK órfã.
    const sql = banco
      .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'servico_conta'")
      .get().sql;
    assert.match(sql, /UNIQUE \(servico_id, referencia\)/);
    assert.match(sql, /CHECK \(estado IN \('pendente', 'paga', 'cancelada'\)\)/);
    assert.deepEqual(banco.prepare('PRAGMA foreign_key_check').all(), [], 'nenhuma FK órfã');
    // A v014 não trava e a v015 (que só existe a partir de agora) completa a
    // recuperação: a tabela que faltava é recriada e a FK volta.
    assert.deepEqual(resultado.aplicadas.map((m) => m.versao), [14, 15]);
    assert.ok(
      banco.prepare("SELECT 1 AS existe FROM sqlite_master WHERE type = 'table' AND name = 'servico'").get(),
      'a tabela servico é recriada — a aplicação abre',
    );
    assert.ok(
      banco.prepare('PRAGMA foreign_key_list(servico_conta)').all()
        .some((v) => v.from === 'servico_id' && v.table === 'servico'),
      'e a integridade referencial do vínculo é restaurada',
    );
  } finally {
    fecharConexao(banco);
  }
});

test('migração 014: banco completo mantém as três FKs de servico_conta', () => {
  const banco = abrirConexao({ caminho: ':memory:' });
  try {
    aplicarMigracoes(banco, MIGRACOES);
    const sql = banco
      .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'servico_conta'")
      .get().sql;
    // A guarda só remove a REFERENCES quando o alvo NÃO existe: no banco
    // completo, as três continuam — perder a integridade referencial seria
    // trocar um bug de inicialização por um bug de dados.
    assert.match(sql, /REFERENCES servico\(id\) ON DELETE RESTRICT/, 'FK de serviço preservada');
    assert.match(sql, /REFERENCES servico_recorrencia\(id\)/, 'FK de recorrência preservada');
    assert.match(sql, /REFERENCES transacao\(id\)/, 'FK de transação preservada');
  } finally {
    fecharConexao(banco);
  }
});

test('migração 014: reconstrói a tabela preservando as contas existentes', () => {
  const banco = abrirConexao({ caminho: ':memory:' });
  try {
    aplicarMigracoes(banco, MIGRACOES.slice(0, 13));
    const agora = new Date().toISOString();
    banco.prepare("INSERT INTO jogador (nome, criado_em) VALUES (?, ?)").run('Ana', agora);
    banco
      .prepare(
        `INSERT INTO servico (jogador_id, nome, categoria, valor_esperado_centavos, estado, criado_em, atualizado_em)
         VALUES (1, 'Internet', 'contas', 5000, 'ativo', ?, ?)`,
      )
      .run(agora, agora);
    banco
      .prepare(
        `INSERT INTO servico_conta
           (jogador_id, servico_id, referencia, valor_esperado_centavos, vencimento, estado, criado_em, atualizado_em)
         VALUES (1, 1, '2026-09', 5000, '2026-09-10', 'pendente', ?, ?)`,
      )
      .run(agora, agora);

    aplicarMigracoes(banco, MIGRACOES);

    const conta = banco.prepare('SELECT * FROM servico_conta').all();
    assert.equal(conta.length, 1, 'a conta não pode sumir na reconstrução');
    assert.equal(conta[0].referencia, '2026-09');
    assert.equal(conta[0].valor_esperado_centavos, 5000);
    // Sem pagamento registrado, a conta não pode virar 'paga'.
    assert.equal(conta[0].estado, 'pendente');
    assert.equal(conta[0].paid_amount, null);
  } finally {
    fecharConexao(banco);
  }
});

test('migração 015: banco com a v010 reescrita recebe a tabela servico que faltava (regressão do BUG 001)', () => {
  const banco = abrirConexao({ caminho: ':memory:' });
  try {
    // Cenário REAL do usuário: banco montado antes de a v010 ser reformulada
    // para "serviços". A v010 consta como aplicada com o nome antigo e existem
    // as tabelas legadas no lugar de `servico`.
    aplicarMigracoes(banco, MIGRACOES.slice(0, 9));
    banco.prepare("INSERT INTO jogador (nome) VALUES ('Ana')").run();
    banco.exec(`
      CREATE TABLE despesa_recorrente (
        id                      INTEGER PRIMARY KEY,
        jogador_id              INTEGER NOT NULL REFERENCES jogador(id) ON DELETE CASCADE,
        nome                    TEXT NOT NULL,
        categoria               TEXT NOT NULL,
        valor_esperado_centavos INTEGER NOT NULL CHECK (valor_esperado_centavos > 0)
      ) STRICT
    `);
    banco.prepare("INSERT INTO despesa_recorrente (jogador_id, nome, categoria, valor_esperado_centavos) VALUES (1, 'Aluguel', 'moradia', 120000)").run();
    // A v010 fica registrada com o NOME ANTIGO — é isso que faz o mecanismo
    // (que decide pelo número) pular a criação de `servico` para sempre.
    banco.prepare('INSERT INTO schema_migrations (versao, nome) VALUES (?, ?)').run(10, 'criar-tabelas-despesas-recorrentes');
    // A partir daqui o código atual roda da v011 em diante: a v010 é pulada
    // pelo NÚMERO, que é exatamente o defeito relatado.
    aplicarMigracoes(banco, MIGRACOES.slice(0, 14));

    // Pré-condição fiel ao banco do usuário: versão 14, sem `servico`.
    assert.equal(versaoAtual(banco), 14);
    assert.equal(
      banco.prepare("SELECT 1 AS e FROM sqlite_master WHERE type = 'table' AND name = 'servico'").get(),
      undefined,
      'pré-condição: a tabela servico realmente não existe',
    );

    // Antes da correção isto não resolvia: nenhuma migração rodava, o log
    // dizia "0 migração(ões)" e a aplicação morria com "no such table: servico".
    const resultado = aplicarMigracoes(banco, MIGRACOES);
    assert.deepEqual(resultado.aplicadas.map((m) => m.versao), [15], 'apenas a v015 faltava');
    assert.equal(versaoAtual(banco), 15);

    // `servico` existe agora, com a MESMA definição canônica da v010.
    const sqlServico = banco
      .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'servico'")
      .get().sql;
    assert.match(sqlServico, /CREATE TABLE servico/);
    assert.match(sqlServico, /REFERENCES jogador\(id\) ON DELETE CASCADE/);
    assert.match(sqlServico, /CHECK \(categoria IN/);
    assert.match(sqlServico, /'telecomunicacoes'/);
    assert.match(sqlServico, /STRICT/);
    assert.equal(
      banco.prepare('SELECT COUNT(*) AS n FROM servico').get().n, 0,
      'a tabela nasce vazia: não se inventa serviço para preencher id órfão',
    );

    // A FK que a v014 degradou volta a existir.
    const vincios = banco.prepare('PRAGMA foreign_key_list(servico_conta)').all();
    assert.ok(
      vincios.some((v) => v.from === 'servico_id' && v.table === 'servico'),
      'a integridade referencial do vínculo com serviço deve ser restaurada',
    );
    assert.deepEqual(banco.prepare('PRAGMA foreign_key_check').all(), [], 'nenhuma FK órfã');
  } finally {
    fecharConexao(banco);
  }
});

test('migração 015: preserva as contas existentes ao restaurar a FK do vínculo', () => {
  const banco = abrirConexao({ caminho: ':memory:' });
  try {
    // Mesmo caminho degradado da v014, agora com DADO dentro da tabela: a
    // reconstrução da FK não pode custar uma linha ao usuário.
    aplicarMigracoes(banco, MIGRACOES.slice(0, 13));
    banco.exec('DROP TABLE servico'); // simula a v010 que nunca rodou
    const agora = new Date().toISOString();
    banco.prepare('INSERT INTO jogador (nome, criado_em) VALUES (?, ?)').run('Ana', agora);
    banco.exec(`
      CREATE TABLE servico_conta_degradada (
        id                      INTEGER PRIMARY KEY,
        jogador_id              INTEGER NOT NULL REFERENCES jogador(id) ON DELETE CASCADE,
        servico_id              INTEGER NOT NULL,
        referencia              TEXT NOT NULL,
        descricao               TEXT,
        valor_esperado_centavos INTEGER NOT NULL CHECK (valor_esperado_centavos > 0),
        vencimento              TEXT NOT NULL,
        estado                  TEXT NOT NULL,
        criado_em               TEXT NOT NULL,
        atualizado_em           TEXT NOT NULL,
        cancelado_em            TEXT,
        recorrencia_id          INTEGER,
        paid_amount             INTEGER,
        paid_at                 TEXT,
        payment_description     TEXT,
        transaction_id          INTEGER,
        UNIQUE (servico_id, referencia)
      ) STRICT
    `);
    banco.prepare(`INSERT INTO servico_conta_degradada
      (jogador_id, servico_id, referencia, valor_esperado_centavos, vencimento, estado, criado_em, atualizado_em)
      VALUES (1, 1, '2026-09', 5000, '2026-09-10', 'pendente', ?, ?)`).run(agora, agora);
    banco.exec('DROP TABLE servico_conta');
    banco.exec('ALTER TABLE servico_conta_degradada RENAME TO servico_conta');

    aplicarMigracoes(banco, MIGRACOES);

    // A conta continua lá: a recriação de `servico` não custou dado do usuário.
    const contas = banco.prepare('SELECT * FROM servico_conta').all();
    assert.equal(contas.length, 1, 'a conta não pode sumir na correção');
    assert.equal(contas[0].servico_id, 1);
    assert.equal(contas[0].referencia, '2026-09');
    assert.equal(contas[0].valor_esperado_centavos, 5000);
    // E a tabela de serviços, que era o que faltava de fato, agora existe.
    assert.ok(
      banco.prepare("SELECT 1 AS e FROM sqlite_master WHERE type = 'table' AND name = 'servico'").get(),
      'a tabela servico foi recriada',
    );
    assert.equal(versaoAtual(banco), 15, 'a migração concluiu — a aplicação abre');
  } finally {
    fecharConexao(banco);
  }
});

test('migração 015: órfão impede a restauração da FK, mas nunca impede a aplicação de abrir', () => {
  const banco = abrirConexao({ caminho: ':memory:' });
  try {
    // Caso defensivo: uma conta apontando para um serviço que não existe
    // tornaria a cópia com FK declarada ilegível. A prioridade é a aplicação
    // abrir; a integridade declarativa espera o serviço aparecer.
    aplicarMigracoes(banco, MIGRACOES.slice(0, 13));
    banco.exec('DROP TABLE servico');
    const agora = new Date().toISOString();
    banco.prepare('INSERT INTO jogador (nome, criado_em) VALUES (?, ?)').run('Ana', agora);
    banco.exec(`
      CREATE TABLE servico_conta_degradada (
        id                      INTEGER PRIMARY KEY,
        jogador_id              INTEGER NOT NULL REFERENCES jogador(id) ON DELETE CASCADE,
        servico_id              INTEGER NOT NULL,
        referencia              TEXT NOT NULL,
        descricao               TEXT,
        valor_esperado_centavos INTEGER NOT NULL CHECK (valor_esperado_centavos > 0),
        vencimento              TEXT NOT NULL,
        estado                  TEXT NOT NULL,
        criado_em               TEXT NOT NULL,
        atualizado_em           TEXT NOT NULL,
        cancelado_em            TEXT,
        recorrencia_id          INTEGER,
        paid_amount             INTEGER,
        paid_at                 TEXT,
        payment_description     TEXT,
        transaction_id          INTEGER,
        UNIQUE (servico_id, referencia)
      ) STRICT
    `);
    banco.prepare(`INSERT INTO servico_conta_degradada
      (jogador_id, servico_id, referencia, valor_esperado_centavos, vencimento, estado, criado_em, atualizado_em)
      VALUES (1, 99, '2026-09', 5000, '2026-09-10', 'pendente', ?, ?)`).run(agora, agora);
    banco.exec('DROP TABLE servico_conta');
    banco.exec('ALTER TABLE servico_conta_degradada RENAME TO servico_conta');

    const resultado = aplicarMigracoes(banco, MIGRACOES);
    assert.deepEqual(resultado.aplicadas.map((m) => m.versao), [14, 15], 'a v015 não explode com órfão');
    assert.equal(versaoAtual(banco), 15);
    // A linha órfã é preservada: a migração não inventa serviço nem apaga conta.
    assert.equal(banco.prepare('SELECT COUNT(*) AS n FROM servico_conta').get().n, 1);
    assert.ok(
      banco.prepare("SELECT 1 AS e FROM sqlite_master WHERE type = 'table' AND name = 'servico'").get(),
      'a tabela servico existe — a aplicação abre',
    );
  } finally {
    fecharConexao(banco);
  }
});

test('migração 015: banco íntegro não é tocado (nenhuma reconstrução, nenhum dado perdido)', () => {
  const banco = abrirConexao({ caminho: ':memory:' });
  try {
    aplicarMigracoes(banco, MIGRACOES);
    const antes = banco
      .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'servico_conta'")
      .get().sql;
    const agora = new Date().toISOString();
    banco.prepare('INSERT INTO jogador (nome, criado_em) VALUES (?, ?)').run('Ana', agora);
    banco.prepare(`INSERT INTO servico (jogador_id, nome, categoria, valor_esperado_centavos, estado, criado_em, atualizado_em)
      VALUES (1, 'Internet', 'contas', 5000, 'ativo', ?, ?)`).run(agora, agora);
    banco.prepare(`INSERT INTO servico_conta
      (jogador_id, servico_id, referencia, valor_esperado_centavos, vencimento, estado, criado_em, atualizado_em)
      VALUES (1, 1, '2026-09', 5000, '2026-09-10', 'pendente', ?, ?)`).run(agora, agora);

    // Segunda passagem: a v015 é idempotente e não reconstrói nada.
    const resultado = aplicarMigracoes(banco, MIGRACOES);
    assert.deepEqual(resultado.aplicadas, [], 'nada roda em um banco já completo');
    assert.deepEqual(resultado.divergencias, [], 'sem divergências em um banco íntegro');
    const depois = banco
      .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'servico_conta'")
      .get().sql;
    assert.equal(depois, antes, 'a tabela não pode ser reconstruída à toa');
    assert.equal(banco.prepare('SELECT COUNT(*) AS n FROM servico').get().n, 1, 'o serviço do usuário permanece');
    assert.equal(banco.prepare('SELECT COUNT(*) AS n FROM servico_conta').get().n, 1, 'a conta do usuário permanece');
  } finally {
    fecharConexao(banco);
  }
});

test('migração 015: aponta a divergência quando uma migração aplicada foi reescrita depois', () => {
  const banco = abrirConexao({ caminho: ':memory:' });
  try {
    aplicarMigracoes(banco, MIGRACOES.slice(0, 14));
    // A v010 foi reescrita em "criar-tabela-servico" depois de ter rodado como
    // "criar-tabelas-despesas-recorrentes". O número não muda — o nome muda.
    banco.prepare('UPDATE schema_migrations SET nome = ? WHERE versao = 10').run('criar-tabelas-despesas-recorrentes');

    const resultado = aplicarMigracoes(banco, MIGRACOES);
    assert.deepEqual(resultado.divergencias, [
      { versao: 10, nomeNoBanco: 'criar-tabelas-despesas-recorrentes', nomeNoCodigo: 'criar-tabela-servico' },
    ]);
    // Reportar não pode virar bloquear: a aplicação precisa abrir.
    assert.equal(versaoAtual(banco), 15);
    assert.ok(
      banco.prepare("SELECT 1 AS e FROM sqlite_master WHERE type = 'table' AND name = 'servico'").get(),
      'e a tabela ausente é recriada assim mesmo',
    );
  } finally {
    fecharConexao(banco);
  }
});


