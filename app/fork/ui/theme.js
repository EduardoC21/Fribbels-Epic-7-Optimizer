/*
 * theme.js — as cores que precisam ser CALCULADAS em JS (as fixas ficam em
 * tokens.css). Aqui mora a única implementação do gradiente contínuo, para a
 * lista e as barras de qualidade usarem exatamente a mesma escala.
 */
'use strict';
const fs = require('fs');
const path = require('path');

// As âncoras vêm de tokens.css (fonte única): lidas do arquivo, não copiadas.
const TOKENS = fs.readFileSync(path.join(__dirname, 'tokens.css'), 'utf8');
const token = (name) => {
  const m = TOKENS.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`));
  if (!m) throw new Error(`theme.js: token --${name} ausente em tokens.css`);
  return m[1];
};
const STOPS = [0, 25, 50, 75, 100];
// heatmap (fundo de célula, vermelho→verde)
const HEAT = STOPS.map((s) => token(`heat-${s}`));
// barra de qualidade (primeiro plano, mais saturada)
const QUALITY = STOPS.map((s) => token(`q-${s}`));

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
function rgbToHex([r, g, b]) {
  const c = (n) => Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

/*
 * Interpola CONTINUAMENTE numa lista de âncoras. t vai de 0 (pior) a 1 (melhor).
 * É isto que dá o degradê fluido: a cor sai de qualquer ponto entre as âncoras,
 * não de 5 degraus fixos.
 */
function ramp(stops, t) {
  if (!isFinite(t)) return stops[0];
  const x = Math.max(0, Math.min(1, t)) * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(x));
  const f = x - i;
  const a = hexToRgb(stops[i]);
  const b = hexToRgb(stops[i + 1]);
  return rgbToHex([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f]);
}

/*
 * Cor de fundo de uma célula da lista.
 * `value` é posicionado entre o min e o max DAQUELA COLUNA, considerando apenas
 * as linhas filtradas (quem chama passa min/max já calculados sobre o filtro).
 * Coluna sem variação (min === max) não recebe cor: não há disparidade a mostrar.
 */
function heatColor(value, min, max) {
  if (value == null || !isFinite(value)) return null;
  if (!isFinite(min) || !isFinite(max) || max === min) return null;
  return ramp(HEAT, (value - min) / (max - min));
}

/*
 * Cor da barra de qualidade: proporção PERCENTUAL do que tenho sobre o que
 * preciso (não a diferença absoluta). ratio 1 = bateu o alvo.
 */
function qualityColor(ratio) {
  return ramp(QUALITY, ratio);
}

/* quanto da barra preencher (0..1), limitado a 100% */
function qualityFill(ratio) {
  if (!isFinite(ratio) || ratio <= 0) return 0;
  return Math.min(1, ratio);
}

/* cor do chevron de up do substatus — DISCRETO: 1..5 ups */
function upColor(ups) {
  const n = Math.max(0, Math.min(5, Math.round(ups || 0)));
  return n === 0 ? 'var(--text-3)' : `var(--up-${n})`;
}

/* escala de rank do item, na mesma ordem dos imprints */
const RANKS = ['D', 'C', 'B', 'A', 'S', 'SS', 'SSS', 'SSS+'];
function rankVar(rank) {
  const key = String(rank || '').toLowerCase().replace('+', '-plus');
  return `var(--rank-${key})`;
}

module.exports = { HEAT, QUALITY, ramp, heatColor, qualityColor, qualityFill, upColor, RANKS, rankVar };
