# Testes — PULSO

## 1. Estratégia

Pirâmide clássica, respeitando o ritmo das fases:

1. **Unidade** — domínio e casos de uso puros (regras de XP, missões, cálculos financeiros). Rápidos e numerosos.
2. **Integração** — módulos + persistência real (SQLite em arquivo temporário), a partir da Fase 02; e, desde a Fase 01, o ciclo de inicialização da aplicação.
3. **Extremo a extremo (e2e)** — interface Electron automatizada com ferramenta dedicada; a decidir na Fase 17 (registrada em `pendencias.md`).

## 3. Infraestrutura atual (Fase 02)

- Runner: **`node:test`** executado com o **Node embutido do Electron** — `npm test` → `ELECTRON_RUN_AS_NODE=1 electron --test "tests/**/*.test.mjs"` (o `node:sqlite` exige o runtime da aplicação; o Node do sistema 20.x não o possui).
- Estrutura:

```text
tests/
├── unidade/      → ambiente, configuração, registro, canais IPC, conexão, migrações, jogador, status, missão, progressão, projeto, finança, loja, serviço, conta, recorrência, geração, dashboard (domínio + serviço)
└── integracao/   → inicialização da aplicação (fumaça), persistência real do banco, jogador, status, missão, progressão, projeto, finança, loja, serviço, conta, recorrência, geração, dashboard
```

## 3.3 Fase 06 — Progressão

- `tests/unidade/progressao.test.mjs` — regras puras do domínio: constantes
  iniciais (nível 1, 0 XP, 0 pontos, atributos em 1), curva (`100 × nível`),
  cálculo de nível (limites, múltiplos níveis, XP alto `1.000.000 → 141`),
  detalhe de progresso (`xpNoNivel`/`xpNecessario`/fração), validação de XP
  total e quantidade (negativo, fração, texto, **inteiros não seguros**),
  `adicionarXp` (zero, level up, múltiplos níveis, **estouro do inteiro
  seguro**), **teto de atributo** (`ATRIBUTO_MAXIMO = 100`: no limite passa,
  acima falha, legado acima do teto não evolui), validação de nome de
  atributo, distribuição de pontos (excesso, zero, negativo) e **origem do
  XP** (`ORIGENS_XP`).
- `tests/unidade/servico-progressao.test.mjs` — serviço em ISOLAMENTO
  (repositórios fake em memória + banco fake que registra os comandos):
  criação/consulta, idempotência do reparo, **reparo de estado parcial**,
  contrato de retorno **uniforme e congelado** nos três métodos, XP zero sem
  escrita, level up transacional (`BEGIN`/`COMMIT`), validações antes de
  qualquer escrita, teto respeitado na aplicação, **ROLLBACK** em falha de
  escrita e em falha do reparo, `ErroConflito` para jogador inexistente e
  modo degradado (sem banco).
- `tests/unidade/ipc-progressao.test.mjs` — contrato IPC por **análise
  estática**: handlers dos três canais registrados no `main.js` (com
  `jogadorId` explícito e `traduzirResultadoOperacao`) e métodos
  `obter`/`adicionarXp`/`aumentarAtributo` expostos no preload. O
  comportamento em execução é coberto pelo teste de fumaça e pela integração.
- `tests/integracao/progressao.test.mjs` — ciclo completo com banco real:
  jogador novo (nível 1 / 0 XP / atributos em 1), XP persistido, level up,
  erros (XP negativo, jogador inexistente), distribuição de pontos, **teto de
  atributo gravado no banco (100)**, **XP alto (1.000.000 → nível 141)**,
  origem validada, **reparo de progressão sem atributos sem duplicar**,
  legado acima do teto (continua legível, não evolui) e persistência
  fechar → reabrir.
- Migrações `005` (tabelas de progressão) e `009` (conciliação do banco
  legado da Fase 06) são verificadas em `tests/unidade/migracoes.test.mjs` e
  nos testes de jogador/persistência que afirmam a lista de migrações.

## 3.4 Fase 08 — Finanças

