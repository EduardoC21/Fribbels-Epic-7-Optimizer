/*
 * Button / IconButton — variantes: default, accent (ação principal),
 * active (estado ligado), ghost. `sq` deixa o canto menos arredondado.
 */
'use strict';
const { html } = require('../h.js');

function Button({ variant, active, sq, disabled, title, onClick, className, style, children }) {
  const cls = ['ui-btn', variant || '', active ? 'active' : '', sq ? 'sq' : '', className || '']
    .filter(Boolean).join(' ');
  return html`<button type="button" className=${cls} style=${style} title=${title}
    disabled=${!!disabled} onClick=${onClick}>${children}</button>`;
}

/* Botão só de ícone. `label` é obrigatório: vira aria-label + title. */
function IconButton({ on, disabled, label, onClick, className, style, children }) {
  const cls = ['ui-iconbtn', on ? 'on' : '', className || ''].filter(Boolean).join(' ');
  return html`<button type="button" className=${cls} style=${style} title=${label} aria-label=${label}
    disabled=${!!disabled} onClick=${onClick}>${children}</button>`;
}

module.exports = { Button, IconButton };
