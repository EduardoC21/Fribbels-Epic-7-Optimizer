/*
 * gearList.js — a parte PURA da tela Equipamentos (sem React), testável com o
 * inventário real:
 *   EMPTY_FILTERS / applyFilters   o que a barra de filtros escolhe e quem passa
 *   SUB_COLUMNS                    colunas de substatus, na ordem do projeto
 *   subValue / ranges / sortItems  valor da célula, min/max p/ heatmap, ordenação
 *   options                        opções dos filtros (a partir do inventário)
 *
 * Regras de filtro: dentro de um grupo vale QUALQUER um (slot, set, main,
 * raridade, nível, aprimoramento); em Substatus a peça precisa ter TODOS.
 */
'use strict';
const itemStats = require('../../../lib/itemStats.js');
const itemRank = require('../../../lib/itemRank.js');
const gameData = require('../../../lib/gameData.js');
const gameRules = require('../../../lib/gameRules.js');

const SLOTS = ['Weapon', 'Helmet', 'Armor', 'Necklace', 'Ring', 'Boots'];
const RARITIES = [
  { value: 'Epic', label: 'Épica' }, { value: 'Heroic', label: 'Heroica' },
  { value: 'Rare', label: 'Rara' }, { value: 'Good', label: 'Boa' }, { value: 'Normal', label: 'Normal' },
];

// ATK, DEF, HP, SPD, CC, CD, EFF, RES — % antes do fixo
const SUB_TYPES = ['AttackPercent', 'Attack', 'DefensePercent', 'Defense', 'HealthPercent', 'Health', 'Speed',
  'CriticalHitChancePercent', 'CriticalHitDamagePercent', 'EffectivenessPercent', 'EffectResistancePercent'];
const NAME = {
  AttackPercent: 'Ataque %', Attack: 'Ataque', DefensePercent: 'Defesa %', Defense: 'Defesa',
  HealthPercent: 'Vida %', Health: 'Vida', Speed: 'Velocidade', CriticalHitChancePercent: 'Chance Crítica',
  CriticalHitDamagePercent: 'Dano Crítico', EffectivenessPercent: 'Eficácia', EffectResistancePercent: 'Resistência',
};
const SUB_COLUMNS = SUB_TYPES.map((t) => ({ k: t, code: itemStats.label(t), label: NAME[t], pct: itemStats.info(t).pct }));

// aprimoramento em faixas de up: +0–2, +3–5 … +12–14, +15
const ENH_BUCKETS = [0, 3, 6, 9, 12, 15];
const enhBucket = (e) => Math.min(15, Math.floor((Number(e) || 0) / 3) * 3);

const EMPTY_FILTERS = {
  slots: [], sets: [], mains: [], subs: [], ranks: [], levels: [], enh: [],
  owner: null,      // null = todas · '__eq' equipadas · '__free' soltas · id do herói
  lock: null,       // null · 'on' só travadas · 'off' só destravadas
  modified: false,  // só com substatus modificado (gema)
  target: null,     // filtro "Para": 'a:<arquétipo>' | 'h:<herói>' — só as peças que interessam a ele (tela)
};

function isEmpty(f) {
  return Object.keys(EMPTY_FILTERS).every((k) => (Array.isArray(EMPTY_FILTERS[k]) ? !f[k].length : f[k] === EMPTY_FILTERS[k]));
}

const hasSub = (it, t) => (it.substats || []).some((s) => s.type === t);

function passes(it, f) {
  if (f.slots.length && !f.slots.includes(it.gear)) return false;
  if (f.sets.length && !f.sets.includes(it.set)) return false;
  if (f.mains.length && !f.mains.includes(it.main && it.main.type)) return false;
  if (f.ranks.length && !f.ranks.includes(it.rank)) return false;
  if (f.levels.length && !f.levels.includes(Number(it.level))) return false;
  if (f.enh.length && !f.enh.includes(enhBucket(it.enhance))) return false;
  if (f.subs.length && !f.subs.every((t) => hasSub(it, t))) return false;
  if (f.owner === '__eq' && !it.equippedById) return false;
  if (f.owner === '__free' && it.equippedById) return false;
  if (f.owner && f.owner[0] !== '_' && it.equippedById !== f.owner) return false;
  if (f.lock === 'on' && !it.locked) return false;
  if (f.lock === 'off' && it.locked) return false;
  if (f.modified && !(it.substats || []).some((s) => s.modified)) return false;
  return true;
}

