/**
 * Testes unitários — camada de interface compartilhada (Fase 16 — Polimento)
 *
 * `js/ui.js` roda no renderer (sem DOM no runner), então os testes atacam
 * o CONTRATO que a interface precisa cumprir, e não a implementação:
 *
 *  1. todo `.aviso` do HTML é escrito de forma tipada — é o que garante que
 *     nenhum erro volte a aparecer como mensagem neutra;
 *  2. os componentes de estado existem no CSS e nenhum ficou órfão;
 *  3. todo `id` referenciado pelo JS existe no HTML;
 *  4. a identidade visual permanece preto / vermelho / cinza / branco.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const dirRenderer = join(raiz, 'src', 'renderer');
const html = readFileSync(join(dirRenderer, 'index.html'), 'utf-8');
const css = ['base', 'componentes', 'principal']
  .map((n) => readFileSync(join(dirRenderer, 'css', `${n}.css`), 'utf-8'))
  .join('\n');
const ui = readFileSync(join(dirRenderer, 'js', 'ui.js'), 'utf-8');

const scriptsRenderer = readdirSync(join(dirRenderer, 'js'))
  .filter((n) => n.endsWith('.js') && n !== 'ui.js')
  .map((n) => ({
    nome: n,
    fonte: readFileSync(join(dirRenderer, 'js', n), 'utf-8'),
  }));

// ---- 1. Todo feedback é escrito de forma tipada ----

test('todo .aviso do HTML é escrito por avisar() ou limparAviso()', () => {
  const idsAviso = [...html.matchAll(/<p class="aviso[^"]*" id="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(idsAviso.length > 0, 'o HTML deveria declarar elementos .aviso');

  for (const id of idsAviso) {
    const escrito = scriptsRenderer.some(({ fonte }) =>
      /avisar\([^,]*aviso[A-Za-z]*/.test(fonte) && new RegExp(`${id}\\b`).test(fonte));
    assert.ok(escrito, `o aviso #${id} nunca é escrito por __pulsoUI.avisar()`);
  }
});

test('nenhum módulo escreve .aviso direto (perderia a tipagem)', () => {
  for (const { nome, fonte } of scriptsRenderer) {
    const direto = fonte
      .split('\n')
      .filter((l) => /aviso[A-Za-z]*\.textContent\s*=/.test(l));
    assert.deepEqual(direto, [], `${nome} escreve .textContent em .aviso: ${direto.join(' | ')}`);
  }
});

test('todo aviso recebe uma classe de tipo conhecida', () => {
  const tipos = new Set();
  for (const { fonte } of scriptsRenderer) {
    for (const m of fonte.matchAll(/avisar\([^,]+,[^,]+,\s*'([a-z]+)'\)/g)) tipos.add(m[1]);
  }
  for (const t of tipos) {
    assert.match(t, /^(erro|sucesso|atencao|info)$/, `tipo de aviso desconhecido: ${t}`);
  }
  assert.ok(tipos.has('erro'), 'deveria existir pelo menos um aviso de erro');
  assert.ok(tipos.has('sucesso'), 'deveria existir pelo menos um aviso de sucesso');
});

// ---- 2. Componentes: classes existem e não ficam órfãs ----

test('os componentes de interface estão declarados no CSS', () => {
  for (const classe of [
    'botao-primario', 'botao-secundario', 'botao-perigo', 'botao-icone',
    'aviso', 'estado-vazio', 'dialogo-fundo', 'dialogo-painel', 'dica-campo',
    'filtros-extras', 'tabular',
  ]) {
    assert.match(css, new RegExp(`\\.${classe}\\b`), `classe ausente no CSS: .${classe}`);
  }
});

test('todo componente do CSS é usado em alguma tela (sem CSS órfão)', () => {
  const uso = html + scriptsRenderer.map((s) => s.fonte).join('\n') + ui;
  for (const classe of [
    'botao-primario', 'botao-secundario', 'botao-perigo', 'botao-icone',
    'estado-vazio', 'dialogo-fundo', 'dica-campo', 'filtros-extras', 'tabular',
  ]) {
    assert.ok(uso.includes(classe), `classe definida no CSS mas nunca usada: .${classe}`);
  }
});

test('a regra .armed e a função armar() não sobreviveram à unificação', () => {
  // A confirmação passou a ser o diálogo; o estado "armado" ficou sem uso.
  assert.doesNotMatch(css, /\.armed\b/, 'a regra .botao-perigo.armed deve ter sido removida');
  assert.doesNotMatch(ui, /function armar\(/, 'armar() deve ter sido removida');
});

test('nenhuma regra de estado vazio antigo sobreviveu no CSS', () => {
  // `.missoes-vazio` e `.dash-vazio` foram substituídos por `.estado-vazio`.
  // Restos delas passariam despercebidos justamente porque não quebram nada.
  for (const cssArquivo of ['base', 'componentes', 'principal']) {
    const fonte = readFileSync(join(dirRenderer, 'css', `${cssArquivo}.css`), 'utf-8');
    for (const classe of ['missoes-vazio', 'dash-vazio']) {
      assert.doesNotMatch(
        fonte,
        new RegExp(`^\\.${classe}\\b`, 'm'),
        `css/${cssArquivo}.css ainda define .${classe} (substituída por .estado-vazio)`,
      );
    }
  }
});

// ---- 3. Integridade entre HTML, CSS e JS ----

test('todo id consultado pelo JS existe no HTML', () => {
  const ids = new Set([...html.matchAll(/id="([^"]+)"/g)].map((m) => m[1]));
  const faltando = [];
  for (const { nome, fonte } of scriptsRenderer) {
    for (const m of fonte.matchAll(/consultar(?:Elemento\w+)?\(\s*'([^']+)'/g)) {
      if (!ids.has(m[1])) faltando.push(`${nome}: #${m[1]}`);
    }
  }
  assert.deepEqual(faltando, [], `ids consultados e inexistentes: ${faltando.join(', ')}`);
});

test('não há id duplicado no HTML', () => {
  const vistos = new Set();
  const duplicados = [];
  for (const m of html.matchAll(/id="([^"]+)"/g)) {
    if (vistos.has(m[1])) duplicados.push(m[1]);
    vistos.add(m[1]);
  }
  assert.deepEqual(duplicados, [], `ids duplicados: ${duplicados.join(', ')}`);
});

test('todo campo de formulário tem label associado', () => {
  const campos = [...html.matchAll(/<(input|select|textarea)\b[^>]*>/g)]
    .map((m) => m[0])
    .filter((tag) => !tag.includes('type="hidden"'));
  for (const tag of campos) {
    const id = tag.match(/id="([^"]+)"/)?.[1];
    if (!id) continue; // campo sem id não é alcançável por label
    const temLabel = html.includes(`<label for="${id}"`) || tag.includes('aria-label');
    assert.ok(temLabel, `campo sem label associado: #${id}`);
  }
});

