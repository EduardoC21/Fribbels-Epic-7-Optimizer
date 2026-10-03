/*
 * coverageText.js — rótulos e ícones de uma linha da Cobertura (lib/coverage.js rows), comuns à
 * tabela e ao detalhe. Só texto/ícone: nenhuma conta.
 */
'use strict';
const { html } = require('../../h.js');
const { GearIcon, SetIcon, StatIcon, GameGlyph } = require('../../components/index.js');
const itemRatings = require('../../../lib/itemRatings.js');
const itemStats = require('../../../lib/itemStats.js');
const OP = require('../../../lib/optimizerProfile.js');
const { SLOT_PT } = require('../top/GearCard.js');
const G = require('../gear/gearList.js');

/* opções da pedra fixada do perfil (Cobertura, Otimizador do herói, editor de arquétipo) */
const GEM_OPTS = itemRatings.GEM_MODES.map((m) => ({ value: m, label: itemRatings.GEM_MODE_LABEL[m], icon: html`<${GameGlyph} name="modify" size=${13} />` }));
const setName = (s) => String(s || '').replace(/Set$/, '');
const pctTxt = (r) => (r == null ? '—' : `${Math.floor(r * 100 + 1e-9)}%`);

/* texto da linha: "Bota · Velocidade · Speed ou Immunity", "Speed ×4" */
function rowText(r) {
  if (r.group === 'set') return `${r.sets.map(setName).join(' ou ')} ×${r.pieces}`;
  const parts = [SLOT_PT[r.slot] || r.slot];
  if (r.mains && OP.MAIN_SLOTS.includes(r.slot)) parts.push(r.mains.length ? r.mains.map((m) => G.NAME[m] || m).join(' / ') : 'Qualquer principal');
  if (r.sets) parts.push(r.sets.length ? r.sets.map(setName).join(' ou ') : 'Qualquer set');
  if (r.exclude && r.exclude.length) parts.push('sem ' + r.exclude.map(setName).join(', '));
  return parts.join(' · ');
}

/* os ícones da linha: peça, principais (até 3) e sets (até 4) */
function RowIcons({ r }) {
  const mains = r.mains && OP.MAIN_SLOTS.includes(r.slot) ? r.mains : [];
  const sets = r.sets || [];
  return html`<span className="cv-icons">
    ${r.slot ? html`<${GearIcon} slot=${r.slot} size=${18} />` : ''}
    ${mains.slice(0, 3).map((m) => html`<${StatIcon} key=${m} stat=${itemStats.info(m).icon} size=${13} />`)}
    ${sets.slice(0, 4).map((s) => html`<${SetIcon} key=${s} set=${s} size=${16} />`)}
  </span>`;
}

module.exports = { GEM_OPTS, setName, pctTxt, rowText, RowIcons };
