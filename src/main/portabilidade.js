/**
 * PULSO — Resolução de locais (Fase 18 — Portabilidade)
 *
 * Determina os diretórios reais de uma aplicação Electron, independente de
 * onde o código "nasceu" (source, build, pendrive), sem caminhos absolutos
 * específicos da máquina de desenvolvimento.
 *
 * Regras de resolução (ordem de precedência):
 *   1. PULSO_DIRETORIO_DADOS (ambiente/usuário) → diretório explícito.
 *   2. Modo portátil (PULSO_PORTABLE=1 OU marcador
 *      `pulso-portatil.json` em cima do executável) → <raiz-do-pacote>/data.
 *   3. Padrão (instalação no sistema operacional) → <appData>/pulso.
 *
 * O módulo NÃO importa o Electron, para ficar 100% testável fora do
 * processo principal (núcleo, CI, testes unitários).
 *
 * As decisões de negócio não mudam: aplicação, dados do usuário e banco
 * continuam separados. O que muda é apenas *onde* o banco mora.
 */

import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

/** Nome do arquivo de variável de ambiente para o diretório de dados explícito. */
export const PULSO_DIRETORIO_DADOS = 'PULSO_DIRETORIO_DADOS';

/** Nome do arquivo de variável de ambiente para forçar modo portátil. */
export const PULSO_PORTABLE = 'PULSO_PORTABLE';

/** Marcador de raiz de pacote portátil. */
export const PULSO_MARCADOR_PORTAVEL = 'pulso-portatil.json';

/**
 * Localiza a raiz de um pacote portátil a partir do diretório do
 * executável, subindo diretórios até achar o marcador.
 * @param {string} exeDir Diretório contendo o executável.
 * @returns {string} Raiz do pacote, ou '' se o marcador não for encontrado.
 */
export function localizarRaizPacote(exeDir) {
  if (!exeDir) return '';
  let dir = resolve(exeDir);
  for (let i = 0; i < 16; i += 1) {
    if (existsSync(join(dir, PULSO_MARCADOR_PORTAVEL))) {
      return dir;
    }
    const pai = dirname(dir);
    if (pai === dir) break;
    dir = pai;
  }
  return '';
}

/**
 * Detecta se a aplicação está em modo portátil.
 * @param {object} opcoes
 * @param {string|string[]} [opcoes.exeDir] Diretório do executável (packaged).
 * @param {boolean} [opcoes.portável=false] Se `PULSO_PORTABLE=1` foi forçado.
 * @returns {{ portable: boolean, motivo: string }}
 */
export function detectorPortabilidade({ exeDir = null, portável = false } = {}) {
  if (portável) {
    return { portable: true, motivo: 'ambiente' };
  }
  if (exeDir) {
    const raiz = localizarRaizPacote(exeDir);
    if (raiz !== '' && raiz !== exeDir) {
      return { portable: true, motivo: 'marcador' };
    }
  }
  return { portable: false, motivo: 'nenhum' };
}

/**
 * Resolve o diretório de dados do PULSO seguindo as regras acima.
 * @param {object} opcoes
 * @param {string|null} [opcoes.explicito] Valor de `process.env.PULSO_DIRETORIO_DADOS`.
 * @param {string|null} [opcoes.exeDir] Diretório do executável (packaged).
 * @param {string|null} [opcoes.appData] Diretório `appData` do sistema
 *   operacional (ex.: `~/.config` no Linux).
 * @param {boolean|null} [opcoes.portavel] Sobrescreve a leitura de
 *   `PULSO_PORTABLE` (`null`/ausente → lê o ambiente).
 * @returns {{portable: boolean, motivo: string, diretorioDados: string, raizPacote: string}}
 *   `raizPacote` é a raiz do pacote quando portátil (`''` caso contrário) —
 *   permite ao chamador montar caminhos auxiliares (ex.: `runtime/`) sem
 *   adivinhar a estrutura.
 */
export function resolverDiretórioDados({
  explicito = null,
  exeDir = null,
  appData = null,
  portavel = null,
} = {}) {
  const valorExplicito = explicito != null ? String(explicito).trim() : '';

  // 1. Override explícito (ambiente de testes manuais, CI).
  if (valorExplicito.length > 0) {
    return {
      portable: false,
      motivo: 'explicito',
      diretorioDados: resolve(valorExplicito),
      raizPacote: '',
    };
  }

  // 2. Modo portátil (parâmetro, variável PULSO_PORTABLE=1 ou marcador).
  const portavelForcado = portavel !== null
    ? Boolean(portavel)
    : process.env[PULSO_PORTABLE] === '1';
  const { portable, motivo } = detectorPortabilidade({ exeDir, portável: portavelForcado });
  if (portable) {
    // Sem marcador (modo forçado fora de um pacote), a raiz é o diretório
    // de trabalho atual — nunca um caminho absoluto da máquina de origem.
    const raiz = (typeof exeDir === 'string' && exeDir.length > 0
      ? localizarRaizPacote(exeDir)
      : '') || process.cwd();
    return {
      portable: true,
      motivo,
      diretorioDados: join(raiz, 'data'),
      raizPacote: raiz,
    };
  }

  // 3. Padrão: <appData>/pulso.
  const base = appData ?? process.cwd();
  return {
    portable: false,
    motivo: 'padrao',
    diretorioDados: join(resolve(base), 'pulso'),
    raizPacote: '',
  };
}
