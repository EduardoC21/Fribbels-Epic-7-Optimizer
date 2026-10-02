/*
 * filters.js — a parte PURA das abas Estatísticas e Construções (sem React):
 *   EMPTY            filtros vazios (Arquétipo · Set 1 · Set 2 · Set 3)
 *   applyFilters     aplica os filtros nas builds públicas
 *   archeOptions     arquétipos que APARECEM nas builds deste herói (nada inventado)
 *   archetypeGroups  as BUILDS baixadas separadas por ARQUÉTIPO (cada build num só):
 *                    % do total, atributos pretendidos, estatísticas e artefatos
 *   allGroup         o mesmo cálculo sobre TODAS as builds ("Todas")
 *   statRows         mediana + faixa (p25–p75) de cada stat, na ordem padrão
 *
 * Fonte: summary.picks.community = as builds cruas baixadas (communityBuilds), as
 * MESMAS da lista da aba Construções.
 */
'use strict';
const statInfo = require('../../../lib/statInfo.js');
const archetypes = require('../../../lib/archetypes.js');
const archeDetect = require('../../../lib/archeDetect.js');
const targetBuild = require('../../../lib/targetBuild.js');
const gameData = require('../../../lib/gameData.js');
const communityBuilds = require('../../../lib/communityBuilds.js');
const { normalizeSets } = require('../builds/buildRows.js');

const EMPTY = { arche: null, set1: null, set2: null, set3: null };

/*
 * Sets: cada Set escolhido exige UM set ativo daquele tipo na build. Escolher o
 * mesmo set duas vezes (ex.: Torrent em Set 2 e Set 3) exige DOIS pares dele.
 */
function hasSets(row, wanted) {
  const need = {};
  wanted.forEach((s) => { need[s] = (need[s] || 0) + 1; });
  const have = {};
  (row.setIcons || []).forEach((ic) => { have[ic.set] = (have[ic.set] || 0) + 1; });
  return Object.keys(need).every((s) => (have[s] || 0) >= need[s]);
}

function applyFilters(rows, f) {
  const wanted = [f.set1, f.set2, f.set3].filter(Boolean);
  return (rows || []).filter((r) => (!wanted.length || hasSets(r, wanted))
    && (!f.arche || (f.arche === NONE ? !r.arche : (r.arche && r.arche.id === f.arche))));
}

/* arquétipos presentes nas linhas (só o que a detecção achou para ESTE herói) */
function archeOptions(rows) {
  const seen = new Map();
  let none = false;
  (rows || []).forEach((r) => { if (!r.arche) none = true; else if (!seen.has(r.arche.id)) seen.set(r.arche.id, r.arche.name); });
  const out = [...seen.entries()].map(([value, label]) => ({ value, label }));
  if (none) out.push({ value: NONE, label: 'Sem arquétipo' });
  return out;
}

/*
 * As BUILDS baixadas separadas por arquétipo — CADA BUILD cai em UM grupo (o que a
 * detecção achar para os stats dela; nenhum = "Sem arquétipo"), então a soma dá
 * 100% das builds baixadas, sem descarte. É a MESMA detecção da lista da aba
 * Construções (buildRows.decorate), então filtrar lá dá as mesmas builds.
 *   share     % das builds baixadas naquele arquétipo
 *   intended  mediana dos atributos que o ARQUÉTIPO prioriza (barra 2 ou 3, até 4)
 *   stats     percentis de cada stat calculados DIRETO das builds do grupo
 *             (communityBuilds.statSummary — a mesma conta do resumo geral)
 *   artifacts os mais usados no grupo (% das builds do grupo)
 *
 * Antes (até 2026-09-28) o arquétipo era decidido por CLUSTER (pela mediana do
 * cluster), os clusters < 4% eram descartados e os percentis do grupo eram a MÉDIA
 * dos percentis dos clusters — por isso "Sem arquétipo" com 100% não batia com "Todas".
 */
