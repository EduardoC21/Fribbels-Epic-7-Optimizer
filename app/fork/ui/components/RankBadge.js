/*
 * RankBadge — rank do item, D→SSS+, nas mesmas cores dos imprints.
 * SSS+ não existe no imprint: é holográfico (estilo carta UR).
 * `title` (ou, sem ele, `score`) vira o tooltip.
 */
'use strict';
const { html } = require('../h.js');
const theme = require('../theme.js');

function RankBadge({ rank, score, title: tip, className }) {
  const r = String(rank || '').toUpperCase();
  const holo = r === 'SSS+';
  const cls = ['ui-rank', holo ? 'holo' : '', className || ''].filter(Boolean).join(' ');
  const title = tip || (score == null ? undefined : `Score ${score}`);
  return html`<span className=${cls} title=${title}
    style=${holo ? undefined : { color: theme.rankVar(r) }}>${r || '—'}</span>`;
}

module.exports = { RankBadge };
