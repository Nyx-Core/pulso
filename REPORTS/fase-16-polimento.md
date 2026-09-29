# Relatório — FASE 16 · Polimento

**Branch:** `tarefa/fase-16-polimento`
**Princípio:** polir não é aumentar o PULSO. É fazer tudo que já existe
funcionar e parecer parte do mesmo sistema.

Nenhuma regra de negócio, entidade, tela ou fluxo novo foi criado. A fase
encontrou problemas de apresentação e de experiência **já existentes** e os
corrigiu.

---

## 1. Melhorias visuais

**Camada de componentes compartilhada.** Criada `css/componentes.css` como
casa do que é comum a todas as telas: botões (primário, secundário, perigo,
ícone), regras gerais de formulário, barra de filtros, feedback e estados
vazios. `css/base.css` passou a definir a escala única de tokens
(espaçamento, raio, alvo mínimo, cores) consumida por todos os
componentes — nenhuma cor literal fora dela.

Problema concreto corrigido: **os campos de missão, projeto, transação,
orçamento, desejo, serviço, conta, recorrência e pagamento apareciam com o
visual branco padrão do navegador dentro de uma aplicação escura.** Só
`#formulario-jogador` e três `<select>` tinham estilo próprio.

**Tipografia e leitura.** Escala base de 14px com interlinhamento 1,5,
fonte monoespaçada do sistema (offline), `color-scheme: dark` para que
calendários e listas nativas herdem o tema escuro, e barras de rolagem no
tema da aplicação.

**Estados legíveis sem depender só da cor.** Filtro ativo com fundo
vermelho e texto escuro em negrito; botões de perigo sempre textuais
("EXCLUIR", "CANCELAR") em vez de ícone; etiquetas de estado de missão e
projeto com contorno, preenchimento ou tracejado próprios.

**Números alinhados.** Valores monetários, saldos e barras de progresso com
`tabular-nums`, para os dígitos ficarem em coluna.

**Filtro financeiro sem estilo.** `filtro-categoria-financa` era o único
`<select>` de filtro fora de `.loja-filtros-extras` e saía com o visual do
navegador. A barra de filtros, usada por cinco módulos, subiu para a
camada de componentes.

---

## 2. Melhorias de UX

**Erros deixaram de parecer mensagens neutras.** O componente `.aviso` já
sabia se diferenciar em erro, sucesso e atenção, mas **nenhum dos 133 pontos
de escrita aplicava a classe**: uma falha de salvamento aparecia no mesmo
cinza de "Conta atualizada com sucesso". Todos passaram por
`__pulsoUI.avisar()`, que aplica a classe, troca o marcador e define o
papel ARIA (`alert` para erro, `status` para sucesso).

**Confirmação em toda ação destrutiva.** Seis ações executavam com um
clique, sem arrependimento possível: excluir missão, cancelar missão,
cancelar desejo, cancelar conta, arquivar serviço e arquivar recorrência.
Passam a pedir confirmação.

**Uma única maneira de confirmar.** Transação e orçamento usavam um caminho
próprio (o botão virava "CONFIRMAR EXCLUSÃO" e exigia um segundo clique, sem
dizer qual registro seria afetado). Todas as sete passam agora pelo mesmo
diálogo, que nomeia a ação, explica a consequência e mostra o registro
afetado. A confirmação ocorre **antes** de qualquer chamada ao núcleo:
cancelar jamais executa a ação.