const NONE = '_sem';
// barras do arquétipo em −1..3 (mesmas chaves da build): "pretendido" = barra 2 ou 3
function intendedKeys(arche) {
  const def = arche ? archetypes.get(arche.id) : null;
  const st = (def && def.stats) || {};
  const keys = Object.keys(st).filter((k) => (st[k].priority || 0) >= 2)
    .sort((a, b) => st[b].priority - st[a].priority).slice(0, 4);
  return keys.length ? keys : ['spd'];
}
// as MESMAS builds da lista da aba Construções (buildsList.collect: pros + community;
// desde 2026-09-27 os pros vêm vazios e todas as baixadas ficam em community)
const buildsOf = (summary) => {
  const p = (summary && summary.picks) || {};
  return (p.pros || []).concat(p.community || []);
};

/* um grupo de builds -> o que as caixas mostram (percentis direto das builds) */
function groupOf(builds, total, id, arche, name) {
  const stats = {};
  Object.keys(COMMUNITY_KEY).forEach((k) => {
    stats[COMMUNITY_KEY[k]] = communityBuilds.statSummary(builds.map((b) => Number(b.stats && b.stats[k]) || 0));
  });
  const intended = intendedKeys(arche).map((k) => {
    const e = statInfo.GAME.find((x) => x.k === k) || {};
    return { k, label: e.label, pct: e.pct, icon: e.icon, value: stats[COMMUNITY_KEY[k]].p50 };
  });
  const arts = new Map();
  builds.forEach((b) => { if (b.artifactCode) arts.set(b.artifactCode, (arts.get(b.artifactCode) || 0) + 1); });
  const artifacts = [...arts.entries()].map(([code, n]) => ({ code, pct: Math.round((100 * n) / builds.length) }))
    .sort((a, b) => b.pct - a.pct);
  return {
    id, arche, name, count: builds.length,
    share: Math.round((builds.length / (total || 1)) * 1000) / 10,
    intended, stats, artifacts,
  };
}

function archetypeGroups(summary, heroName) {
  const builds = buildsOf(summary);
  let base = null;
  try { base = targetBuild.baseStats(heroName); } catch (e) { base = null; }
  const agg = archeDetect.referenceAgg(base);
  const list = archetypes.list();
  const by = new Map();
  builds.forEach((b) => {
    const arche = agg ? archeDetect.detect(b.stats, list, agg) : null;
    const id = arche ? arche.id : NONE;
    if (!by.has(id)) by.set(id, { id, arche, name: arche ? arche.name : 'Sem arquétipo', list: [] });
    by.get(id).list.push(b);
  });
  return [...by.values()].map((g) => groupOf(g.list, builds.length, g.id, g.arche, g.name))
    .sort((a, b) => b.share - a.share);
}

/* "Todas": o mesmo cálculo, sobre todas as builds baixadas */
function allGroup(summary) {
  const builds = buildsOf(summary);
  return groupOf(builds, builds.length, null, null, 'Todas');
}

// mediana + faixa p25–p75 na ordem padrão (ATK, DEF, HP, SPD, CC, CD, EFF, RES)
const COMMUNITY_KEY = { atk: 'atk', def: 'def', hp: 'hp', spd: 'spd', cr: 'chc', cd: 'chd', eff: 'eff', res: 'efr' };
function statRows(stats) {
  if (!stats) return [];
  return statInfo.GAME.map((e) => {
    const s = stats[COMMUNITY_KEY[e.k]] || {};
    return { k: e.k, label: e.label, icon: e.icon, pct: e.pct, median: s.p50, lo: s.p25, hi: s.p75 };
  });
}

/* sets do RTA oficial ("set_cri_dmg","set_torrent") -> ícones */
function officialSetIcons(codes) {
  const icons = (codes || []).map((c) => {
    const set = gameData.SET_CODE_TO_NAME[c];
    return set ? { set, count: 0 } : null;
  }).filter(Boolean);
  return normalizeSets(icons);
}

/* opções dos filtros de set: todos os sets do jogo (fonte viva: constants.js) */
function setOptions() {
  return gameData.setNames().map((s) => ({ value: s, label: gameData.shortName(s) }));
}

module.exports = { EMPTY, NONE, applyFilters, hasSets, archeOptions, archetypeGroups, allGroup, intendedKeys, statRows, officialSetIcons, setOptions };
