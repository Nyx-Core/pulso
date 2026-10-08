# Relatório de Homologação — FASE 17

**Branch:** `homologacao` (sincronizada com `dev`, que traz a FASE 16)
**Commit validado:** `1f73ab2`
**Veredito:** 🟢 **APTO**

> Princípio desta fase: o PULSO não ganhou novos poderes. A fase provou
> que ele usa corretamente os poderes que já tem.

---

## 1. Ambiente

| Item | Valor |
| --- | --- |
| Sistema | Ubuntu 26.04.1 LTS |
| Node.js | v20.20.2 (sistema) / 22.21.1 (embutido no Electron) |
| Electron | 37.10.3 (Chromium 138.0.7204.251) |
| SQLite | `node:sqlite` (nativo), schema **v14** |
| Janela | 1100×700, mínima 800×520 |
| Idioma | pt-BR |

---

## 2. Testes executados

```text
npm test                  → 536 testes · 536 passam · 0 falham
npm run test:homologacao  → 120 testes · 120 passam · 0 falham · 🟢 APTO
```

| Suíte | Antes | Depois |
| --- | --- | --- |
| `npm test` (projeto) | 398 (na `dev`) | **536** |
| `npm run test:homologacao` | 105 (desatualizada) | **120** |

O executor de homologação gera relatório numerado em `relatorios/`
(`REL-0000` a `REL-0007`), com veredito automático.

### 2.1 O que foi executado além da suíte

- **Teste de fumaça real do Electron** — 3 ciclos consecutivos de
  iniciar → executar → encerrar: `rendererPronto: true`,
  `errosConsole: []` em todos.
- **Cadeia pela ponte IPC real** — serviço → recorrência → geração de
  ocorrências, criada pelo app de verdade durante o teste de fumaça.
- **Persistência** — fechar e reabrir o banco: saldo, transações e conta
  paga sobrevivem intactos.
- **Varredura de integridade** — `PRAGMA foreign_key_check` e
  `integrity_check` com o banco cheio, mais busca de dado órfão nas
  seis tabelas de negócio.

---

## 3. Cobertura

### 3.1 Por fase

| Fase | Módulo | Unidade | Integração | Homologação |
| --- | --- | --- | --- | --- |
| 01–02 | Fundação, banco | ✅ | ✅ (smoke) | ✅ |
| 03 | Jogador | ✅ | ✅ | ✅ |
| 04 | Status | ✅ | ✅ | ✅ |
| 05 | Missões | ✅ | ✅ | ✅ |
| 06 | Progressão | ✅ | ✅ | ✅ |
| 07 | Projetos | ✅ | ✅ | ✅ |
| 08 | Finanças | ✅ | ✅ | ✅ |
| 09 | Loja / desejos | ✅ | ✅ | ✅ |
| 10.1 | Serviços | ✅ | ✅ | ✅ |
| 10.2 | Contas | ✅ | ✅ | ✅ |
| 10.3 | Recorrências | ✅ | ✅ | ✅ |
| 10.4 | Geração | ✅ | ✅ | ✅ |
| 10.5 | Pagamentos | ✅ | ✅ | ✅ |
| 15 | Dashboard | ✅ | ✅ | ✅ |
| 16 | Interface | ✅ (contrato) | — | ✅ |

### 3.2 Fluxos exigidos pela fase

| Fluxo | Onde é verificado |
| --- | --- |
| Missões → progressão | `tests/integracao/homologacao/missoes-progressao` + smoke |
| Projetos → missões | `tests/integracao/homologacao/projetos-missoes` + ciclo completo |
| Finanças (receita/despesa/edição/exclusão → saldo) | `tests/integracao/homologacao/financas-orcamento` + ciclo completo |
| **Loja → finanças** | `tests/integracao/homologacao/loja-financas` **(novo)** |
| **Serviços → contas** | `tests/integracao/homologacao/servicos-contas` **(novo)** |
| **Contas → finanças (pagamento)** | `tests/integracao/homologacao/servicos-contas` **(novo)** |
| **Ciclo completo (12 etapas)** | `fluxos-completos/ciclo-do-operador` **(novo)** |

### 3.3 Integridade

Todos verificados e **sem exceção**: FK (`foreign_key_check` limpo),
`integrity_check: ok`, isolamento por jogador, valores em centavos
(inteiros, nunca fracionários), ausência de duplicidade (pagamento e
compra repetidos são recusados sem debitar em dobro), CASCADE nas 11
tabelas de negócio, ausência de dado órfão, e atomicidade (nenhum fluxo
financeiro altera o saldo parcialmente).