**Estados vazios explicam o próximo passo.** Onze listas paravam em
"Nenhum orçamento definido." ou "Nenhuma missão registrada." Agora dizem o
que falta e o que fazer ("Planeje um limite por categoria…", "Crie uma
missão sem projeto para associá-la a este projeto.").

**A área de feedback voltou a ser só feedback.** Projetos e missões usavam
o `.aviso` — a área reservada a erros e avisos — para dizer que a lista
estava vazia.

**Dicas de formato nos campos de valor.** Oito campos monetários tinham
apenas o placeholder `0,00`: quem digitava `89.90` só descobria o formato
errado ao receber a mensagem de validação, depois de perder o que havia
escrito. Agora há uma dica explícita, ligada por `aria-describedby`.

---

## 3. Problemas corrigidos

| Problema | Correção |
| --- | --- |
| Erro exibido como mensagem neutra (133 pontos) | `__pulsoUI.avisar()` tipa classe, marcador e papel ARIA |
| 6 ações destrutivas sem confirmação | diálogo `__pulsoUI.confirmar()` antes da chamada ao núcleo |
| 2 maneiras distintas de confirmar a mesma ação | unificadas no mesmo diálogo |
| Campos de 9 formulários com visual nativo branco | regras gerais de formulário em `componentes.css` |
| Filtro de categoria das Finanças sem estilo | envolvido em `.filtros-extras` |
| 11 estados vazios sem próximo passo | `estadoVazio(título, dica)` |
| `.aviso` usado para lista vazia (2 casos) | convertidos para estado vazio; elementos removidos |
| CSS órfão (`.missoes-vazio`, `.dash-vazio`, `.armed`, `armar()`) | removidos junto com o uso que os justificava |
| Media query inalcançável (720px vs. mínimo de 800px) | nova faixa de 900px + faixa de altura 620px |
| Campos de valor sem dica de formato | 8 dicas com `aria-describedby` |
| Token CSS renomeado com referência quebrada | corrigido e coberto por verificação de tokens |

---

## 4. Testes realizados

```text
npm test → 413 testes · 413 passam · 0 falham
```

- **398 testes preexistentes** — todos continuam passando, sem alteração de
  resultado. Nenhuma regra de negócio foi tocada.
- **15 testes novos** (`tests/unidade/interface.test.mjs`) — contrato da
  camada de apresentação por análise estática: feedback sempre tipado,
  componentes sem órfãos, integridade HTML ↔ JS, labels e ARIA,
  confirmação antes do núcleo, diálogo acessível por teclado, identidade
  visual e estados vazios.
- **Teste de fumaça real do Electron** — `rendererPronto: true`,
  `errosConsole: []`, banco inicializado, IPC ativa, dashboard visível com
  os valores de uma missão e uma transação recém-criados.
- **Verificação de sintaxe** dos 8 scripts do renderer (`node --check`).
- **Verificação de que os testes protegem de verdade** — reintroduzido o
  `textContent` direto num `.aviso`; a suíte de interface passou a falhar
  (13 passam / 1 falha), confirmando que o teste detecta a regressão.

---

## 5. Regressões verificadas

Nenhuma. Verificado por três vias independentes:

1. **Suíte completa** — os 398 testes anteriores à fase mantêm o resultado
   (idêntico ao ponto de partida da branch).
2. **Fluxos críticos, ponta a ponta no Electron** — missão e transação
   criadas e exibidas corretamente no dashboard após o polimento; a camada
   de apresentação foi tocada, o núcleo não.
3. **Nenhuma regra de negócio alterada** — as mudanças estão restritas a
   `src/renderer/` (apresentação), `docs/` e `tests/`. `src/core/`,
   `src/main/`, `config/` e `database/` não foram modificados:

```text
git diff --stat dev..HEAD -- src/core src/main config database
→ (vazio)
```

Fluxos revisados um a um conforme o escopo: jogador, missões, progressão,
projetos, finanças, lista de desejos, serviços, contas, recorrências,
pagamentos e dashboard — sem alteração de comportamento.

---

## 6. Pendências restantes

Nada bloqueia o encerramento da fase. Itens **deixados de fora de propósito**,
por dependerem de decisão ou de fase posterior:

| Pendência | Por quê |
| --- | --- |
| Automação e2e de interface (cliques reais) | exige ferramenta dedicada; prevista para a Fase 17 |
| Cobertura de código medida | meta de cobertura a definir na Fase 17 |
| Testes de renderização / captura de tela | sem infraestrutura de navegador no runner atual |
| Suporte a resoluções fora da de desenvolvimento | a fase não cria portabilidade (Fase 18) |
| Unificar a convenção de aspas entre módulos do renderer | `servicos.js`, `contas.js` e `recorrencias.js` usam aspas duplas; `principal.js` e `loja.js` usam simples. Padronizar geraria um diff grande sem ganho funcional. |

---

## 7. Commits

Commits pequenos e objetivos, cada um verificável isoladamente:

```text
ea76fde  feat(interface): sistema de componentes compartilhados (Fase 16)
18ae76d  feat(interface): camada de interface compartilhada (Fase 16)
c1ce14d  fix(interface): erros deixam de aparecer como mensagens neutras (Fase 16)
b1eecad  feat(interface): estados vazios explicam o próximo passo (Fase 16)
f90e2a5  feat(interface): confirmação nas ações destrutivas que não tinham (Fase 16)
85e95eb  feat(interface): dicas de formato nos campos monetários (Fase 16)
2d20018  refactor(interface): uma única confirmação para toda ação destrutiva (Fase 16)
c1a06dd  fix(interface): ajuste para a largura mínima da janela (Fase 16)
90f8c90  fix(interface): cancelar missão passa a pedir confirmação (Fase 16)
cbf488d  test(interface): contrato da camada de interface compartilhada (Fase 16)
60e0342  docs(fase-16): registra as decisões visuais e o relatório da fase
45b1723  chore(interface): remove a regra .dash-vazio que sobrou sem uso
eefc66f  docs(fase-16): atualiza contagem de testes e a lista de commits
f139fb2  test(interface): cobre também as despachadoras de ação destrutiva
```

Documentação: `docs/interface.md` (seção 8), `docs/testes.md` (seção 6.1) e
`docs/roadmap.md` (Fase 16 concluída).
