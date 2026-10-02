/*
 * ArchetypeSymbol — o símbolo redondo de um arquétipo (lib/archetypes.js → symbol).
 *
 * Duas cores só: `bg` pinta o círculo, `fg` pinta todos os símbolos. Os símbolos são
 * os ícones do JOGO recoloridos por filtro SVG (a arte não é redesenhada):
 *   classe  ícone branco com contorno cinza → o BRANCO vira `fg`, o contorno some
 *           (limiar de luminância; só a forma de dentro fica)
 *   stat    ícone de uma cor só → a silhueta (alfa) vira `fg`
 *
 * Composição FIXA pela quantidade de subsímbolos (pedido do Eduardo, 2026-09-29):
 *   0  classe no centro
 *   1  classe um pouco à esquerda; o stat à direita, na mesma altura
 *   2  os dois stats empilhados à direita, o par centrado na altura da classe
 *   3  os três em ARCO em volta da classe, equidistantes; o do meio na altura dela
 * `layout(n)` é puro (testável): posições no viewBox 0..100.
 * Abaixo de 28px o símbolo mostra SÓ a classe (os stats ficariam com ~5px).
 */
'use strict';
const { html, useRef } = require('../h.js');
const assets = require('../../lib/assets.js');
const statInfo = require('../../lib/statInfo.js');

const R3 = 39;                               // raio do arco dos 3 stats (a partir do centro da classe)
const A3 = (42 * Math.PI) / 180;             // abertura do arco: ±42°
const r1 = (v) => Math.round(v * 10) / 10;
function layout(n) {
  if (!n) return { main: { x: 50, y: 50, s: 60 }, subs: [] };
  const mx = 39;
  if (n === 1) return { main: { x: mx, y: 50, s: 54 }, subs: [{ x: 76, y: 50, s: 30 }] };
  if (n === 2) return { main: { x: mx, y: 50, s: 52 }, subs: [{ x: 75, y: 35, s: 27 }, { x: 75, y: 65, s: 27 }] };
  const at = (a) => ({ x: r1(mx + R3 * Math.cos(a)), y: r1(50 - R3 * Math.sin(a)), s: 25 });
  return { main: { x: mx, y: 50, s: 46 }, subs: [at(A3), at(0), at(-A3)] };
}

// chave do otimizador (atk…res) -> ícone do jogo
const STAT_ICON = {};
statInfo.GAME.forEach((e) => { STAT_ICON[e.k] = assets.statIcon(e.icon); });

// limiar da classe: alfa = K·luminância + D (branco ≈ 1 → cheio; contorno cinza → 0)
const K = 3.2;
const D = -2.1;
const LUM = `0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  ${[0.2126, 0.7152, 0.0722].map((w) => (K * w).toFixed(3)).join(' ')} 0 ${D}`;

const SMALL = 28;

let seq = 0;
function ArchetypeSymbol({ symbol, size, title, className }) {
  const id = useRef(null);
  if (id.current == null) id.current = 'asy' + (++seq);
  const s = symbol || {};
  const px = size || 36;
  // abaixo de SMALL os stats viram borrão (~5px): só a classe, no centro (seletor, prévia mini)
  const subs = px < SMALL ? [] : (s.subs || []).slice(0, 3);
  const L = layout(subs.length);
  const fc = id.current + 'c';
  const fs = id.current + 's';
  const flood = { floodColor: s.fg || 'currentColor' };   // em style: aceita #hex e var(--token)
  const img = (href, p, f) => html`<image href=${href} x=${r1(p.x - p.s / 2)} y=${r1(p.y - p.s / 2)}
    width=${p.s} height=${p.s} filter=${`url(#${f})`} preserveAspectRatio="xMidYMid meet" />`;
  return html`<svg className=${'ui-asym' + (className ? ' ' + className : '')} viewBox="0 0 100 100"
    width=${px} height=${px} role=${title ? 'img' : undefined} aria-label=${title || undefined}
    aria-hidden=${title ? undefined : 'true'} focusable="false" data-tip=${title || undefined}>
    <defs>
      <filter id=${fc} colorInterpolationFilters="sRGB">
        <feColorMatrix type="matrix" values=${LUM} result="l" />
        <feComposite in="l" in2="SourceAlpha" operator="in" result="m" />
        <feFlood style=${flood} />
        <feComposite in2="m" operator="in" />
      </filter>
      <filter id=${fs} colorInterpolationFilters="sRGB">
        <feFlood style=${flood} />
        <feComposite in2="SourceAlpha" operator="in" />
      </filter>
    </defs>
    <circle className="ui-asym-bg" cx="50" cy="50" r="49" style=${{ fill: s.bg }} />
    ${s.main ? img(assets.klass(s.main), L.main, fc) : null}
    ${subs.map((k, i) => html`<g key=${k}>${img(STAT_ICON[k], L.subs[i], fs)}</g>`)}
  </svg>`;
}

module.exports = { ArchetypeSymbol, layout };
