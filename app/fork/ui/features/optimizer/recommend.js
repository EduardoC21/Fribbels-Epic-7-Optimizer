/*
 * recommend.js — a parte PURA da caixa "Comunidade" da aba Otimizador: de onde
 * vêm as recomendações que o ← joga para o personagem.
 *
 * Fontes, nesta ordem (decisão do Eduardo, 2026-09-28):
 *   1. os ARQUÉTIPOS da aba Estatísticas (F.archetypeGroups) — sem "Todas" e sem
 *      "Sem arquétipo": mín = p25, máx = p75, recom. = mediana (a mesma faixa que a
 *      caixa Estatísticas mostra)
 *   2. as builds MARCADAS na aba Construções: uma build é um ponto só, então a
 *      faixa é ±1 roll máximo de substatus em volta do valor (ROLL)
 *
 * Tudo em stat FINAL (ATK 4.390, SPD 240, CC 100…) — a mesma unidade do mín/máx do
 * otimizador na caixa da esquerda, então aplicar é copiar o número.
 */
'use strict';
const statInfo = require('../../../lib/statInfo.js');
const F = require('../community/filters.js');

const KEYS = statInfo.GAME.map((e) => e.k);   // atk, def, hp, spd, cr, cd, eff, res

/*
 * 1 roll máximo de substatus (regra do Eduardo): ATK/DEF/HP = 8% da BASE do herói
 * (é o que um roll de ATK% etc. soma no stat final); EFF/RES 8; SPD 4; CC 5; CD 7.
 * ponytail: margem de busca do usuário, não número do jogo exibido — se um dia
 * precisar do roll exato por tier/raridade, vem do backend (gameRules/gearNeeded).
 */
const ROLL = { atk: 0.08, def: 0.08, hp: 0.08, spd: 4, cr: 5, cd: 7, eff: 8, res: 8 };
const OF_BASE = new Set(['atk', 'def', 'hp']);
function rollOf(k, base) {
  if (!OF_BASE.has(k)) return ROLL[k];
  const b = base && Number(base[k]);
  return b ? Math.round(b * ROLL[k]) : null;
}

/* marcada: ±1 roll em volta do valor (sem base conhecida, ATK/DEF/HP ficam sem faixa) */
function markedRows(stats, base) {
  const rows = {};
  KEYS.forEach((k) => {
    const v = stats ? stats[k] : null;
    const r = v == null ? null : rollOf(k, base);
    rows[k] = { rec: v == null ? null : v, lo: r == null ? null : Math.max(0, v - r), hi: r == null ? null : v + r };
  });
  return rows;
}

/* arquétipo: a faixa da caixa Estatísticas (p25–p75) e a mediana */
function groupRows(stats) {
  const rows = {};
  F.statRows(stats).forEach((s) => { rows[s.k] = { rec: s.median, lo: s.lo, hi: s.hi }; });
  return rows;
}

/* lista de fontes: arquétipos primeiro, depois as marcadas */
function sources(marked, groups, base) {
  const arch = (groups || []).filter((g) => g.id !== F.NONE).map((g) => ({
    key: 'ar-' + g.id, kind: 'arche', label: g.name,
    note: `arquétipo da aba Estatísticas: ${g.share}% das builds (${g.count})`,
    setIcons: [], stats: groupRows(g.stats),
  }));
  const mk = (marked || []).map((m) => ({
    key: 'mk-' + m.key, kind: m.origin, label: m.name,
    note: 'build marcada por você na aba Construções',
    setIcons: m.setIcons || [], stats: markedRows(m.stats, base),
  }));
  return arch.concat(mk);
}

/* um valor da faixa (`field` = 'lo' | 'hi') pronto para virar filtro: zero/ausente não vira */
function applicable(src, k, field) {
  const r = src && src.stats[k];
  const v = r && r[field];
  return v != null && isFinite(v) && v > 0 ? Math.round(v) : null;
}

/*
 * O ← de uma linha (Eduardo, 2026-09-28): Mín → MÍNIMO e Máx → MÁXIMO do stat no
 * otimizador. Devolve { min?, max? } ou null se não há nada a aplicar.
 */
function rowValues(src, k) {
  const out = {};
  const lo = applicable(src, k, 'lo');
  const hi = applicable(src, k, 'hi');
  if (lo != null) out.min = lo;
  if (hi != null) out.max = hi;
  return Object.keys(out).length ? out : null;
}

/* "todos": só o MÍNIMO dos stats com prioridade > 0 no personagem (os outros ficam) */
function applyAllValues(src, priorities) {
  const vals = {};
  KEYS.forEach((k) => {
    if (!((priorities || {})[k] > 0)) return;
    const v = applicable(src, k, 'lo');
    if (v != null) vals[k] = { min: v };
  });
  return vals;
}

module.exports = { sources, applicable, rowValues, applyAllValues, rollOf, KEYS };
