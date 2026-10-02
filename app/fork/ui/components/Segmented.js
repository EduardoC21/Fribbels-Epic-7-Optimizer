/*
 * Segmented — escolha entre poucas opções mutuamente exclusivas, lado a lado
 * (ex.: o que o rodapé do card de item mostra: Rank ou Score).
 * `title` na opção vira tooltip + nome acessível (opção só de ícone).
 * Teclado no padrão de grupo de rádio: UMA parada de Tab (a opção escolhida);
 * ← → ↑ ↓ trocam a escolha e levam o foco junto.
 */
'use strict';
const { html } = require('../h.js');

function Segmented({ options, value, onChange, label, className }) {
  const opts = options || [];
  const cur = opts.findIndex((o) => o.value === value);
  function onKeyDown(e) {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (!step || !opts.length || !onChange) return;
    e.preventDefault();
    const i = ((cur < 0 ? 0 : cur) + step + opts.length) % opts.length;
    onChange(opts[i].value);
    const btn = e.currentTarget.children[i];
    if (btn) btn.focus();
  }
  return html`<span className=${'ui-seg' + (className ? ' ' + className : '')} role="radiogroup" aria-label=${label} onKeyDown=${onKeyDown}>
    ${opts.map((o, i) => html`<button type="button" key=${o.value}
      className=${'ui-seg-opt' + (o.value === value ? ' on' : '')}
      role="radio" aria-checked=${o.value === value} title=${o.title} aria-label=${o.title} tabIndex=${i === (cur < 0 ? 0 : cur) ? 0 : -1}
      onClick=${() => onChange && onChange(o.value)}>${o.label}</button>`)}
  </span>`;
}

module.exports = { Segmented };
