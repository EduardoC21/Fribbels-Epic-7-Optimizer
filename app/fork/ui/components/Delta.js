/*
 * Delta — destaque de MUDANÇA de um número (subiu / desceu), num lugar só para o app inteiro.
 *
 *   <Delta v={número}>…o que mostra o número (texto, RankBadge…)…</Delta>
 *
 * Quando `v` muda depois do primeiro valor (recálculo: pedra, perfil, imprint, artefato, EE, peça
 * trocada/editada), o texto do conteúdo nasce na cor de "subiu"/"desceu" e volta à cor dele em fade.
 * O 1º valor (e "—" → número) não pisca. `inverse`: menor é melhor.
 * Ajuste (cor, tempo, intensidade) só nos tokens de ui/tokens.css: --chg-up, --chg-down, --chg-ms (total),
 * --chg-hold (% do tempo com a cor cheia antes de voltar), --chg-mix (intensidade, 0–100%). Sem layout novo: só cor.
 * Movimento reduzido no sistema = sem animação.
 */
'use strict';
const { html, useRef, useEffect } = require('../h.js');

let cfg = null;
const num = (x, d) => (isFinite(parseFloat(x)) ? parseFloat(x) : d);
function config() {
  if (cfg) return cfg;
  const st = getComputedStyle(document.documentElement);
  const read = (k, d) => (st.getPropertyValue(k) || '').trim() || d;
  cfg = {
    up: read('--chg-up', 'green'),
    down: read('--chg-down', 'red'),
    ms: num(read('--chg-ms', ''), 1600),
    mix: num(read('--chg-mix', ''), 100),
    hold: Math.max(0, Math.min(90, num(read('--chg-hold', ''), 0))) / 100,
  };
  return cfg;
}

/* "#4cc26a" | "rgb(…)" → [r,g,b]; mistura sem color-mix (o Chrome do Electron 16 não tem) */
function rgb(c) {
  const h = /^#([0-9a-f]{6})$/i.exec(c);
  if (h) return [0, 2, 4].map((i) => parseInt(h[1].slice(i, i + 2), 16));
  const m = /rgba?\(([^)]+)\)/.exec(c);
  return m ? m[1].split(',').slice(0, 3).map((x) => parseFloat(x)) : null;
}
function mix(a, b, pct) {
  const x = rgb(a); const y = rgb(b);
  if (!x || !y || pct >= 100) return a;
  const t = Math.max(0, pct) / 100;
  return `rgb(${x.map((v, i) => Math.round(v * t + y[i] * (1 - t))).join(',')})`;
}

const reduced = () => typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* anima a cor do elemento e de cada descendente com cor própria (RankBadge pinta a letra) */
function flash(el, up) {
  if (!el || !el.animate || reduced()) return;
  const c = config();
  const from = up ? c.up : c.down;
  [el].concat(Array.from(el.querySelectorAll('*'))).forEach((n) => {
    if (n.classList && n.classList.contains('holo')) return;   // SSS+ é degradê: não tem cor de texto para animar
    const to = getComputedStyle(n).color;
    const start = mix(from, to, c.mix);
    n.animate([{ color: start, offset: 0 }, { color: start, offset: c.hold }, { color: to, offset: 1 }],
      { duration: c.ms, easing: 'ease-out' });
  });
}

function useDelta(ref, v, inverse) {
  const prev = useRef(v);
  useEffect(() => {
    const p = prev.current;
    prev.current = v;
    if (p == null || v == null || !isFinite(p) || !isFinite(v) || Math.abs(v - p) < 1e-6) return;
    flash(ref.current, inverse ? v < p : v > p);
  }, [v]);
}

function Delta({ v, inverse, className, title, children }) {
  const ref = useRef(null);
  useDelta(ref, v, inverse);
  return html`<span ref=${ref} className=${'ui-delta' + (className ? ' ' + className : '')} title=${title}>${children}</span>`;
}

module.exports = { Delta, useDelta };