- `tests/unidade/financa.test.mjs` — regras puras do domínio: conversão e validação
  de centavos (zero, negativos, não inteiros, grandes valores), tipos de transação,
  categorias por tipo (compatíveis e incompatíveis), cálculo de saldo
  (`0+1000=1000`, `1000+500=1500`, `1500−300=1200`, `100−150=−50`), períodos
  inclusivos (`01/09` e `30/09` dentro; `31/08` e `01/10` fora) e situação de
  orçamento (0/600→600; 420/600→180; 650/600→−50 estourado).
- `tests/integracao/financa.test.mjs` — ciclo completo com banco real: jogador →
  carteira → receitas/despesas → saldo → edição (recálculo) → exclusão →
  orçamentos (gasto por período, estouro, persistência) e ciclo
  salvar → fechar → reabrir → consultar.

## 3.5 Fase 09 — Loja / Lista de Desejos

- `tests/unidade/loja.test.mjs` — regras puras do domínio: máquina de estados do
  desejo (transições válidas e inválidas, terminalidade de COMPRADO/CANCELADO),
  validações de criação/edição/compra (nome, preços em centavos, categoria,
  prioridade), comparação esperado × pago (economia `1000/900 → −100 · −10%`,
  gasto acima `1000/1100 → +100 · +10%`), valores grandes sem perda de precisão,
  mapeamento de categoria do desejo → categoria financeira da Fase 08 e
  descrição da transação gerada.
- `tests/integracao/loja.test.mjs` — ciclo completo com banco real: criar →
  consultar → editar → persistir (reabrir banco); bloqueio de transições
  inválidas; **compra atômica** (despesa criada via Fase 08 + item marcado como
  COMPRADO + vínculo `transacaoId` + saldo atualizado; rollback quando o
  financeiro falha — nada fica meio-aplicado); histórico ordenado (mais
  recente primeiro); cancelamento sem transação e sem movimento de carteira;
  recompra bloqueada; cenário completo desejo → planejar → comprar → despesa →
  saldo → histórico.

## 3.6 Fase 10.6 — Serviços e Despesas (visão e estabilização)

- `tests/integracao/fase10.test.mjs` — suíte consolidada que valida todo o
  pipeline da FASE 10 como um único fluxo coerente, incluindo os testes de
  regressão das subfases anteriores (serviço/conta/recorrência/geração/
  pagamento).

**Cenário obrigatório da fase:** Serviço “Internet” (R$ 120,00), recorrência
mensal (vence dia 15, desde 2026-10), gerar 3 contas (out/nov/dez), pagar 1
conta (outubro, R$ 125,00 — pago acima do esperado) → 3 contas existentes,
1 paga, 2 pendentes, 1 transação de despesa criada e saldo reduzido SOMENTE
pelo valor pago (R$ 1000,00 − R$ 125,00 = R$ 875,00).

**Demais coberturas:** idempotência da geração; conta manual × gerada
(nenhuma altera saldo); duplicidade de referência rejeitada; fluxos de erro
(serviço inexistente, recorrência inválida — inativa/arquivada — , conta
duplicada, conta cancelada — não paga/editada/cancelada de novo — , pagamento
duplicado bloqueado, valor inválido, jogador incorreto); **atomicidade**
(falha simulada na criação da despesa → ROLLBACK — conta segue pendente, saldo
intacto, nenhuma transação parcial); filtros por situação
(todas/pendentes/vencidas/pagas/canceladas); **vencida deriva de pendente** e
pode ser paga; **valor esperado ≠ valor pago** (a despesa registra o real);
edição de conta e ciclo de vida da recorrência
(ativar/desativar/arquivar — arquivada é terminal); **isolamento por jogador**
(nenhum outro jogador enxerga, paga ou altera a conta alheia);
**persistência** (fechar → reabrir → contas/contas pagas/vínculos/saldo
preservados).

**Bug corrigido durante a estabilização (10.6):** `validarPeriodoGeracao`
aceitava apenas datas civis completas (`AAAA-MM-DD`), rejeitando competências
(`AAAA-MM`) como `2026-10`. Normalização adicionada: competência é convertida
para o primeiro dia (início) e último dia do mês (fim), mantendo a janela
inclusiva e a comparação pela data de vencimento. `ServicoPagamentos` passa a
retornar a conta paga com a situação derivada (`situacao`), alinhando o
contrato com o restante da FASE 10.

