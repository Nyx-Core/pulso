/**
 * PULSO — camada de interface compartilhada (Fase 16 — Polimento)
 *
 * Apresentação usada por TODOS os módulos do renderer: feedback tipado,
 * confirmação de ações destrutivas, estados vazios e o estado "armado" dos
 * botões de exclusão.
 *
 * Nenhuma regra de negócio mora aqui: validações e operações continuam no
 * núcleo. Este arquivo apenas apresenta o resultado e devolve a decisão do
 * usuário. Exposto em `window.__pulsoUI` (scripts clássicos, sem módulos).
 */

const TIPOS_AVISO = ['erro', 'sucesso', 'atencao'];
let dialogoAberto = null;
let contadorDialogo = 0;

/**
 * Escreve uma mensagem de feedback já tipada.
 * A cor deixa de ser a única pista: o marcador (::before) e o papel ARIA
 * também mudam — `alert` para erro/atenção, `status` para sucesso e info.
 */
function avisar(elemento, texto, tipo = 'info') {
  if (!elemento) return;
  TIPOS_AVISO.forEach((nome) => elemento.classList.remove(nome));
  const mensagem = String(texto ?? '').trim();
  elemento.textContent = mensagem;
  if (!mensagem) {
    elemento.removeAttribute('role');
    return;
  }
  if (TIPOS_AVISO.includes(tipo)) {
    elemento.classList.add(tipo);
    elemento.setAttribute('role', 'alert');
    return;
  }
  elemento.setAttribute('role', 'status');
}

/** Limpa o feedback de um elemento. */
function limparAviso(elemento) {
  avisar(elemento, '');
}

/**
 * Estado vazio que sempre explica o próximo passo (nunca apenas "não há
 * nada aqui"). Devolve o elemento pronto para inserção na lista.
 */
function estadoVazio(titulo, dica) {
  const caixa = document.createElement('div');
  caixa.className = 'estado-vazio';
  const cabecalho = document.createElement('p');
  cabecalho.className = 'estado-vazio-titulo';
  cabecalho.textContent = titulo;
  caixa.append(cabecalho);
  if (dica) {
    const apoio = document.createElement('p');
    apoio.className = 'estado-vazio-dica';
    apoio.textContent = dica;
    caixa.append(apoio);
  }
  return caixa;
}

/**
 * Confirmação explícita para ações destrutivas ou irreversíveis.
 * Devolve `true` somente quando o usuário confirma. O foco volta ao
 * elemento de origem; Esc e o clique no fundo equivalem a "cancelar".
 */
function confirmar({
  titulo,
  texto,
  alvo,
  rotuloConfirmar = 'CONFIRMAR',
  rotuloCancelar = 'CANCELAR',
} = {}) {
  // Uma confirmação por vez: uma nova chamada encerra a anterior.
  if (dialogoAberto) fecharDialogo(false);

  return new Promise((resolve) => {
    const focoAnterior = document.activeElement;
    const sufixo = ++contadorDialogo;
    const idTitulo = `dialogo-titulo-${sufixo}`;
    const idTexto = `dialogo-texto-${sufixo}`;

    const fundo = document.createElement('div');
    fundo.className = 'dialogo-fundo';
    fundo.setAttribute('role', 'dialog');
    fundo.setAttribute('aria-modal', 'true');
    fundo.setAttribute('aria-labelledby', idTitulo);
    fundo.setAttribute('aria-describedby', idTexto);

    const painel = document.createElement('div');
    painel.className = 'dialogo-painel';

    const cabecalho = document.createElement('p');
    cabecalho.className = 'dialogo-titulo';
    cabecalho.id = idTitulo;
    cabecalho.textContent = titulo ?? 'CONFIRMAR AÇÃO';

    const descricao = document.createElement('p');
    descricao.className = 'dialogo-texto';
    descricao.id = idTexto;
    descricao.textContent = texto ?? 'Esta ação não pode ser desfeita.';

    painel.append(cabecalho, descricao);

    if (alvo) {
      const referencia = document.createElement('p');
      referencia.className = 'dialogo-alvo';
      referencia.textContent = alvo;
      painel.append(referencia);
    }

    const acoes = document.createElement('div');
    acoes.className = 'dialogo-acoes';

    const cancelar = document.createElement('button');
    cancelar.type = 'button';
    cancelar.className = 'botao-secundario';
    cancelar.textContent = rotuloCancelar;

    const botaoConfirmar = document.createElement('button');
    botaoConfirmar.type = 'button';
    botaoConfirmar.className = 'botao-perigo';
    botaoConfirmar.textContent = rotuloConfirmar;

    acoes.append(cancelar, botaoConfirmar);
    painel.append(acoes);
    fundo.append(painel);
    document.body.append(fundo);

    function fecharDialogo(confirmado) {
      if (!fundo.isConnected) return;
      document.removeEventListener('keydown', aoTeclar);
      fundo.remove();
      if (dialogoAberto === fundo) dialogoAberto = null;
      if (focoAnterior && typeof focoAnterior.focus === 'function') focoAnterior.focus();
      resolve(confirmado);
    }

    function aoTeclar(evento) {
      if (evento.key === 'Escape') {
        evento.preventDefault();
        fecharDialogo(false);
        return;
      }
      if (evento.key !== 'Tab') return;
      const focaveis = painel.querySelectorAll('button, [href], input, select, textarea');
      if (!focaveis.length) return;
      const primeiro = focaveis[0];
      const ultimo = focaveis[focaveis.length - 1];
      if (evento.shiftKey && document.activeElement === primeiro) {
        evento.preventDefault();
        ultimo.focus();
      } else if (!evento.shiftKey && document.activeElement === ultimo) {
        evento.preventDefault();
        primeiro.focus();
      }
    }

    dialogoAberto = fundo;
    cancelar.addEventListener('click', () => fecharDialogo(false));
    botaoConfirmar.addEventListener('click', () => fecharDialogo(true));
    fundo.addEventListener('mousedown', (e) => {
      if (e.target === fundo) fecharDialogo(false);
    });
    document.addEventListener('keydown', aoTeclar);
    // O foco começa em CANCELAR: evita confirmar com Enter sem querer.
    cancelar.focus();
  });
}

window.__pulsoUI = { avisar, limparAviso, estadoVazio, confirmar };
