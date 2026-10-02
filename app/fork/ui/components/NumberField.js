/*
 * NumberField — campo numérico (mín/máx do otimizador, nível de artefato, EE).
 * Aceita vazio (= "sem limite"), que aparece como "—".
 *
 * Stepper — o mesmo campo com setas ◀ ▶ dos lados, para os bônus do herói:
 * dá pra clicar nas setas OU digitar, sempre preso ao intervalo [min, max]
 * e a valores inteiros.
 */
'use strict';
const { html } = require('../h.js');
const { Glyph } = require('./glyphs.js');

function clamp(n, min, max) {
  let v = n;
  if (min != null && v < min) v = min;
  if (max != null && v > max) v = max;
  return v;
}

function NumberField({ value, onChange, min, max, placeholder, title, label, className, style, disabled }) {
  const shown = value == null || value === '' ? '' : value;
  return html`<input type="number" className=${['ui-num', className || ''].filter(Boolean).join(' ')}
    style=${style} title=${title} aria-label=${label || title} placeholder=${placeholder || '—'} value=${shown}
    min=${min} max=${max} disabled=${!!disabled}
    onChange=${(e) => {
      const raw = e.target.value;
      if (raw === '') { onChange && onChange(null); return; }
      const n = Math.round(Number(raw));
      if (!isFinite(n)) return;
      onChange && onChange(clamp(n, min, max));
    }} />`;
}

function Stepper({ value, onChange, min, max, title, format }) {
  const v = Number(value) || 0;
  const step = (d) => onChange && onChange(clamp(Math.round(v + d), min, max));
  return html`<span className="ui-stepper" title=${title}>
    <button type="button" className="arw" aria-label="diminuir" onClick=${() => step(-1)}>
      <${Glyph} name="chevron-left" size=${13} />
    </button>
    ${format
      ? html`<span className="ui-num">${format(v)}</span>`
      : html`<${NumberField} value=${value} onChange=${onChange} min=${min} max=${max} label=${title} />`}
    <button type="button" className="arw" aria-label="aumentar" onClick=${() => step(1)}>
      <${Glyph} name="chevron-right" size=${13} />
    </button>
  </span>`;
}

module.exports = { NumberField, Stepper };
