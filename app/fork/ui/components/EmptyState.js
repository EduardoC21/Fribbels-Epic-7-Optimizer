/*
 * EmptyState — o padrão ÚNICO de "tela sem dados" (Eduardo, 2026-10-02). Três níveis no app:
 *   1. TELA ou ABA sem do que mostrar (sem conta, inventário vazio, herói fora da conta, nada baixado, nada criado):
 *      ESTE bloco — ícone + título curto (o que falta) + no máximo UMA ação — e NENHUMA moldura da tela (barra de
 *      filtros, cabeçalho, tabela vazia). `tip` (a explicação) vai só no title. `compact` = dentro de uma aba.
 *   2. Caixa/lista vazia DENTRO de uma tela com dados (filtro sem resultado, nada escolhido): área tracejada que
 *      ocupa a caixa, em branco, motivo no title (`.bt-empty`, `.cv-none`, `.eqw-empty`).
 *   3. Carregando: este bloco, sem ação.
 */
'use strict';
const { html } = require('../h.js');

// `icon` vai num círculo de 72px; `art` (ex.: o símbolo de exemplo dos Arquétipos) entra como está, no lugar dele
function EmptyState({ icon, art, title, tip, action, compact, className }) {
  return html`<div className=${'ui-empty' + (compact ? ' compact' : '') + (className ? ' ' + className : '')} title=${tip}>
    ${art || (icon ? html`<span className="ui-empty-icon" aria-hidden="true">${icon}</span>` : '')}
    <h2 className="ui-empty-title">${title}</h2>
    ${action || ''}
  </div>`;
}

module.exports = { EmptyState };