## 3.7 Testes manuais — Fase 09 (executados)

Cenários da fase executados em banco SQLite temporário (ciclo completo, com reabertura do arquivo):

| # | Cenário | Resultado |
| --- | --- | --- |
| 1 | Criar desejo "SSD NVMe 1 TB" R$ 500,00 | status `DESEJADO`; carteira, saldo e histórico de transações **inalterados** |
| 2 | Editar preço esperado para R$ 450,00 (após `PLANEJADO`) | valor persistido; estado mantido |
| 3 | Registrar compra por R$ 399,90 | item `COMPRADO`; esperado R$ 450,00 · pago R$ 399,90 · **economia R$ 50,10**; despesa `Compra: SSD NVMe 1 TB` criada na Fase 08 |
| 4 | Consultar carteira | saldo reduzido em **R$ 399,90** (o pago), não em R$ 450,00 |
| 5 | Esperado R$ 100,00 · pago R$ 120,00 | diferença **+R$ 20,00** · **+10% acima do esperado** |
| 6 | Comprar novamente o mesmo item | **bloqueado** (`ErroTransicao` — item já comprado) |
| 7 | Cancelar um desejo | item permanece no banco (`CANCELADO`); nenhuma transação criada; carteira intacta |
| 8 | Fechar e reabrir o aplicativo (novo arquivo → reler) | histórico, estados e saldo **permanecem** |

## 3.8 Fase 10.3 — Recorrências

- `tests/unidade/recorrencia.test.mjs` — regras puras do domínio: lista controlada
  de frequências e extensibilidade (mensal…anual, cada uma com intervalo em meses),
  máquina de estados (nasce `ATIVA`; desativa/reativa; `ARQUIVADA` é terminal),
  datas civis (`AAAA-MM-DD`, datas inexistentes rejeitadas), último dia do mês
  (bissextos), **ajuste do dia 31 em meses menores** (fev → 28/29, abr/jun/nov → 30),
  valor esperado (centavos inteiros > 0), período (término ≥ início), criação e
  edição parciais, conversor linha → objeto.
- `tests/integracao/recorrencia.test.mjs` — ciclo completo com banco real:
  criar → consultar → editar → persistir; ativar/desativar/arquivar (arquivada é
  terminal: reativação e edição recusadas); vínculo com o serviço (inexistente ou
  de outro jogador recusado); validações de datas, frequência e valor; isolamento
  por jogador e filtros por estado/serviço; regras mensal e anual com dia 31;
  **teste financeiro obrigatório** (criar/editar/ativar recorrência de R$ 120,00 →
  saldo inalterado, **zero contas** e **zero transações** criadas); persistência
  fechar → reabrir.

## 3.9 Fase 10.4 — Geração de Ocorrências

- `tests/unidade/geracao.test.mjs` — regras puras do domínio: período De/Até
  (obrigatório, inclusivo, invertido e data inexistente rejeitados), elegibilidade
  (só recorrência `ATIVA` gera — inativa está pausada, arquivada encerrada),
  cálculo das ocorrências por frequência (mensal, bimestral, trimestral,
  semestral, anual com cadência ancorada no mês de `data_inicio`), respeito a
  `start_date`/`end_date`, período limitado, comparação pela DATA do vencimento
  (fim no dia 10 exclui a conta que vence dia 15) e **meses com menos dias**
  (dia 31 → fev 28/29, abr/jun/nov 30 — nunca descarta nem desloca).
- `tests/integracao/geracao.test.mjs` — ciclo completo com banco real:
  geração mensal (contas pendentes com valor copiado, vínculo `recorrencia_id`,
  serviço e jogador corretos, situação derivada da Fase 10.2); idempotência
  (mesma geração repetida → 0 novas / 3 existentes; período sobreposto → só os
  meses novos); duplicidade com conta manual preservada (não sobrescreve, não
  duplica); todas as frequências persistidas; `start_date`/`end_date` e períodos
  fora da validade; meses curtos com bissexto (fev/2024 → 29); recorrência
  inativa/arquivada/inexistente e período inválido recusados sem criar nada;
  valor vigente usado nas gerações futuras sem tocar nas contas antigas;
  isolamento por jogador; **teste financeiro obrigatório** (3 contas de R$ 120,00
  → saldo R$ 1.000,00 inalterado, carteira intacta, zero transações) e
  persistência fechar → reabrir → regerar sem duplicar.

