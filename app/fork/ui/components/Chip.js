/*
 * Chip — pastilha com ícone + nome. Usada para set, arquétipo, fonte da build.
 * `onToggle` a torna clicável (filtro); sem ele vira só informativa (`static`).
 */
'use strict';
const { html } = require('../h.js');

function Chip({ on, icon, title, onToggle, className, children }) {
  const cls = ['ui-chip', on ? 'on' : '', onToggle ? '' : 'static', className || ''].filter(Boolean).join(' ');
  if (!onToggle) return html`<span className=${cls} title=${title}>${icon || ''}${children}</span>`;
  return html`<button type="button" className=${cls} title=${title}
    aria-pressed=${!!on} onClick=${onToggle}>${icon || ''}${children}</button>`;
}

module.exports = { Chip };
