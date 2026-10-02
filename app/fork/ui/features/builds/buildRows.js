/*
 * buildRows.js — a parte PURA da lista de builds (sem React), para poder ser
 * testada com dados reais:
 *   COLUMNS   quais números a lista mostra, na ordem, com sigla e nome
 *   rowsFor        linhas da aba Principal (equipada + salvas + marcadas)
 *   communityRows  linhas da aba Comunidade (as suas + pros + comunidade)
 *   ranges    min/max de cada coluna, só sobre as linhas VISÍVEIS (heatmap)
 *   sortRows  ordenação por coluna
 *
 * Serve à aba Principal agora e à Comunidade depois (mesmas colunas).
 */
'use strict';
const statInfo = require('../../../lib/statInfo.js');
const buildsList = require('../../../lib/buildsList.js');
const archetypes = require('../../../lib/archetypes.js');
const archeDetect = require('../../../lib/archeDetect.js');
const targetBuild = require('../../../lib/targetBuild.js');
const markedBuilds = require('../../../lib/markedBuilds.js');
const gc = require('../../../lib/gameConstants.js');
const heroBonus = require('../../../lib/heroBonus.js');
const forkCalc = require('../../../lib/forkCalc.js');

// siglas curtas dos stats do jogo (o nome inteiro vai no tooltip do cabeçalho)
const GAME_CODE = { atk: 'ATK', hp: 'HP', def: 'DEF', spd: 'SPD', cr: 'CC', cd: 'CD', eff: 'EFF', res: 'RES' };

const derived = (k) => statInfo.FRIBBELS.find((e) => e.k === k);
const fromDerived = (k) => { const e = derived(k); return { k: e.k, code: e.code, label: e.label }; };

/*
 * Mesma ordem dos blocos do topo: stats do jogo (ATK, DEF, HP, SPD, CC, CD,
 * EFF, RES), CP, os calculados na ordem oficial, o dano das 3 habilidades e as
 * duas pontuações por último.
 */
const COLUMNS = []
  .concat(statInfo.GAME.map((e) => ({ k: e.k, code: GAME_CODE[e.k], label: e.label, pct: e.pct })))
  .concat([{ k: 'cp', code: 'CP', label: 'Poder de combate' }])
  .concat(['hpps', 'ehp', 'ehpps', 'dmg', 'dmgps', 'mcdmg', 'mcdmgps', 'dmgh', 'dmgd'].map(fromDerived))
  .concat([1, 2, 3].map((n) => ({ k: 's' + n, code: 'S' + n, label: `Dano da habilidade ${n} (multiplicadores do herói)` })))
  .concat(['score', 'bs'].map(fromDerived));

// origens: o texto fica no tooltip, a linha mostra só o símbolo
const ORIGIN = {
  equipped: { label: 'Equipada agora' },
  saved: { label: 'Salva por você' },
  community: { label: 'Comunidade' },
  pro: { label: 'Pro (topo do gear score da base)' },
};

/* sets ativos de uma build salva, a partir dos ids dos itens */
function setsFromItems(ids, itemsById) {
  if (!ids || !itemsById) return [];
  const eq = {};
  ids.forEach((id, i) => { const it = itemsById[id]; if (it) eq[i] = it; });
  return buildsList.equipmentSetIcons(eq);
}

/*
 * Build só é comparável com as 6 peças. O backend também só calcula assim:
 * sem as 6, o herói chega com tudo ZERADO (HeroesRequestHandler.addStatsToHero —
 * `if (equipment.values().size() != 6) hero.setStats(new HeroStats())`).
 * Por isso a equipada incompleta não entra na lista.
 */
const SLOT_COUNT = 6;
function isComplete(acc) {
  const eq = (acc && acc.equipment) || {};
  return Object.keys(eq).filter((s) => eq[s]).length === SLOT_COUNT;
}

const idsOf = (equipment) => Object.keys(equipment || {}).map((s) => equipment[s] && equipment[s].id).filter(Boolean).sort().join(',');

/*
 * Um ícone por set ATIVO. A comunidade escreve "Torrent6" (3 pares num ícone só);
 * aqui vira 3 ícones de Torrent ×2 — é o que o jogador vê e o que os filtros contam.
 * A base pública conta PEÇAS por set, inclusive as soltas ({"set_coop":"1"}): peça
 * solta não ativa set e não vira ícone (era isso que mostrava 5 sets numa build).
 * `count` ausente/0 = "set ativo" (combos do RTA oficial, que só listam os ativos).
 */
function normalizeSets(icons) {
  const out = [];
  (icons || []).forEach((ic) => {
    const need = gc.piecesRequired(ic.set) || 2;
    const n = ic.count ? Math.floor(ic.count / need) : 1;
    for (let i = 0; i < n; i++) out.push({ set: ic.set, count: need });
  });
  return out.sort((a, b) => b.count - a.count);
}

/* nome legível das builds públicas: gear score + artefato (os sets já têm coluna) */
function publicName(r) {
  const art = r.artifactCode ? (heroBonus.artifactByCode(r.artifactCode) || r.artifactCode) : null;
  return [r.gs != null ? `GS ${r.gs}` : null, art].filter(Boolean).join(' · ') || 'build pública';
}

