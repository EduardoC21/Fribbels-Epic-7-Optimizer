/*
 * Checkbox — o mesmo componente para marcar opção de filtro e para marcar
 * builds na lista. Quadrado arredondado, check em ciano quando ligado.
 * `readOnly` desliga o clique (quando quem controla é a linha inteira).
 */
'use strict';
const { html } = require('../h.js');
const { Glyph } = require('./glyphs.js');

const CHECK = html`<${Glyph} name="check" size=${10} strokeWidth=${3} />`;

function Checkbox({ checked, onChange, readOnly, label, className }) {
  const cls = ['ui-chk', checked ? 'on' : '', className || ''].filter(Boolean).join(' ');
  return html`<button type="button" className=${cls}
    role="checkbox" aria-checked=${!!checked} aria-label=${label}
    tabIndex=${readOnly ? -1 : 0}
    onClick=${readOnly ? undefined : (e) => { e.stopPropagation(); onChange && onChange(!checked); }}>
    ${CHECK}
  </button>`;
}

module.exports = { Checkbox };
