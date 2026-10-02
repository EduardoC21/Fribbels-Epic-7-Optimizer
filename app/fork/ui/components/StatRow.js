/*
 * StatRow — linha "ícone + nome … valor", usada nas colunas de status.
 * A ORDEM dos stats é sempre a mesma no projeto inteiro; ela vive em
 * lib/statInfo.js, não aqui.
 */
'use strict';
const { html } = require('../h.js');
const { StatIcon } = require('./Icon.js');

function StatRow({ stat, label, value, icon, title, className }) {
  return html`<div className=${['ui-statrow', className || ''].filter(Boolean).join(' ')} title=${title}>
    <span className="nm">
      ${icon !== false ? html`<${StatIcon} stat=${stat} />` : ''}
      <span className="ellipsis">${label}</span>
    </span>
    <span className="val">${value}</span>
  </div>`;
}

module.exports = { StatRow };