function applyFilters(items, f) { return (items || []).filter((it) => passes(it, f)); }

function subValue(it, t) {
  const s = (it.substats || []).find((x) => x.type === t);
  return s ? s.value : null;
}

/* valor de cada coluna ordenável (`ext.pot(it)` = potencial da peça ou do perfil do filtro "Para";
   `ext.int(it)` = nº de interessados — vêm da tela) */
function sortValue(it, k, ext) {
  if (k === 'level') return Number(it.level) || 0;
  if (k === 'enhance') return Number(it.enhance) || 0;
  if (k === 'score') { const s = itemRank.scoreOf(it); return s == null ? -Infinity : s; }
  if (k === 'pot' || k === 'rank') { const p = ext && ext.pot ? ext.pot(it) : itemRank.potentialOf(it); return p == null ? -Infinity : p; }
  if (k === 'int') { const p = ext && ext.int ? ext.int(it) : null; return p == null ? -Infinity : p; }
  const v = subValue(it, k);
  return v == null ? -Infinity : v;
}

/* mesma regra da lista de builds: maior primeiro → menor primeiro → natural (= mais nova primeiro) */
function nextSort(s, k) {
  if (!s || s.k !== k) return { k, dir: 'desc' };
  if (s.dir === 'desc') return { k, dir: 'asc' };
  return null;
}

/* id do jogo é sequencial: maior = mais nova (conferido 2026-10-02: 626 peças, ordem do id = ordem do `ct` de criação, 0 inversões).
   Peça cadastrada à mão (sem ingameId) fica em cima: foi criada agora, no app */
const recency = (it) => (it && it.ingameId ? Number(it.ingameId) || 0 : Infinity);

function sortItems(items, sort, ext) {
  if (!sort) return items.slice().sort((a, b) => (recency(b) > recency(a) ? 1 : recency(b) < recency(a) ? -1 : 0));   // padrão: mais nova primeiro
  const m = sort.dir === 'asc' ? 1 : -1;
  return items.slice().sort((a, b) => {
    const va = sortValue(a, sort.k, ext), vb = sortValue(b, sort.k, ext);
    if (va === vb) return 0;
    if (va === -Infinity) return 1;          // sem o stat: sempre no fim
    if (vb === -Infinity) return -1;
    return (va - vb) * m;
  });
}

/* min/max de cada coluna de substatus, só nas linhas visíveis (heatmap) */
function ranges(items) {
  const r = {};
  SUB_TYPES.forEach((t) => { r[t] = { min: Infinity, max: -Infinity }; });
  (items || []).forEach((it) => (it.substats || []).forEach((s) => {
    const x = r[s.type];
    if (!x) return;
    if (s.value < x.min) x.min = s.value;
    if (s.value > x.max) x.max = s.value;
  }));
  return r;
}

/* opções dos filtros; nível e dono vêm do que o inventário tem */
function options(items, heroesById) {
  const levels = Array.from(new Set((items || []).map((it) => Number(it.level)).filter((n) => n > 0))).sort((a, b) => b - a);
  const owners = {};
  (items || []).forEach((it) => { if (it.equippedById) owners[it.equippedById] = (owners[it.equippedById] || 0) + 1; });
  const heroes = Object.keys(owners)
    .map((id) => ({ id, name: (heroesById && heroesById[id] && heroesById[id].name) || id }))
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  const bySlot = (gameRules.load() || {}).mainStatsBySlot || {};
  const mains = [].concat(...SLOTS.map((s) => bySlot[s] || []));
  return {
    levels,
    heroes,
    sets: gameData.setNames(),
    mains: SUB_TYPES.filter((t) => mains.includes(t)),
  };
}

module.exports = {
  SLOTS, RARITIES, SUB_TYPES, SUB_COLUMNS, ENH_BUCKETS, EMPTY_FILTERS, NAME,
  enhBucket, isEmpty, passes, applyFilters, subValue, sortValue, nextSort, sortItems, ranges, options,
};