test('as referências ARIA apontam para elementos existentes', () => {
  const ids = new Set([...html.matchAll(/id="([^"]+)"/g)].map((m) => m[1]));
  for (const m of html.matchAll(/aria-(?:describedby|labelledby)="([^"]+)"/g)) {
    for (const ref of m[1].split(/\s+/)) {
      assert.ok(ids.has(ref), `aria-describedby aponta para id inexistente: ${ref}`);
    }
  }
});


// ---- 4. Ações destrutivas e acessibilidade ----

test('toda ação destrutiva pede confirmação antes de agir', () => {
  // Ações que removem ou encerram dados: precisam do diálogo, e a
  // confirmação tem que vir ANTES da chamada ao núcleo — caso contrário,
  // "cancelar" executaria a ação mesmo assim.
  const funcoes = scriptsRenderer
    .flatMap(({ nome, fonte }) =>
      [...fonte.matchAll(/async function (\w*(?:excluir|cancelar|arquivar)\w*)\(\w*\)\s*\{([\s\S]*?)\n\}/g)]
        .map((m) => ({ nome: `${nome}:${m[1]}`, corpo: m[2] })));

  assert.ok(funcoes.length > 0, 'deveria haver funções destrutivas');
  for (const { nome, corpo } of funcoes) {
    assert.ok(/__pulsoUI\.confirmar\(/.test(corpo), `${nome} executa sem confirmação`);
    const iConfirma = corpo.indexOf('__pulsoUI.confirmar(');
    // Qualquer chamada que vá ao núcleo: `await ponteX().algo()`,
    // `await window.pulso.x.y()`, `await carregarX()`.
    const iChamada = corpo.search(/await\s+(?:ponte\w*\(\)|window\.pulso\w*\.|carregar\w+\()/);
    assert.ok(
      iChamada !== -1 && iConfirma < iChamada,
      `${nome} chama o núcleo antes de pedir confirmação (cancelar executaria a ação)`,
    );
  }
});

test('o diálogo de confirmação é acessível por teclado', () => {
  assert.match(ui, /'role',\s*'dialog'/, 'o diálogo precisa de role="dialog"');
  assert.match(ui, /'aria-modal',\s*'true'/, 'o diálogo precisa de aria-modal');
  assert.match(ui, /aria-labelledby/, 'o diálogo precisa de aria-labelledby');
  assert.match(ui, /'Escape'/, 'Esc precisa cancelar a confirmação');
  // O foco abre em CANCELAR: evita confirmar com Enter sem querer.
  assert.match(ui, /cancelar\.focus\(\)/, 'o foco inicial deve ser o botão cancelar');
});

test('a interface mantém a identidade cyberpunk em pt-BR', () => {
  assert.match(html, /<html lang="pt-BR">/, 'a interface deve estar em pt-BR');
  // Nenhuma cor fora da paleta definida em docs/identidade-visual.md.
  // Exceção: `#000` dentro de `mask-image` não é cor pintada, é o canal
  // alfa do gradiente que esmaece a grade do fundo.
  const paleta = ['#0b0b0d', '#131318', '#1c1c23', '#e5484d', '#ff6b70',
    '#7f1d1d', '#8a8a93', '#5f5f69', '#3a3a42', '#f2f2f5'];
  for (const m of css.matchAll(/#[0-9a-fA-F]{3,8}\b/g)) {
    const cor = m[0].toLowerCase();
    const expandida = cor.length === 4
      ? `#${cor[1]}${cor[1]}${cor[2]}${cor[2]}${cor[3]}${cor[3]}`
      : cor;
    const emMascara = css.slice(0, m.index).lastIndexOf('mask-image', m.index) > -1
      && css.indexOf(';', css.lastIndexOf('mask-image', m.index)) > m.index;
    if (emMascara) continue;
    assert.ok(
      paleta.some((p) => p === cor || p === expandida),
      `cor fora da paleta: ${cor}`,
    );
  }
});

test('estados vazios explicam o próximo passo', () => {
  // Nenhum texto cru do tipo "Nenhum X encontrado." sobrevive: todos os
  // estados vazios passam pelo helper, com título e próximo passo.
  for (const { nome, fonte } of scriptsRenderer) {
    const cru = fonte.match(/textContent = ["']Nenhum[^"']*\.|textContent = ["']Nenh[^"']*\./g);
    assert.equal(cru, null, `${nome} ainda tem estado vazio sem próximo passo: ${cru}`);
  }
});