---

## 4. Bugs encontrados e corrigidos

Classificação por severidade, como a fase determina.

### 4.1 BUG MÉDIO — data ambígua reinterpretada em silêncio (corrigido)

**Onde:** `src/core/dominio/financa.js` · `validarData`
**Achado por:** teste de falha (transação com data em formato errado)

`validarData` aceitava qualquer texto que o `new Date()` entendesse e
normalizava sozinho. O caso perigoso: `10/09/2026` — que um brasileiro lê
como 10 de setembro — era interpretado no padrão **mês/dia** e gravado como
**2026-10-09**, um mês e um dia de diferença, sem qualquer aviso ao
usuário.

As validações de `conta.js` e `recorrencia.js` já eram estritas (exigem
`AAAA-MM-DD`); `financa.js` era a única exceção.

**Correção:** só `AAAA-MM-DD` é aceito, alinhando os três módulos.
Nenhum caminho de produção é afetado — os 10 campos de data da interface
são `<input type="date">` e os serviços de conta e pagamento já passavam
`AAAA-MM-DD`.

### 4.2 BUG MÉDIO — serviço arquivado ainda aceitava contas e recorrências (corrigido)

**Onde:** `servico-contas.js` e `servico-recorrencias.js` · `_garantirServico`
**Achado por:** teste de falha (conta de serviço arquivado)

Arquivar é estado terminal, mas a regra existia **apenas na interface**:
o renderer filtrava serviços arquivados do formulário de conta, e nada no
núcleo recusava a operação. Bastava chamar o serviço diretamente — ou
reenviar um formulário antigo, com o id travado — para criar conta de um
serviço encerrado, contrariando o que a própria tela promete.

**Correção:** a regra passou para o serviço de aplicação, junto das
validações de serviço inexistente e de outro jogador.

### 4.3 BUG BAIXO — mensagens de erro sem acento chegavam ao usuário (corrigido)

**Onde:** `src/core/dominio/loja.js` · 10 mensagens
**Achado por:** leitura durante a revisão de cobertura

`loja.js` era o único módulo do domínio com texto em português sem
acentuação — "Categoria invalida", "Transicao nao permitida", "O preco
esperado deve ser maior que zero". Essas mensagens não ficam no console:
o renderer as exibe na tela, e o projeto exige pt-BR.

**Correção:** as 10 mensagens foram acentuadas (e a seta `->` da
transição virou `→`). Nenhum teste dependia do texto antigo.

### 4.4 Testes obsoletos (corrigido — não é bug de aplicação)

A infraestrutura de homologação foi escrita quando a branch parava na
Fase 08, e **envelheceu com o código**:

- `fase-02` fixava a versão do schema em 7 (hoje é 14) → 5 testes
  falhando. Passaram a derivar de `MIGRACOES.length`, para não quebrarem
  de novo a cada fase que acrescentar migração.
- `fase-09-loja-pendente` afirmava que o domínio da loja **não existia** —
  a Fase 09 foi entregue. O próprio arquivo pedia substituição quando a
  fase nascesse; virou `fase-09-loja.test.mjs` com o que a homologação
  precisa afirmar.

**Sinal importante:** a suíte estava **verde na `dev` e vermelha ao ser
sincronizada** — a divergência estava escondida porque ninguém rodava a
homologação contra o código atual.

### 4.5 BUG CRÍTICO — migração 014 travava a abertura sem a tabela `servico` (corrigido)

**Onde:** `src/core/database/migracoes.js` · `MIGRACAO_014`
**Achado por:** relato de uso (aplicação não iniciava)
**Severidade:** CRÍTICO — impede o uso da aplicação

**Sintoma:** `Falha na migração 14 (campos-de-pagamentos...) - transação
revertida: no such table: main.servico`, com a tela "a memória local
(sqlite) falhou".

**Causa:** a migração 014 cria `servico_conta_pagamento` com
`REFERENCES servico(id)` e logo em seguida copia as linhas com
`INSERT ... SELECT`. Com `PRAGMA foreign_keys = ON`, o SQLite **aceita o
`CREATE TABLE`** (a FK não é validada ali) mas **valida o alvo no DML** — e
o `INSERT` quebravava com "no such table".

O comentário da própria migração já tratava exatamente esse caso para a
tabela `transacao`; faltava a mesma guarda para `servico` (e para
`servico_recorrencia`).

