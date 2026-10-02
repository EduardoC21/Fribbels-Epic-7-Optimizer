/*
 * itemRank.js — as notas de uma peça, prontas para a tela (sem conta: vêm do backend
 * por lib/itemRatings.js; null = ainda não chegou → a tela mostra "—").
 *
 *   scoreOf(item)            Pontos de Equipamento do JOGO (inteiro; só informativo)
 *   potentialOf(item, perfil?)  potencial em % (0..100, passa de 100 com roll raro);
 *                            com perfil ('a:<arquétipo>' | 'h:<herói>') = da peça PARA ele
 *   rankOf(item, perfil?)    D → SSS+ a partir do potencial (Eduardo, 2026-09-29: rank e
 *                            potencial são quase a mesma coisa)
 *
 * Cortes em data/fork/gameRules.json → rankByPotential (Eduardo, 2026-09-30: 100·95·90·86·82·76·69, por qualidade de roll).
 */
'use strict';
const gameRules = require('./gameRules.js');
const ratings = require('./itemRatings.js');

const FALLBACK = [[100, 'SSS+'], [95, 'SSS'], [90, 'SS'], [86, 'S'], [82, 'A'], [76, 'B'], [69, 'C'], [0, 'D']];
function cuts() { return ((gameRules.load() || {}).rankByPotential || {}).cuts || FALLBACK; }

function scoreOf(item) {
  const r = ratings.get(item);
  return r && isFinite(r.score) ? Math.round(r.score) : null;
}

/* 85 +15 reforjável: o score do jogo SE reforjar (null nas demais) */
function scoreReforgedOf(item) {
  const r = ratings.get(item);
  return r && r.scoreReforged != null && isFinite(r.scoreReforged) ? Math.round(r.scoreReforged) : null;
}

/* notas do modo da pedra pedido (sem modo = o padrão da tela Equipamentos, itemRatings.currentGemMode) */
function modeOf(r, mode) {
  const bm = r.byMode && r.byMode[mode || ratings.currentGemMode()];
  return bm || r;   // backend antigo (sem byMode): o modo que ele calculou
}

/* potencial da peça (sem perfil) ou PARA um perfil no modo da pedra `mode` */
function potentialOf(item, profile, mode) {
  const r = ratings.get(item);
  if (!r) return null;
  const p = profile ? (modeOf(r, mode).profiles || {})[profile] : r.potential;
  return p == null || !isFinite(p) ? null : p * 100;
}

function rankFor(pct) {
  if (pct == null) return null;
  for (const [min, rank] of cuts()) if (pct >= min) return rank;
  return 'D';
}
const rankOf = (item, profile, mode) => rankFor(potentialOf(item, profile, mode));
/* a pedra simulada que deu a nota do perfil no modo: { line, from, to, value, rolls } (null = sem troca) */
function gemOf(item, profile, mode) {
  const r = ratings.get(item);
  if (!r || !profile) return null;
  return (modeOf(r, mode).gems || {})[profile] || null;
}
/* % para a TELA: truncado, como o rank (99,6% mostra 99, não 100 — senão "100%" aparece em SSS) */
const pctInt = (v) => (v == null || !isFinite(v) ? null : Math.floor(v + 1e-9));

module.exports = { scoreOf, scoreReforgedOf, potentialOf, rankOf, rankFor, pctInt, cuts, gemOf };