## 3.10 Fase 10.5 — Pagamentos

- `tests/unidade/pagamento.test.mjs` — regras puras do domínio: estados
  pagáveis (`pendente`/`vencida` sim — vencida é a mesma conta `pendente` com
  vencimento no passado; cancelada/já paga/inexistente recusadas), isolamento
  por dono (conta de outro jogador recusada), valor pago em centavos inteiros
  > 0 (zero/negativo/decimal rejeitados), data civil `AAAA-MM-DD` (formato
  ruim/data inexistente rejeitadas), observação opcional truncada em 500 e
  situação de pagamento derivada (`pago`/`a_pagar`/`nao_aplicavel`).
- `tests/integracao/pagamento.test.mjs` — ciclo completo com banco real:
  pagamento de conta pendente e vencida (conta vira `PAGA` com `paid_amount`,
  `paid_at`, observação e `transaction_id`); **valor diferente do esperado**
  (esperado R$ 120, pago R$ 127,50 → despesa de R$ 127,50); **teste financeiro
  principal** (saldo R$ 1.000 → pago R$ 125 → saldo R$ 875, conta PAGA,
  transação DESPESA de R$ 125); vínculo conta↔transação consultável;
  **duplicidade bloqueada** (segunda tentativa não cria transação nem altera
  saldo); cancelada/inexistente/jogador errado/valor inválido recusados;
  **atomicidade** (falha simulada na criação da despesa → conta segue
  pendente, saldo intacto, nenhuma transação parcial); isolamento entre
  jogadores (pagar conta alheia não move carteira de ninguém) e
  **persistência** (fechar → reabrir o arquivo → conta continua PAGA com o
  vínculo e o saldo corretos).

## 4. Teste de fumaça (Fases 01–02)

O processo principal aceita a flag `--teste-fumaca`:

```bash
npx electron . --teste-fumaca
```

Ele inicia a aplicação, cria a janela, carrega o renderer, valida a ponte IPC, coleta erros de console do renderer, imprime `PULSO_FUMACA:{relatório JSON}` no stdout e encerra sozinho. Os testes de integração em `tests/integracao/inicializacao.test.mjs` executam **dois ciclos completos** (iniciar → encerrar → iniciar novamente), cobrindo:

1. dependências instaladas (Electron resolvível);
2. aplicação inicia;
3. janela criada;
4. renderer carregado;
5. HTML/CSS/JS carregam (sinal de prontidão do renderer, sem erros de console);
6. **módulo de Finanças aberto de verdade** (tela real, via `__irParaFinancas`): exige aviso vazio, histórico renderizado e filtro de categorias populado — foi um `insertBefore(opcao, 0)` na montagem desse filtro que fazia a tela cair em "Falha de comunicação com o núcleo" com ponte e banco intactos;
7. encerramento sem erros;
8. reinício após encerramento;
9. nenhum erro inesperado no console.

**Requisito de ambiente:** sessão gráfica (X11/Wayland) ou `xvfb-run` (`sudo apt install xvfb`) para execução headless.

## 5. Convenções

- arquivos de teste terminam em `.test.mjs`;
- descrições de teste em **português**;
- testes não dependem de rede nem de dados pessoais;
- configurações de teste usam `PULSO_AMBIENTE=teste` e `config/teste.json`.

## 6. O que testar por camada

