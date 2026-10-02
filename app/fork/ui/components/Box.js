/* Box — painel padrão do projeto. `flush` remove padding (tabelas), `pad` adiciona. */
'use strict';
const { html } = require('../h.js');

function Box({ flush, pad, className, style, children }) {
  const cls = ['ui-box', flush ? 'flush' : '', pad ? 'pad' : '', className || ''].filter(Boolean).join(' ');
  return html`<div className=${cls} style=${style}>${children}</div>`;
}

/* Rótulo de seção (maiúsculas, accent) — usado no topo de cada coluna/caixa. */
function SectionLabel({ children, style }) {
  return html`<p className="label" style=${style}>${children}</p>`;
}

module.exports = { Box, SectionLabel };