**Conferido no banco real do ambiente:** ele está em **v13**, com
`servico_conta` e `transacao` presentes, mas **sem a tabela `servico`** —
exatamente o cenário que travava. Uma cópia desse banco migra para v14
com integridade limpa depois da correção.

**Correção:** cada vínculo recebe `REFERENCES` apenas quando a tabela
alvo existe de fato; senão fica coluna simples. A proteção já existente
para `transacao` foi reaproveitada, não duplicada.

**Integridade não foi sacrificada:** no banco completo, as três FKs
(`servico`, `servico_recorrencia`, `transacao`) continuam intactas —
trocar um bug de inicialização por um bug de dados seria pior. Isso tem
teste próprio.

**Três testes de regressão** foram adicionados, e o principal foi
verificado **falhando com a correção revertida**, reproduzindo a
mensagem exata do relato.

---

## 5. Pendências

Nada bloqueia a portabilidade. Registradas em `docs/pendencias.md`:

| ID | Pendência | Motivo |
| --- | --- | --- |
| P-032 | e2e de interface com cliques reais | falta ferramenta dedicada; a ponte IPC já é exercitada em execução |
| P-033 | CHECK de status entre 0 e 100 no banco | continua P-021; o domínio valida antes de gravar |
| P-034 | Cobertura de código medida por linha | meta percentual a definir; a fase ampliou cobertura por **cenário** |
| P-035 | Teste de carga / volume alto | uso pessoal e local; a fase verificou repetição, não escala |

---

## 6. Limitações conhecidas

- **Sem e2e de interface**: os testes exercitam o núcleo, a ponte IPC e o
  contrato da interface (análise estática), mas não "clicam" nas telas.
  A navegação e os formulários não foram automatizados; foram validados
  pelo teste de fumaça e pela revisão visual da Fase 16.
- **Cobertura por cenário, não por linha**: saber que "o histórico não
  mente" vale mais que um percentual, mas não substitui a medição.
- **`node:sqlite` experimental**: o próprio Node sinaliza
  `ExperimentalWarning`. Não é um defeito do PULSO e não foi contornado
  (Fase 18 pode avaliar alternativas).
- **Ambiente único**: validado apenas em Ubuntu 26.04. Windows e
  portabilidade são da Fase 18, por decisão de escopo.

---

## 7. Commits da fase

```text
46d3673  Merge: sincroniza homologacao com dev (Fases 10 a 16)
d348eaf  fix(homologacao): corrige testes de fase que envelheceram com o schema
85b2b17  test(homologacao): cobre as Fases 10 a 16 e o ciclo completo do operador
0dd765f  fix(loja): mensagens de erro sem acento chegavam ao usuario (BUG BAIXO)
3c2e337  fix(financas): data ambígua era reinterpreta em silêncio (BUG MÉDIO)
748b998  test(homologacao): fixa o comportamento de falha e a integridade do banco
83ad5c5  test(homologacao): cobre servicos→contas e loja→financas
1684461  test(inicializacao): exercita a cadeia de servicos pela ponte real
1f73ab2  docs(fase-17): marca a fase no roadmap e registra pendencias restantes
fda88c3  docs(fase-17): relatorio de homologacao e ADRs de integridade
708a85e  fix(banco): migracao 014 travava a abertura sem a tabela servico (BUG CRÍTICO)
```

As correções de código saíram de branches temporárias `correcao/*`, já
removidas após a integração, como a fase determina.

---

## 8. Resultado final

| Critério de conclusão | Estado |
| --- | --- |
| Testes automatizados passando | ✅ 536/536 + 120/120 homologação |
| Fluxos integrados validados | ✅ ciclo completo de 12 etapas |
| Regressão concluída | ✅ nenhuma quebra entre as correções |
| Bugs críticos e altos resolvidos | ✅ 1 crítico corrigido (migração 014) |
| Dados persistem corretamente | ✅ fechar/reabrir preserva tudo |
| Operações financeiras íntegras | ✅ sem saldo parcial, sem duplicidade |
| Dashboard reflete dados reais | ✅ saldo conferido contra a carteira |
| Aplicação estável no Ubuntu | ✅ 3 ciclos sem erro de console |
| Documentação atualizada | ✅ roadmap, pendências, testes |

**Conclusão: 🟢 APTO para a etapa de portabilidade (Fase 18).**

A FASE 18 não foi iniciada.