| Camada | Tipo | Observação |
| --- | --- | --- |
| Domínio | unidade | funções puras, sem E/S |
| Aplicação | unidade/integração | casos de uso com repositórios simulados ou banco temporário |
| Persistência | integração | SQLite em arquivo temporário (Fase 02+) |
| Progressão (Fase 06) | unidade + integração | `progressao.test.mjs` (domínio), `servico-progressao.test.mjs` (serviço isolado com repositórios/banco fake — transações e ROLLBACK) e `ipc-progressao.test.mjs` (contrato IPC por análise estática) + integração com banco real (teto de atributo, XP alto, reparo atômico, persistência) |
| Finanças (Fase 08) | unidade + integração + fumaça | `financa.test.mjs` — domínio (centavos, categorias, saldo, período, orçamento) e ciclo completo com banco real (carteira, transações, edição/exclusão, orçamentos, persistência); smoke end-to-end com Electron (**a tela de Finanças precisa abrir sem erro de console**: aviso vazio, histórico e filtro de categorias renderizados) e, em `interface.test.mjs`, a montagem do filtro por `replaceChildren` sem `insertBefore` com índice |
| Loja / Lista de Desejos (Fase 09) | unidade + integração | `loja.test.mjs` — domínio (estados, transições, validações, diferença/percentual, mapeamento financeiro) e ciclo completo com banco real (compra atômica via Fase 08, rollback, histórico, cancelamento, persistência) |
| Recorrências (Fase 10.3) | unidade + integração | `recorrencia.test.mjs` — domínio (frequências, estados, datas, ajuste de dia 31, valores) e ciclo completo com banco real (vínculo com serviço, isolamento, filtros, arquivamento terminal, **saldo inalterado / zero contas / zero transações**, persistência) |
| Pagamentos (Fase 10.5) | unidade + integração | `pagamento.test.mjs` — domínio (estados pagáveis, isolamento por dono, valor/data, situação derivada) e ciclo completo com banco real (DESPESA via Fase 08, saldo correto, vínculo conta↔transação, duplicidade bloqueada, atomicidade com rollback, isolamento, persistência) |
| Dashboard (Fase 15) | unidade + integração + fumaça | `dashboard.test.mjs` (domínio: consolidação, agrupamentos, datas, atributos, status, missões, projetos, financas, contas e serviços, estado vazio, valores correspondem às fontes, sem dados fictícios); `servico-dashboard.test.mjs` (serviço: visão consolidada, período financeiro, saldo atual independente do período, atalhos para listas, vencidas destacadas sem alterar estado, múltiplos dados simultaneamente, criação/conclusão de missão, criação/início de projeto, transação financeira, persistência após reinicialização); smoke end-to-end com Electron (dashboard visível como tela principal, valores exibidos correspondem a missão + transação criados, sem erros de console). Regressão: `npm test` com 398 testes e 0 falhas. |
| Interface (Fase 16) | unidade | `interface.test.mjs` — contrato da camada de apresentação por **análise estática** de `index.html`, dos três CSS e dos scripts do renderer (sem DOM no runner): todo `.aviso` escrito por `avisar()`/`limparAviso()` e nunca direto, tipos de aviso conhecidos, componentes do CSS todos em uso, ids consultados existentes e sem duplicata, todo campo com `<label>`, referências ARIA resolvendo, **toda ação destrutiva confirmando antes de chamar o núcleo**, diálogo acessível por teclado e paleta restrita à identidade. Ver [3.5](#35-fase-16--polimento). |
| Processo principal + janela | integração | teste de fumaça (Fase 01) |
| Persistência (SQLite) | unidade + integração | conexão/PRAGMAs, migrações e ciclo salvar→reabrir→ler em bancos isolados (Fase 02) |
| Interface | e2e | automação dedicada (Fase 17) |

## 6.1 Fase 16 — Polimento

O bloco acima descreve os testes adicionados na fase:

- `tests/unidade/interface.test.mjs` — 15 testes de **contrato de
  interface**, por análise estática (a camada de apresentação roda no
  renderer e não tem DOM disponível no runner):

  1. **feedback sempre tipado** — todo `.aviso` do HTML é escrito por
     `__pulsoUI.avisar()`/`limparAviso()`, e nenhum módulo escreve
     `.textContent` direto num `.aviso` (era exatamente o que fazia um
     erro aparecer como mensagem neutra);
  2. **tipos conhecidos** — só `erro`, `sucesso`, `atencao` ou `info`, com
     pelo menos um erro e um sucesso no conjunto;
  3. **componentes sem órfãos** — as classes de `componentes.css`
     existem no CSS e são usadas em alguma tela;
  4. **sem resíduo da unificação** — nem `.armed` no CSS nem `armar()` em
     `ui.js`;
  5. **integridade HTML ↔ JS** — todo id consultado pelo JS existe no
     HTML e não há id duplicado;
  6. **acessibilidade** — todo campo tem `<label>` associado (ou
     `aria-label`) e toda referência `aria-describedby`/`aria-labelledby`
     resolve;
  7. **ações destrutivas** — toda função `excluir*`/`cancelar*`/`arquivar*`
     pede confirmação **antes** da primeira chamada ao núcleo, para que
     cancelar jamais execute a ação;
  8. **diálogo acessível** — `role="dialog"`, `aria-modal`,
     `aria-labelledby`, `Esc` e foco inicial em CANCELAR;
  9. **identidade** — `lang="pt-BR"` e nenhuma cor fora da paleta de
     `docs/identidade-visual.md` (exceto `#000` em `mask-image`, que é
     canal alfa, não cor pintada);
  10. **estados vazios** — nenhum texto cru do tipo "Nenhum X encontrado."

O teste 7 encontrou uma falha real durante a própria fase: **cancelar
missão** é estado terminal no domínio (`servico-missao.js`, sem retorno
possível), mas era a única ação destrutiva sem confirmação. Corrigido no
mesmo momento.

Os testes foram verificados **falhando** quando o problema é reintroduzido
(ex.: trocar um `avisar()` por `textContent`), para garantir que protegem de
verdade em vez de apenas passar.

### Estado da suíte

```text
npm test → 545 testes · 545 passam · 0 falham
```

- 398 testes anteriores à fase, sem alteração de resultado — nenhuma regra
  de negócio foi tocada;
- 14 testes novos de contrato de interface;
- teste de fumaça real do Electron: `rendererPronto: true`,
  `errosConsole: []`, dashboard visível com os valores de uma missão e uma
  transação recém-criados e **módulo de Finanças aberto sem erro de aviso**
  (fluxos críticos verificados de ponta a ponta).

## 6.2 Fase 17 — Homologação

A fase 17 ampliou a cobertura sem criar funcionalidade nova. O relatório
completo está em `REPORTS/homologacao-fase-17.md`.

```text
npm test                  → 533 testes · 533 passam · 0 falham
npm run test:homologacao  → 120 testes · 120 passam · 🟢 APTO
```

### 6.2.1 O que a fase adicionou

| Arquivo | Testes | O que fixa |
| --- | --- | --- |
| `tests/criticos/falhas.test.mjs` | 9 | Comportamento de falha: a falha é sinalizada **e nada é gravado** (saldo e tabelas intactos). Cobre registro inexistente, valor/data/categoria inválidos, pagamento duplicado, compra duplicada, recorrência e serviço arquivados, conta cancelada, transição de missão proibida. |
| `tests/integracao/homologacao/fluxos-completos/ciclo-do-operador.test.mjs` | 1 | Ciclo de 12 etapas: jogador → status → missão → projeto → progressão → finanças → serviço → recorrência → conta → pagamento → transação → carteira → dashboard. Afirma que serviço e conta **não** movem dinheiro, que a geração é idempotente e que o dashboard é somente leitura. |
| `tests/integracao/homologacao/servicos-contas.test.mjs` | 2 | Serviço → recorrência → conta → pagamento, e que o valor debitado é o **realmente pago**, não o esperado. |
| `tests/integracao/homologacao/loja-financas.test.mjs` | 2 | Compra vira despesa na carteira, entra no histórico e guarda a diferença entre preço esperado e pago. |
| `tests/criticos/integridade.test.mjs` (+2) | 2 | CASCADE nas 11 tabelas de negócio e varredura de FK violada / dado órfão com o banco cheio. |
| `tests/integracao/inicializacao.test.mjs` (+4 asserções) | — | A cadeia serviço → recorrência → geração pela **ponte IPC real**, dentro do teste de fumaça. |

### 6.2.2 Ambiente de homologação estendido

`tests/utils/ambiente-homologacao.mjs` agora reproduz a fiação completa
de `src/main/main.js` (Fases 01 a 16). Antes ligava só Fases 01–08, o que
impedia verificar justamente a cadeia mais difícil do sistema.

### 6.2.3 Testes que envelheceram

A suíte de homologação ficou vermelha ao ser sincronizada com a `dev`:
`fase-02` fixava o schema em v7 (hoje v14) e `fase-09-loja-pendente`
afirmava que a loja não existia. Ambos foram corrigidos **derivando do
código** (`MIGRACOES.length`) em vez de fixar números, para não quebrarem
de novo.

### 6.2.4 Bugs encontrados por estes testes

| Sev. | Onde | Sintoma |
| --- | --- | --- |
| MÉDIO | `dominio/financa.js` | `10/09/2026` era reinterpretado como 2026-10-09 (mês/dia), gravando data errada sem aviso. |
| MÉDIO | `servico-contas.js`, `servico-recorrencias.js` | Serviço arquivado ainda aceitava contas e recorrências; a regra existia só na interface. |
| BAIXO | `dominio/loja.js` | 10 mensagens de erro sem acentuação chegavam ao usuário (único módulo do domínio assim). |

## 7. Regras

- **Não criar testes de funcionalidades que ainda não existem.**
- Cobertura de código: meta a definir na Fase 17 (o runner nativo oferece `--experimental-test-coverage` quando necessário).
- `npm test` deve sempre terminar sem erros em `dev`.

## 8. Testes de portabilidade (Fase 18)

A Fase 18 é uma **fase de infraestrutura de distribuição**, não de domínio.
Os testes estão distribuídos em três níveis:

### 8.1 Unidade — `tests/unidade/portabilidade.test.mjs` (8 testes)

Cobre `src/main/portabilidade.js` (módulo puro, sem Electron), dentro da
suíte normal (`npm test`):

- **`PULSO_DIRETORIO_DADOS` tem precedência absoluta** — se definido, é o
  diretório, ignorando marcador e perfil do usuário.
- **Modo portátil por variável** — `PULSO_PORTABLE=1` (parâmetro `portavel`
  ou a própria variável de ambiente) leva a `<raiz>/data` mesmo sem
  marcador no disco (raiz = diretório de trabalho atual).
- **Modo portátil por marcador** — `pulso-portatil.json` acima do
  executável ativa o modo portátil e resolve `<raiz>/data`; a raiz é
  exposta em `raizPacote` (usada pelo `main.js` para achar `runtime/`).
- **Padrão do sistema** — sem variável e sem marcador, o diretório fica em
  `<appData>/pulso` (o perfil do usuário), o modo **não** é portátil e
  `raizPacote` é `''`.
- **Marcador ausente não engana** — `localizarRaizPacote` devolve string
  vazia quando não há marcador, evitando detecção portátil falsa.

### 8.2 Ciclo de vida (validação manual executada nesta fase)

Procedimento reproduzível (Linux — **VALIDADO** nesta fase):

```bash
# Etapas 1–3: executar, criar dados e fechar — sobre o pacote recém-montado
npm run build:portable
PULSO_PORTABLE=1 out/pack/PULSO-0.1.0-portatil/Linux/PULSO --teste-fumaca
# → Dados do usuário: <pacote>/data (portátil: sim — motivo: ambiente)
# → Banco de dados criado (schema v15, 15 migração(ões) nesta execução)
# → PULSO_FUMACA:{"ok":true,...} → jogador "Operador Teste", missão,
#   transação R$ 123,45 e serviço criados no banco portátil
# → data/pulso.db criado; runtime/ populado com os caches do Electron

# Etapa 4: mover o pacote
cp -r out/pack/PULSO-0.1.0-portatil /tmp/pulso-pendrive

# Etapa 5: executar novamente — o APP REAL, sem variável (detecção por marcador)
/tmp/pulso-pendrive/Linux/PULSO &
# → Dados do usuário: /tmp/pulso-pendrive/data (portátil: sim — motivo: marcador)
# → Banco de dados reutilizado (schema v15, 0 migração(ões) nesta execução)

# Etapa 6: conferir os dados com leitura somente-leitura do SQLite
# → jogador: Operador Teste | missão: Missão do teste de fumaça
# → transacao: receita 12345 centavos "Receita do teste de fumaça"
# → servico: Servico do teste de fumaca | schema_migrations: 15
# → PRAGMA integrity_check = ok

# Etapa 7: perfil do sistema operacional intacto
stat -c '%Y' ~/.config/pulso   # mtime idêntico antes e depois das execuções
```

Notas do procedimento:

- a fumaça usa `PULSO_PORTABLE=1` de propósito: é a única forma de ela
  escrever **no pacote** (por padrão ela isola o banco em diretório
  temporário para nunca tocar no banco real);
- a fumaça exige banco virgem (`preparado` = "não havia jogador"); com
  dados já existentes ela reporta `ok:false` por contrato — por isso a
  **etapa 5 usa o aplicativo real**, que é exatamente o fluxo do usuário;
- a etapa 5 valida o ramo de produção portátil (`userData = <raiz>/runtime`,
  banco = `<raiz>/data`), o mesmo ramo que um pendrive usaria.

O que este ciclo afirma:

| Etapa (pendrive) | Verificação | Status |
| --- | --- | --- |
| 1. Executar | app inicia, DB é criado em `<pacote>/data/` | 🟢 VALIDADO |
| 2. Criar dados | fumaça cria jogador/missão/transação/serviço no DB portátil | 🟢 VALIDADO |
| 3. Fechar | encerra com código 0 (`ok:true`) | 🟢 VALIDADO |
| 4. Mover o pacote | `cp -r` para outro caminho | 🟢 VALIDADO |
| 5. Executar novamente | `Banco de dados reutilizado (schema v15, 0 migrações)`, motivo `marcador` | 🟢 VALIDADO |
| 6. Dados permanecem | mesmos registros no SQLite movido + `integrity_check = ok` | 🟢 VALIDADO |
| 7. Não grava no perfil do SO | mtime de `~/.config/pulso` inalterado; `data/` contém só o banco | 🟢 VALIDADO |

**Pacotes gerados (além do pacote fonte):**

| Verificação | `build:linux` (tar.gz) | `build:windows` (zip) |
| --- | --- | --- |
| Launcher do pacote | 🟢 `./iniciar/iniciar-linux.sh --teste-fumaca` → `PULSO_FUMACA ok:true` | 🟢 `wine cmd /c iniciar\iniciar-windows.bat --teste-fumaca` → `ok:true` |
| Aplicativo real | 🟢 motivo `marcador`; `data/pulso.db` + `runtime/` no pacote; perfil `~/.config/pulso` intacto | 🟢 sob Wine: motivo `marcador`; `Z:\…\data\pulso.db` + `runtime/` no pacote |
| Banco compartilhado Linux ↔ Windows | 🟢 banco criado no Linux | 🟢 `.exe` abriu o banco do Linux: `reutilizado (schema v15, 0 migrações)` |
| Execução em Windows real | — | 🔴 pendente (P-036) |

### 8.3 Migração de banco existente

- `tests/unidade/migracoes.test.mjs` (existente) afirma a cadeia completa de
  15 migrações até o schema v15.
- Execução do pacote portátil sobre banco existente confirmou
  `reutilizado (schema v15, 0 migrações)` — ou seja, **a migração não
  recria nem apaga o banco do usuário**.

### 8.4 O que NÃO foi validado aqui

- **Windows real**: a **build** (`build:windows`, executada no Ubuntu com o
  runtime win32 extraído do cache do Electron) e a **execução** foram
  validadas **sob Wine 10** — fumaça `ok:true`, launcher `.bat`, aplicativo
  real gravando `data/` + `runtime/` no pacote e banco do Linux reutilizado
  (`schema v15, 0 migrações`). Falta executar em **máquina Windows real**
  (P-036). Ver `docs/portabilidade.md` §9.
- **AppImage**: requer `appimagetool`/`linuxdeployqt` (não presentes);
  a distribuição Linux desta fase é o tar.gz portátil.

### 8.5 Comandos rápidos

```bash
npm test                                          # suíte completa (unidade+integração) — 553 testes
npm run build:portable                            # monta o pacote portátil
npm run build:linux                               # gera dist/…-linux-portatil.tar.gz
```
