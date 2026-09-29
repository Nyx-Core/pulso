# Interface — PULSO

**Fases responsáveis:** a partir da Fase 01 — Fundação; polimento na Fase 16.

## 1. Conceito

Interface inspirada em **Cyberpunk / Netrunner / terminal / trilha de rede**: o usuário enxerga sua vida como um sistema operacional pessoal — nós, conexões, estados e sinais.

## 2. Elementos planejados

- linhas de conexão e nós (grafos de relações entre missões, projetos e habilidades);
- grades e molduras estilo HUD;
- indicadores de estado do sistema (online/offline, salvamento, erros);
- áreas de terminal (logs, eventos, feedback);
- barras de progresso (XP, atributos, orçamentos);
- estados de sistema visíveis (carregando, vazio, erro) sempre com textos em pt-BR.

## 3. Princípios

1. **Legibilidade primeiro** — o estilo cyberpunk serve ao uso diário, nunca o contrário.
2. **Vermelho como destaque** — reservado para ação primária, alerta e atenção; não como preenchimento de tela (ver `identidade-visual.md`).
3. **Feedback constante** — toda ação tem resposta visual imediata; o sistema sempre comunica seu estado.
4. **Hierarquia clara** — informação crítica primeiro; ruído visual mínimo.
5. **Tema escuro padrão** — fundos escuros, texto claro, contraste mínimo WCAG AA.
6. **Offline e local** — fontes e recursos carregados localmente; nada essencial depende de CDN/internet.
7. **Idioma único** — todos os textos visíveis em pt-BR.

## 4. Navegação (intenção inicial)

Navegação por módulos (Missões, Finanças, Música etc.) com um núcleo/dashboard central. O desenho detalhado será feito a partir da Fase 01/02, quando os módulos começarem a existir — esta fase apenas registra a direção.

## 5. Dashboard (Fase 15 — implementada)

O Dashboard é a **tela principal** do PULSO e uma **camada de consolidação**: exibe, em uma única visão, o estado dos módulos já implementados (Fases 03–10), sem criar banco próprio, sem duplicar dados e sem novas regras de negócio.

Organização por prioridade:

1. situação atual (jogador, status, atributos);
2. ações pendentes (missões e projetos com resumo e atalhos para as listas);
3. progresso (projetos em andamento com progresso);
4. situação financeira (saldo atual, receitas e despesas do período, orçamento quando aplicável); o saldo é sempre o saldo atual da carteira, independente do filtro de período;
5. contas próximas/vencidas (pendentes, vencidas, próximas, serviços ativos; contas vencidas destacadas sem alterar o estado persistido).

Período financeiro: padrão = mês civil atual, alterável pelos atalhos ‹ / › / MÊS ATUAL.

Ações rápidas: atalhos para os fluxos existentes (nova missão, novo projeto, nova transação, nova conta, novo serviço), sem duplicar regras de negócio.

Estética: PT-BR, cyberpunk/hacker-feiticeiro, fundo escuro, vermelho como destaque, blocos/cards com hierarquia visual, responsivo à resolução disponível, sem excesso de informação e sem gráficos desnecessários.

Escopo excluído por exigência da fase: habilidades (FASE 11 adiada), música (FASE 12 adiada), mapa/trilha (FASE 13 adiada), conquistas (FASE 14 adiada). O dashboard não implementa funcionalidades das FASES 11 a 14.

Src: `src/renderer/index.html` (seção `visao-dashboard`), `src/renderer/js/dashboard.js`, `src/renderer/css/principal.css` (blocos `.dashboard-*`), `src/core/dominio/dashboard.js`, `src/core/aplicacao/servico-dashboard.js`, IPC em `src/main/main.js` / `src/main/preload.cjs` / `src/main/canais.cjs`.

## 6. Tela de fundação (implementada na Fase 01)

A tela inicial do PULSO (`src/renderer/`) já aplica os princípios acima em escala mínima:

- fundo preto profundo com grade sutil desvanecida e scanlines discretas;
- trilha de rede decorativa (nós e conexões com fluxo animado lento), com dois nós em vermelho;
- filete vermelho no topo e moldura estilo HUD no cabeçalho/rodapé;
- sequência de inicialização em formato de terminal (linhas com ponto de guia e valores em vermelho);
- estado do sistema com luz pulsante (`INICIANDO…` → `SISTEMA ONLINE` ou `FALHA DE COMUNICAÇÃO`);
- rodapé com informações reais do sistema (ambiente, Electron, Node, Chrome, plataforma) vindas por IPC;
- tipografia monoespaçada do sistema (offline); animações desativadas quando o sistema pede movimento reduzido.

Arquivos: `src/renderer/index.html`, `css/base.css` (variáveis da paleta), `css/principal.css`, `js/principal.js`.

## 7. Acessibilidade

- contraste mínimo AA (4,5:1) para texto;
- nunca comunicar estado **apenas** por cor (usar texto/ícone junto);
- navegação por teclado considerada desde o início da implementação;
- respeito a preferências de movimento reduzido nas animações.

## 8. Fase 16 — Polimento

A fase não criou funcionalidade: encontrou problemas de apresentação e de
experiência já existentes e os corrigiu.

### 8.1 Camada de componentes

`css/componentes.css` concentra o que é comum a todas as telas: botões
(primário, secundário, perigo, ícone), regras gerais de formulário, barra
de filtros, feedback e estados vazios. Antes, cada módulo repetia (ou
não tinha) o seu próprio estilo — apenas `#formulario-jogador` e três
`<select>` tinham aparência, e os demais campos apareciam com o visual
branco do navegador dentro de uma aplicação escura.