/* completa cada linha: sets, arquétipo sugerido, "em uso", chave de marcação, nome */
function decorate(rows, acc, heroName, itemsById) {
  let base = null;
  try { base = targetBuild.baseStats(heroName); } catch (e) { base = null; }
  const agg = archeDetect.referenceAgg(base);
  const list = archetypes.list();
  const equippedIds = acc ? idsOf(acc.equipment) : '';
  return rows.map((r) => {
    const setIcons = normalizeSets(r.origin === 'saved' ? setsFromItems(r.items, itemsById) : (r.setIcons || []));
    const arche = agg ? archeDetect.detect(r.stats, list, agg) : null;
    const inUse = r.origin === 'saved' && !!equippedIds && (r.items || []).slice().sort().join(',') === equippedIds;
    const pub = r.origin === 'pro' || r.origin === 'community';
    const markKey = pub ? markedBuilds.keyOf(r) : null;   // antes de renomear: a chave usa o nome original
    const name = pub && !r.marked ? publicName(r) : r.name;
    return Object.assign({}, r, { setIcons, arche, inUse, markKey, name });
  });
}

/* as da própria conta: a equipada (só com as 6 peças — ver isComplete) e as salvas */
function ownRows(acc, heroName) {
  if (!acc) return [];
  return buildsList.collect(acc, null, heroName)
    .filter((r) => (r.origin === 'equipped' && isComplete(acc)) || r.origin === 'saved');
}

/*
 * Aba Principal: equipada + salvas + as builds da comunidade/pros que o usuário
 * MARCOU na aba Comunidade (`marked` = lista do markedBuilds, já deste herói).
 */
function rowsFor(acc, heroName, itemsById, marked) {
  const own = ownRows(acc, heroName);
  const pub = (marked || []).map((m) => ({
    key: 'mk-' + m.key, origin: m.origin, name: m.name, stats: m.stats, setIcons: m.setIcons,
    gs: m.gs, date: m.date, artifactCode: m.artifactCode, winRate: m.winRate, marked: true,
    note: 'Marcada por você na aba Construções.',
  }));
  return decorate(own.concat(pub), acc, heroName, itemsById).map((r) => (r.marked ? Object.assign(r, { markKey: r.key.slice(3) }) : r));
}

/*
 * Aba Construções: SÓ as builds públicas (as da conta ficam na Principal).
 * `summary` = resumo do /getBuilds (communityBuilds); `official` = RTA oficial;
 * `computed` = { byKey } do forkCalc: os calculados que o BACKEND devolveu para
 * cada build pública. Sem ele, essas colunas ficam vazias ("—").
 */
function publicRows(acc, heroName, itemsById, summary, official, computed) {
  const byKey = (computed && computed.byKey) || {};
  const pub = (summary ? buildsList.collect(null, { community: summary, official }, heroName) : []).map((r) => {
    const d = byKey[forkCalc.calcKey(r.sets && r.sets[0], r.stats, r.gs, r.date)];
    return d ? Object.assign({}, r, { stats: Object.assign({}, r.stats, d) }) : r;
  });
  return decorate(pub, acc, heroName, itemsById);
}

/*
 * Uma build SALVA no formato de "herói da conta" que o topo já desenha (GameStats,
 * DerivedStats, GearGrid): os stats que o backend calculou para ela (com os bônus
 * atuais do herói) + as peças dela por slot. Cada peça continua dizendo com quem
 * está equipada agora (item.equippedByName) — é o que o card mostra no retrato.
 */
function savedBuildView(row, itemsById) {
  const equipment = {};
  (row.items || []).forEach((id) => { const it = itemsById && itemsById[id]; if (it && it.gear) equipment[it.gear] = it; });
  return Object.assign({}, row.stats, { equipment });
}

/* min/max por coluna sobre as linhas dadas (as visíveis, já filtradas) */
function ranges(rows, columns) {
  const out = {};
  (columns || COLUMNS).forEach((c) => {
    let min = Infinity, max = -Infinity;
    rows.forEach((r) => {
      const v = Number(r.stats && r.stats[c.k]);
      if (r.stats && r.stats[c.k] != null && isFinite(v)) { if (v < min) min = v; if (v > max) max = v; }
    });
    out[c.k] = { min, max };
  });
  return out;
}

/* sort = { k, dir: 'desc'|'asc' } ou null (ordem natural: equipada, depois salvas) */
function sortRows(rows, sort) {
  if (!sort || !sort.k) return rows;
  const sign = sort.dir === 'asc' ? 1 : -1;
  const val = (r) => { const v = Number(r.stats && r.stats[sort.k]); return isFinite(v) ? v : null; };
  return rows.slice().sort((a, b) => {
    const va = val(a), vb = val(b);
    if (va == null && vb == null) return 0;
    if (va == null) return 1;           // sem valor sempre por último
    if (vb == null) return -1;
    return (va - vb) * sign;
  });
}

/* clique no cabeçalho: maior primeiro → menor primeiro → ordem natural */
function nextSort(sort, k) {
  if (!sort || sort.k !== k) return { k, dir: 'desc' };
  if (sort.dir === 'desc') return { k, dir: 'asc' };
  return null;
}

module.exports = { COLUMNS, ORIGIN, isComplete, rowsFor, publicRows, decorate, normalizeSets, setsFromItems, savedBuildView, ranges, sortRows, nextSort };
