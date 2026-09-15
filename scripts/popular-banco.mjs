#!/usr/bin/env node
/**
 * PULSO — Povoamento de dados de exemplo (campanha "Alice / Nyx")
 *
 * Cria um banco de demonstração exercitando o máximo possível do que já está
 * implementado (Fases 03–09): identidade, status, progressão, missões,
 * projetos, finanças e loja/lista de desejos. Tudo passa pela camada de
 * aplicação (serviços) — nunca por SQL direto — para que o povoamento use
 * exatamente as mesmas regras que a interface usa.
 *
 * Uso (o núcleo depende de `node:sqlite`, ausente no Node 20 do sistema):
 *
 *   npm run popular-banco                 # banco real do PULSO (fora do repositório)
 *   npm run popular-banco -- --recriar     # apaga o banco de exemplo e recria
 *   npm run popular-banco -- --diretorio /tmp/pulso-demo
 *
 * Alternativa sem npm:
 *   ELECTRON_RUN_AS_NODE=1 npx electron scripts/popular-banco.mjs
 *
 * Regras respeitadas (docs/*.md):
 * - dados fictícios, inspirados na identidade criativa do usuário;
 * - nenhum dado pessoal real, senha, token ou caminho pessoal versionado;
 * - determinístico: datas fixas, sem rede e sem aleatoriedade;
 * - o banco do usuário NUNCA é sobrescrito sem `--recriar` explícito.
 */

import { existsSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { inicializarBanco, NOME_ARQUIVO_BANCO } from '../src/core/database/inicializar.js';
import { RepositorioJogador } from '../src/core/database/repositorios/jogador.js';
import { RepositorioStatus } from '../src/core/database/repositorios/status.js';
import { RepositorioMissao } from '../src/core/database/repositorios/missao.js';
import { RepositorioProjeto } from '../src/core/database/repositorios/projeto.js';
import { RepositorioProgressao } from '../src/core/database/repositorios/progressao.js';
import { RepositorioAtributos } from '../src/core/database/repositorios/atributos.js';
import { RepositorioCarteira } from '../src/core/database/repositorios/carteira.js';
import { RepositorioTransacao } from '../src/core/database/repositorios/transacao.js';
import { RepositorioOrcamento } from '../src/core/database/repositorios/orcamento.js';
import { RepositorioDesejo } from '../src/core/database/repositorios/desejo.js';
import { ServicoJogador } from '../src/core/aplicacao/servico-jogador.js';
import { ServicoStatus } from '../src/core/aplicacao/servico-status.js';
import { ServicoMissao } from '../src/core/aplicacao/servico-missao.js';
import { ServicoProjeto } from '../src/core/aplicacao/servico-projeto.js';
import { ServicoProgressao } from '../src/core/aplicacao/servico-progressao.js';
import { ServicoFinanca } from '../src/core/aplicacao/servico-financa.js';
import { ServicoLoja } from '../src/core/aplicacao/servico-loja.js';

/** Pasta de dados padrão do PULSO — mesma resolução do processo principal. */
function diretorioDadosPadrao() {
  if (process.env.PULSO_DIRETORIO_DADOS) return process.env.PULSO_DIRETORIO_DADOS;
  if (process.platform === 'win32') return join(process.env.APPDATA ?? homedir(), 'pulso');
  if (process.platform === 'darwin') {
    return join(homedir(), 'Library', 'Application Support', 'pulso');
  }
  return join(process.env.XDG_CONFIG_HOME || join(homedir(), '.config'), 'pulso');
}

/** Lê os argumentos de linha de comando (sem dependências). */
function lerArgumentos(argv) {
  const opcoes = { diretorio: null, recriar: false, ajuda: false };
  for (let indice = 0; indice < argv.length; indice += 1) {
    const argumento = argv[indice];
    if (argumento === '--recriar') opcoes.recriar = true;
    else if (argumento === '--ajuda' || argumento === '-h') opcoes.ajuda = true;
    else if (argumento === '--diretorio') opcoes.diretorio = argv[++indice] ?? null;
    else if (argumento.startsWith('--diretorio=')) opcoes.diretorio = argumento.split('=')[1];
    else throw new Error(`Argumento desconhecido: "${argumento}". Use --ajuda para ver as opções.`);
  }
  return opcoes;
}

const AJUDA = `
PULSO — povoamento de dados de exemplo (Alice / Nyx)

  --diretorio <caminho>  pasta de dados (padrão: banco real do PULSO)
  --recriar              apaga pulso.db/-wal/-shm e recria do zero
  --ajuda, -h            mostra esta ajuda

Exemplos:
  npm run popular-banco
  npm run popular-banco -- --recriar
  npm run popular-banco -- --diretorio /tmp/pulso-demo
`;

/**
 * Monta os serviços da aplicação sobre a conexão, na mesma ordem do
 * processo principal (src/main/main.js) — o povoamento passa pelas MESMAS
 * regras que a interface usa, nunca por SQL direto.
 */
function criarServicos(banco) {
  const repositorioJogador = new RepositorioJogador(banco);
  const repositorioMissao = new RepositorioMissao(banco);

  const servicoStatus = new ServicoStatus({
    repositorio: new RepositorioStatus(banco),
    repositorioJogador,
  });
  const servicoProgressao = new ServicoProgressao({
    repositorioProgressao: new RepositorioProgressao(banco),
    repositorioAtributos: new RepositorioAtributos(banco),
    repositorioJogador,
    banco,
  });
  const servicoFinanca = new ServicoFinanca({
    repositorioCarteira: new RepositorioCarteira(banco),
    repositorioTransacao: new RepositorioTransacao(banco),
    repositorioOrcamento: new RepositorioOrcamento(banco),
    repositorioJogador,
  });
  // A identidade nasce junto com status + progressão + carteira (transação).
  const servicoJogador = new ServicoJogador({
    repositorio: repositorioJogador,
    banco,
    aoCriar: (jogador) => {
      servicoStatus.criarInicial(jogador.id);
      servicoProgressao.criarInicial(jogador.id);
      servicoFinanca.criarCarteiraInicial(jogador.id);
    },
  });
  const servicoMissao = new ServicoMissao({ repositorio: repositorioMissao });
  const servicoProjeto = new ServicoProjeto({
    repositorio: new RepositorioProjeto(banco),
    repositorioMissao,
    repositorioJogador,
  });
  const servicoLoja = new ServicoLoja({
    repositorio: new RepositorioDesejo(banco),
    repositorioJogador,
    servicoFinanca,
    banco,
  });

  return {
    repositorioJogador,
    servicoJogador,
    servicoStatus,
    servicoProgressao,
    servicoMissao,
    servicoProjeto,
    servicoFinanca,
    servicoLoja,
  };
}

/** Cria uma missão e aplica as transições pedidas, na ordem correta. */
function criarMissao(servicoMissao, jogadorId, dados, transicoes = []) {
  let missao = servicoMissao.criar(jogadorId, dados);
  for (const acao of transicoes) {
    missao = servicoMissao[acao](missao.id);
  }
  return missao;
}

// ── Datas fixas da campanha (determinismo; o "agora" do sistema não importa) ──
const PRAZO_FUTURO = '2026-10-31T23:59:00.000Z';
const PRAZO_BREVE = '2026-10-05T18:00:00.000Z';
const PRAZO_ATRASADO = '2026-08-20T12:00:00.000Z';
const PRAZO_PROJETO_ATRASADO = '2026-09-01T12:00:00.000Z';
const PRAZO_PROJETO_CONCLUIDO = '2026-08-30T12:00:00.000Z';

/**
 * Identidade, status e progressão — a raiz à qual tudo se relaciona.
 * @returns {object} jogador criado
 */
function popularIdentidade({ servicoJogador, servicoStatus, servicoProgressao }) {
  const jogador = servicoJogador.criar({ nome: 'Alice', codinome: 'Nyx' });

  // Estado operacional de um dia real de trabalho criativo. O domínio parte
  // de energia/foco/criatividade = 100 e estresse = 0 e aplica deltas (0–100).
  servicoStatus.alterar(jogador.id, 'energia', -28); // 100 → 72
  servicoStatus.alterar(jogador.id, 'foco', -42); // 100 → 58
  servicoStatus.alterar(jogador.id, 'criatividade', -9); // 100 → 91
  servicoStatus.alterar(jogador.id, 'estresse', 34); // 0 → 34

  // Curva de XP da Fase 06 (100 × nível): 2450 XP → nível 7.
  // São 6 pontos conquistados; 5 distribuídos e 1 permanece disponível.
  servicoProgressao.adicionarXp(jogador.id, 2450);
  servicoProgressao.aumentarAtributo(jogador.id, 'tecnologia', 2);
  servicoProgressao.aumentarAtributo(jogador.id, 'criatividade', 1);
  servicoProgressao.aumentarAtributo(jogador.id, 'musica', 1);
  servicoProgressao.aumentarAtributo(jogador.id, 'foco', 1);

  return jogador;
}

/**
 * Projetos e missões (Fases 05 e 07): direções com progresso variado,
 * missões em todos os estados, prioridades e prazos — inclusive atrasadas.
 */
function popularProjetosEMissoes({ servicoProjeto, servicoMissao }, jogadorId) {
  const projetos = [
    {
      descricao: 'Consolidar o núcleo do PULSO até a loja e preparar a Fase 10.',
      projeto: { titulo: 'Protocolo Pulso', prioridade: 'alta', prazo: PRAZO_FUTURO },
      acoes: ['iniciar'],
      missoes: [
        {
          titulo: 'Fechar o schema v9 e revisar as migrações',
          descricao: 'Conferir que a conciliação da progressão é no-op em banco novo.',
          prioridade: 'alta',
          transicoes: ['iniciar', 'concluir'],
        },
        {
          titulo: 'Cobrir loja e finanças com testes de integração',
          descricao: 'Compra atômica, rollback e orçamento estourado no banco real.',
          prioridade: 'normal',
          transicoes: ['iniciar', 'concluir'],
        },
        {
          titulo: 'Documentar o motor de compra atômica',
          descricao: 'Explicar por que a Loja não tem carteira própria.',
          prioridade: 'normal',
          transicoes: ['iniciar'],
        },
        { titulo: 'Auditar as pendências das fases 06 a 09', prioridade: 'baixa' },
      ],
    },
    {
      descricao: 'Baralho autoral de 22 arcanos em arte digital preto e vermelho.',
      projeto: { titulo: 'Neon Moon Tarot', prioridade: 'critica', prazo: PRAZO_PROJETO_ATRASADO },
      acoes: ['iniciar'],
      missoes: [
        {
          titulo: 'Estudar os 22 arcanos maiores',
          prioridade: 'alta',
          transicoes: ['iniciar', 'concluir'],
        },
        {
          titulo: 'Ilustrar a carta A Estrela',
          descricao: 'Linha neon, sombra pesada, sem medo do contraste.',
          prioridade: 'critica',
          transicoes: ['iniciar'],
        },
        { titulo: 'Fechar o baralho completo', prioridade: 'alta', prazo: PRAZO_FUTURO },
      ],
    },
    {
      descricao: 'Transformar o quarto em um lugar de criação e gravação.',
      projeto: { titulo: 'Estúdio em Casa', prioridade: 'normal' },
      acoes: [],
      missoes: [],
    },
    // Demais projetos: concluído, cancelado e arquivado.
    {
      descricao: 'Trocar o sistema da máquina principal sem perder histórico.',
      projeto: {
        titulo: 'Migração do Mainframe',
        prioridade: 'alta',
        prazo: PRAZO_PROJETO_CONCLUIDO,
      },
      acoes: ['iniciar', 'concluir'],
      missoes: [
        {
          titulo: 'Salvar os dados antes de formatar',
          prioridade: 'critica',
          transicoes: ['iniciar', 'concluir'],
        },
        {
          titulo: 'Instalar a distro e os drivers',
          prioridade: 'alta',
          transicoes: ['iniciar', 'concluir'],
        },
        {
          titulo: 'Restaurar backups e configurações',
          prioridade: 'normal',
          transicoes: ['iniciar', 'concluir'],
        },
      ],
    },
    {
      descricao: 'Viagem que nunca saiu do papel — cancelada sem drama.',
      projeto: { titulo: 'Liberdade Cruel', prioridade: 'baixa' },
      acoes: ['cancelar'],
      missoes: [
        {
          titulo: 'Pesquisar preços de mochila de trilha',
          prioridade: 'baixa',
          transicoes: ['iniciar', 'concluir'],
        },
        { titulo: 'Planejar rota pela costa', prioridade: 'normal', transicoes: ['cancelar'] },
      ],
    },
    {
      descricao: 'Zine de arte e texto — concluído, impresso e arquivado.',
      projeto: { titulo: 'Zine das Sombras', prioridade: 'normal' },
      acoes: ['iniciar', 'concluir', 'arquivar'],
      missoes: [
        {
          titulo: 'Diagramar as 12 páginas do zine',
          descricao: 'Fonte mono, margem generosa, tinta preta e um detalhe vermelho.',
          prioridade: 'normal',
          transicoes: ['iniciar', 'concluir'],
        },
      ],
    },
  ];

  const missoesSemProjeto = [
    // Missões sem projeto — todos os estados, prioridades e prazos.
    { titulo: 'Configurar tema escuro e fonte mono no editor', prioridade: 'baixa' },
    {
      titulo: 'Escrever um post sobre o PULSO',
      descricao: 'Mostrar a tela financeira e explicar por que o saldo é derivado.',
      prioridade: 'normal',
      prazo: PRAZO_BREVE,
    },
    {
      titulo: 'Resolver a permissão de escrita no SSD externo',
      descricao: 'O ponto de montagem muda a cada reinício — suspeita de fstab.',
      prioridade: 'alta',
      prazo: PRAZO_ATRASADO,
    },
    {
      titulo: 'Fechar as notas fiscais de agosto',
      descricao: 'Atrasado e ainda na lista — mas ninguém está esperando.',
      prioridade: 'normal',
      prazo: PRAZO_ATRASADO,
    },
    {
      titulo: 'Praticar teclado — escala menor natural',
      prioridade: 'normal',
      prazo: PRAZO_ATRASADO,
      transicoes: ['iniciar'],
    },
    {
      titulo: 'Organizar samples e plugins do Ardour',
      prioridade: 'baixa',
      transicoes: ['iniciar'],
    },
    {
      titulo: 'Backup do diretório de configurações',
      prioridade: 'alta',
      transicoes: ['iniciar', 'concluir'],
    },
    {
      titulo: 'Assistir à aula de redes neurais',
      descricao: 'Anotar só o que serve para o Pulso — o resto é ruído.',
      prioridade: 'normal',
      prazo: PRAZO_ATRASADO,
      transicoes: ['iniciar', 'concluir'],
    },
    { titulo: 'Comprar cabo HDMI de reserva', prioridade: 'baixa', transicoes: ['cancelar'] },
    {
      titulo: 'Testar uma distro alternativa no pendrive',
      prioridade: 'normal',
      transicoes: ['iniciar', 'cancelar'],
    },
  ];

  const contagem = { projetos: 0, missoes: 0 };

  for (const definicao of projetos) {
    let projeto = servicoProjeto.criar(jogadorId, {
      ...definicao.projeto,
      descricao: definicao.descricao,
    });
    for (const acao of definicao.acoes) {
      projeto = servicoProjeto[acao](projeto.id);
    }
    contagem.projetos += 1;
    for (const missao of definicao.missoes) {
      const criada = criarMissao(servicoMissao, jogadorId, missao, missao.transicoes);
      servicoProjeto.associarMissao(projeto.id, criada.id);
      contagem.missoes += 1;
    }
  }

  for (const missao of missoesSemProjeto) {
    criarMissao(servicoMissao, jogadorId, missao, missao.transicoes);
    contagem.missoes += 1;
  }

  return contagem;
}

/**
 * Finanças (Fase 08): todas as categorias de receita e de despesa, valores
 * pequenos e grandes, transações com e sem descrição, e orçamentos em
 * situações diferentes (com folga, quase no limite e estourado).
 */
function popularFinancas({ servicoFinanca }, jogadorId) {
  const receitas = [
    { categoria: 'salario', valorCentavos: 420000, data: '2026-09-05', descricao: 'Contrato de design — pagamento mensal' },
    { categoria: 'freelance', valorCentavos: 185000, data: '2026-09-08', descricao: 'Identidade visual para um selo musical' },
    { categoria: 'missao', valorCentavos: 30000, data: '2026-08-22', descricao: 'Manutenção do notebook de outra pessoa' },
    { categoria: 'venda', valorCentavos: 25000, data: '2026-08-15', descricao: 'Mesa digitalizadora antiga' },
    { categoria: 'reembolso', valorCentavos: 8990, data: '2026-09-10', descricao: 'Frete devolvido de um pedido cancelado' },
    { categoria: 'saldo_inicial', valorCentavos: 100000, data: '2026-07-01', descricao: 'Saldo inicial importado do caderno' },
    { categoria: 'outra_receita', valorCentavos: 12000, data: '2026-09-12' },
  ];

  const despesas = [
    { categoria: 'alimentacao', valorCentavos: 3850, data: '2026-09-03', descricao: 'Mercado da semana' },
    { categoria: 'alimentacao', valorCentavos: 450, data: '2026-09-11' },
    { categoria: 'transporte', valorCentavos: 2200, data: '2026-09-06', descricao: 'Passagem para o centro' },
    { categoria: 'moradia', valorCentavos: 120000, data: '2026-09-01', descricao: 'Aluguel de setembro' },
    { categoria: 'contas', valorCentavos: 18990, data: '2026-09-07', descricao: 'Internet e luz' },
    { categoria: 'assinaturas', valorCentavos: 3490, data: '2026-09-02', descricao: 'Streaming de música' },
    { categoria: 'lazer', valorCentavos: 6000, data: '2026-09-09', descricao: 'Ingresso de show local' },
    { categoria: 'tecnologia', valorCentavos: 28900, data: '2026-09-04', descricao: 'Teclado mecânico usado' },
    { categoria: 'musica', valorCentavos: 12000, data: '2026-08-28', descricao: 'Cordas novas para o baixo' },
    { categoria: 'saude', valorCentavos: 7500, data: '2026-09-13', descricao: 'Consulta de rotina' },
    { categoria: 'educacao', valorCentavos: 4990, data: '2026-08-30', descricao: 'Curso de shaders' },
    { categoria: 'compras', valorCentavos: 8990, data: '2026-09-12', descricao: 'Tinta para a impressora' },
    { categoria: 'outra_despesa', valorCentavos: 1500, data: '2026-08-18' },
  ];

  for (const receita of receitas) {
    servicoFinanca.criarTransacao(jogadorId, { tipo: 'receita', ...receita });
  }
  for (const despesa of despesas) {
    servicoFinanca.criarTransacao(jogadorId, { tipo: 'despesa', ...despesa });
  }

  const orcamentos = [
    // Orçamentos por categoria — um deles estoura de propósito.
    // Estoura de propósito: a compra de tecnologia (Loja) soma à despesa direta.
    {
      categoria: 'tecnologia',
      nome: 'Hardware e periféricos',
      valorCentavos: 30000,
      inicio: '2026-09-01',
      fim: '2026-09-30',
    },
    {
      categoria: 'alimentacao',
      nome: 'Mercado do mês',
      valorCentavos: 50000,
      inicio: '2026-09-01',
      fim: '2026-09-30',
    },
    { categoria: 'assinaturas', valorCentavos: 6000, inicio: '2026-09-01', fim: '2026-09-30' },
    {
      categoria: 'lazer',
      nome: 'Shows e diversão',
      valorCentavos: 20000,
      inicio: '2026-09-01',
      fim: '2026-09-30',
    },
    {
      categoria: 'musica',
      nome: 'Equipamento de som',
      valorCentavos: 60000,
      inicio: '2026-09-01',
      fim: '2026-09-30',
    },
    {
      categoria: 'educacao',
      nome: 'Cursos e livros',
      valorCentavos: 10000,
      inicio: '2026-09-01',
      fim: '2026-09-30',
    },
    // Período anterior, sem gasto na categoria — mostra o recorte por período.
    {
      categoria: 'moradia',
      nome: 'Aluguel (mês anterior)',
      valorCentavos: 120000,
      inicio: '2026-08-01',
      fim: '2026-08-31',
    },
  ];

  for (const orcamento of orcamentos) {
    servicoFinanca.criarOrcamento(jogadorId, orcamento);
  }

  return { receitas: receitas.length, despesas: despesas.length, orcamentos: orcamentos.length };
}

/**
 * Loja / Lista de Desejos (Fase 09): os cinco estados da máquina, as
 * categorias de item, economia e gasto acima do esperado. Cada compra vira
 * uma despesa de verdade no motor financeiro (Fase 08) de forma atômica.
 */
function popularLoja({ servicoLoja }, jogadorId) {
  const desejos = [
    {
      titulo: 'SSD NVMe 2 TB',
      descricao: 'Espaço para os projetos de arte e para os samples sem culpa.',
      categoria: 'tecnologia',
      prioridade: 'alta',
      precoEsperado: 64900,
      estado: 'planejado',
    },
    {
      titulo: 'Fone de referência',
      descricao: 'Para mixar sem mentir para mim mesma.',
      categoria: 'musica',
      prioridade: 'critica',
      precoEsperado: 34900,
      estado: 'comprado',
      compra: { precoFinal: 39900, data: '2026-09-12', observacao: 'O dólar subiu, mas o ouvido agradece.' },
    },
    {
      titulo: 'Mesa digitalizadora usada',
      categoria: 'trabalho',
      prioridade: 'normal',
      precoEsperado: 45000,
      estado: 'comprado',
      compra: { precoFinal: 42000, data: '2026-09-06', observacao: 'Achada em bom estado, com dois anos de uso.' },
    },
    {
      titulo: 'Webcam Full HD',
      descricao: 'Gravar vídeo sem parecer um retrato de 2009.',
      categoria: 'tecnologia',
      prioridade: 'normal',
      precoEsperado: 29900,
      estado: 'comprado',
      compra: { precoFinal: 33900, data: '2026-09-07', observacao: 'Saiu mais caro, mas grava em 1080p.' },
    },
    {
      titulo: 'Pack de shaders para o Blender',
      categoria: 'educacao',
      prioridade: 'baixa',
      precoEsperado: 4990,
      estado: 'comprado',
      compra: { precoFinal: 3990, data: '2026-09-09' },
    },
    {
      titulo: 'Jaqueta de couro sintético',
      descricao: 'Preta, com costura vermelha — combina com o resto do setup.',
      categoria: 'vestuario',
      prioridade: 'alta',
      precoEsperado: 25000,
      estado: 'comprado',
      compra: { precoFinal: 26000, data: '2026-09-11', observacao: 'Ficou melhor do que o esperado.' },
    },
    {
      titulo: 'Pedaleira de efeitos',
      categoria: 'hobby',
      prioridade: 'normal',
      precoEsperado: 12000,
      estado: 'comprado',
      compra: { precoFinal: 12000, data: '2026-09-13', observacao: 'Preço justo, zero diferença.' },
    },
    // Demais desejos: cancelado, em análise, desejado e planejado.
    {
      titulo: 'Suporte articulado para o monitor',
      categoria: 'casa',
      prioridade: 'baixa',
      precoEsperado: 8900,
      estado: 'cancelado',
    },
    {
      titulo: 'Curso de síntese modular',
      descricao: 'Do oscilador ao patch completo — sem pular a teoria.',
      categoria: 'musica',
      prioridade: 'alta',
      precoEsperado: 19900,
      estado: 'em_analise',
    },
    {
      titulo: 'Capacete novo',
      categoria: 'transporte',
      prioridade: 'critica',
      precoEsperado: 32000,
      estado: 'desejado',
    },
    {
      titulo: 'Teclado MIDI de 49 teclas',
      categoria: 'musica',
      prioridade: 'normal',
      precoEsperado: 55000,
      estado: 'planejado',
    },
    {
      titulo: 'Mouse sem fio leve',
      categoria: 'tecnologia',
      prioridade: 'baixa',
      precoEsperado: 15000,
      estado: 'desejado',
    },
    {
      titulo: 'Livro de redes de computadores',
      descricao: 'Para entender o que roteia antes de reclamar do provedor.',
      categoria: 'educacao',
      prioridade: 'normal',
      precoEsperado: 12000,
      estado: 'em_analise',
    },
    {
      titulo: 'Aspirador robô',
      categoria: 'casa',
      prioridade: 'baixa',
      precoEsperado: 90000,
      estado: 'desejado',
    },
    {
      titulo: 'Tênis de corrida',
      categoria: 'vestuario',
      prioridade: 'normal',
      precoEsperado: 22000,
      estado: 'cancelado',
    },
    {
      titulo: 'Cadeira de escritório decente',
      descricao: 'A lombar cobra caro por cadeira ruim.',
      categoria: 'trabalho',
      prioridade: 'alta',
      precoEsperado: 78000,
      estado: 'planejado',
    },
  ];

  let compras = 0;
  for (const item of desejos) {
    const desejo = servicoLoja.criar(jogadorId, {
      titulo: item.titulo,
      descricao: item.descricao,
      categoria: item.categoria,
      prioridade: item.prioridade,
      precoEsperado: item.precoEsperado,
    });
    if (item.estado === 'em_analise') {
      servicoLoja.analisar(desejo.id);
    } else if (item.estado === 'planejado') {
      servicoLoja.planejar(desejo.id);
    } else if (item.estado === 'cancelado') {
      servicoLoja.cancelar(desejo.id);
    } else if (item.estado === 'comprado') {
      servicoLoja.planejar(desejo.id);
      servicoLoja.comprar(desejo.id, item.compra);
      compras += 1;
    }
  }

  return { desejos: desejos.length, compras };
}

/** Executa o povoamento completo e imprime o resumo do que foi criado. */
function main() {
  const opcoes = lerArgumentos(process.argv.slice(2));
  if (opcoes.ajuda) {
    console.log(AJUDA.trim());
    return;
  }

  const diretorioDados = opcoes.diretorio ?? diretorioDadosPadrao();
  const caminhoBanco = join(diretorioDados, NOME_ARQUIVO_BANCO);

  if (opcoes.recriar) {
    for (const sufixo of ['', '-wal', '-shm']) {
      rmSync(`${caminhoBanco}${sufixo}`, { force: true });
    }
    console.log(`Banco anterior removido em ${diretorioDados}.`);
  } else if (existsSync(caminhoBanco)) {
    console.log('Banco existente detectado — o povoamento só continua se não houver jogador.');
  }

  console.log(`PULSO — povoando dados de exemplo em ${caminhoBanco}`);
  const estadoBanco = inicializarBanco({ diretorioDados });

  try {
    const servicos = criarServicos(estadoBanco.banco);
    if (servicos.repositorioJogador.existe()) {
      throw new Error(
        'Este banco já tem um jogador. Use --recriar para apagar este banco e criar o exemplo de novo.',
      );
    }

    const jogador = popularIdentidade(servicos);
    const projetos = popularProjetosEMissoes(servicos, jogador.id);
    const financas = popularFinancas(servicos, jogador.id);
    const loja = popularLoja(servicos, jogador.id);

    const progressao = servicos.servicoProgressao.obter(jogador.id);
    const carteira = servicos.servicoFinanca.obterCarteira(jogador.id);
    const totalTransacoes = financas.receitas + financas.despesas + loja.compras;

    console.log('──────────────────────────────────────────────────────');
    console.log(`Jogador ......... ${jogador.nome} "${jogador.codinome}" · nível ${progressao.nivel} · ${progressao.xpTotal} XP · ${progressao.pontosDisponiveis} ponto(s)`);
    console.log(`Projetos ........ ${projetos.projetos}`);
    console.log(`Missões ......... ${projetos.missoes}`);
    console.log(`Transações ...... ${totalTransacoes} (${financas.receitas} receitas · ${financas.despesas + loja.compras} despesas)`);
    console.log(`Orçamentos ...... ${financas.orcamentos}`);
    console.log(`Desejos ......... ${loja.desejos} (${loja.compras} comprados)`);
    console.log(`Saldo ........... R$ ${(carteira.saldo / 100).toFixed(2)} (${carteira.moeda})`);
    console.log('──────────────────────────────────────────────────────');
    console.log('Pronto. Inicie o PULSO com "npm start" para navegar pelos dados.');
  } finally {
    estadoBanco.fechar();
  }
}

try {
  main();
} catch (erro) {
  console.error(`Falha no povoamento: ${erro.message}`);
  process.exitCode = 1;
}