`css/base.css` passou a definir a **escala única** de tokens (espaçamento,
raio, alvo mínimo de toque, cores), consumida por todos os componentes.
Nenhuma cor literal é usada fora dela.

`js/ui.js` é o par do CSS: `avisar`, `limparAviso`, `estadoVazio` e
`confirmar`. É onde a folha de estilo vira comportamento. Nenhuma regra de
negócio mora ali — validações e operações continuam no núcleo.

### 8.2 Decisões tomadas

| Decisão | Motivo |
| --- | --- |
| Vermelho como **destaque**, nunca preenchimento de tela | regra da identidade, mantida em todas as fases |
| `botao-primario` com fundo **transparente** e borda vermelha; o sólido fica no *hover* | a ação principal de cada tela fica identificável sem transformar a interface em vermelho |
| Botões de perigo **sempre textuais** ("EXCLUIR", "CANCELAR") | um ícone sozinho não diz o que acontece |
| Filtro **ativo** = fundo vermelho + texto escuro em negrito | o estado não depende só da cor |
| `.aviso` **tipado** (`erro` / `sucesso` / `atencao`), com marcador e papel ARIA próprios | o estado não depende só da cor; `alert` para erro, `status` para sucesso |
| **Uma única confirmação** para toda ação destrutiva (diálogo) | havia duas maneiras de confirmar a mesma coisa |
| Confirmação **antes** da chamada ao núcleo | "cancelar" jamais executa a ação |
| Foco do diálogo abre em **CANCELAR** | evita confirmar com Enter sem querer |
| Estado vazio sempre com **próximo passo** | "Nenhuma missão registrada." não diz o que fazer |
| Valores monetários com `tabular-nums` | dígitos alinhados em coluna |
| Cantos quase retos (`--pulso-raio: 2px`) | linhas de terminal, não "app" |

### 8.3 Problemas corrigidos

- **Erros pareciam mensagens neutras.** O componente `.aviso` já sabia se
  diferenciar, mas nenhum dos 133 pontos de escrita aplicava a classe: uma
  falha de salvamento era exibida no mesmo cinza de "Conta atualizada com
  sucesso". Todos passaram por `avisar()`.
- **Cinco ações destrutivas executavam com um clique**, sem possibilidade
  de arrependimento: excluir missão, cancelar missão, cancelar desejo,
  cancelar conta, arquivar serviço e arquivar recorrência.
- **Campos sem estilo próprio.** Missão, projeto, transação, orçamento,
  desejo, serviço, conta, recorrência e pagamento usavam o `<input>`
  nativo branco do navegador.
- **Filtro financeiro sem estilo.** `filtro-categoria-financa` era o único
  `<select>` de filtro fora de `.loja-filtros-extras`.
- **Estados vazios sem saída.** Onze listas paravam em "Nenhum orçamento
  definido."; projetos e missões usavam a área de feedback (`.aviso`,
  reservada a erros) para dizer que a lista estava vazia.
- **`.aviso` usado para outra coisa.** `aviso-projetos` e `aviso-missoes`
  existiam só para mensagens de lista vazia.
- **CSS órfão.** `.missoes-vazio`, `.dash-vazio`, `.botao-perigo.armed` e
  `armar()` existiam sem uso depois da unificação.
- **Media query inalcançável.** A única regra responsiva agia abaixo de
  720px, mas a janela tem largura mínima de 800px (`config/*.json`).
- **Sem dica de formato.** Os campos de valor só tinham o placeholder
  `0,00`; quem digitava `89.90` só descobria o formato errado ao receber a
  mensagem de validação, depois de perder o que havia escrito.

### 8.4 Responsividade

Verificado na resolução de uso (1100×700) e na largura mínima (800×520):

- `900px` — grades de metadados empilham, títulos de item quebram em vez de
  ser truncados com reticências, e o botão de criação ocupa a linha
  inteira em vez de disputar espaço com os filtros;
- `720px` — grades do dashboard colapsam em uma coluna (regra anterior,
  mantida);
- `620px` de altura — reduz o respiro vertical para que lista e ações
  continuem visíveis.

Estrutura: `.tela` ocupa `100dvh`, `.nucleo` rola na vertical com
`overscroll-behavior: contain` e `scrollbar-gutter: stable` (a barra não
salta ao alternar entre listas com e sem rolagem).

### 8.5 Arquivos

| Arquivo | Papel |
| --- | --- |
| `css/base.css` | tokens, tipografia base, foco, barras de rolagem |
| `css/componentes.css` | botões, formulários, feedback, estados vazios, diálogo |
| `css/principal.css` | regras específicas de cada tela |
| `js/ui.js` | camada de apresentação compartilhada |
| `js/principal.js`, `loja.js`, `servicos.js`, `contas.js`, `recorrencias.js`, `servicos-despesas.js`, `dashboard.js` | telas |

### 8.6 Acessibilidade da fase

- anel de foco visível em **todos** os elementos (`:focus-visible`, 2px);
- alvos de 28px, acima do mínimo WCAG 2.5.8 (24px);
- `role="alert"` para erro e `role="status"` para sucesso, para que o tipo
  de feedback seja anunciado corretamente;
- diálogo com `role="dialog"`, `aria-modal`, `aria-labelledby`,
  `aria-describedby`, foco preso dentro do painel e devolvido ao fechar;
- `Esc` cancela; o clique no fundo cancela;
- `color-scheme: dark` — calendários e listas nativas herdam o tema
  escuro em vez do claro do sistema;
- todos os campos têm `<label>`; dicas de formato ligadas por
  `aria-describedby`.

