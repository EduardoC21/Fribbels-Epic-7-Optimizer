/*
 * itemStats.js (fork) — traduz os tipos de stat de ITEM (main/substat) do backend
 * (ex.: "CriticalHitDamagePercent", "Speed", "HealthPercent") para rótulo curto,
 * ícone (chave de assets.statIcon) e formatação (% para escaláveis, flat p/ o resto).
 */
'use strict';

const MAP = {
  Attack: { label: 'ATK', icon: 'atk', pct: false },
  AttackPercent: { label: 'ATK', icon: 'atk', pct: true },
  Health: { label: 'HP', icon: 'hp', pct: false },
  HealthPercent: { label: 'HP', icon: 'hp', pct: true },
  Defense: { label: 'DEF', icon: 'def', pct: false },
  DefensePercent: { label: 'DEF', icon: 'def', pct: true },
  Speed: { label: 'SPD', icon: 'spd', pct: false },
  CriticalHitChancePercent: { label: 'CC', icon: 'chc', pct: true },
  CriticalHitDamagePercent: { label: 'CD', icon: 'chd', pct: true },
  EffectivenessPercent: { label: 'EFF', icon: 'eff', pct: true },
  EffectResistancePercent: { label: 'RES', icon: 'efr', pct: true },
};

/*
 * UPS de substatus (o que interessa mostrar).
 * O backend conta o roll INICIAL do substatus dentro de `rolls`, então todo
 * substatus vinha com pelo menos 1 e o item somava 9 — o que não quer dizer nada.
 * O que importa são só os aprimoramentos de +3/+6/+9/+12/+15 (máx. 5 por peça).
 * Confirmado no inventário real: Epic +15 soma 9 rolls (4 iniciais + 5 ups) e
 * Heroic +15 soma 8 (3 iniciais + 5 ups, sendo um deles o que criou o 4º substat).
 * Logo: ups = rolls − 1 para os substatus iniciais; substatus acrescentado depois
 * já vale como 1 up.
 */
const gameRules = require('./gameRules.js');
function initialSubstatCount(rank, len) {
  const R = gameRules.load() || {};
  const map = (R.ranks && R.ranks.substatsIniciais) || { Normal: 0, Good: 1, Rare: 2, Heroic: 3, Epic: 4 };
  const n = map[rank];
  return Math.min(n == null ? len : n, len);
}
function upgradeCounts(item) {
  if (!item || !item.substats) return [];
  const initial = initialSubstatCount(item.rank, item.substats.length);
  return item.substats.map((s, i) => Math.max(0, (s.rolls || 0) - (i < initial ? 1 : 0)));
}

function info(type) { return MAP[type] || { label: type, icon: null, pct: false }; }
function label(type) { const i = info(type); return i.label + (i.pct ? '%' : ''); }
function fmt(type, value) {
  const i = info(type);
  if (value == null || isNaN(value)) return '—';
  return i.pct ? value + '%' : Math.round(value).toLocaleString('pt-BR');
}

module.exports = { info, label, fmt, upgradeCounts, initialSubstatCount, MAP };
