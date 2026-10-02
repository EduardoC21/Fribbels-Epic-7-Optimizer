/*
 * markedBuilds.js (fork) — builds da comunidade/pros que o usuário MARCOU na aba
 * Comunidade para comparar na aba Principal.
 *
 * Guarda uma CÓPIA da build (stats, sets, gear score…), não só uma referência:
 * a seleção da comunidade muda a cada "Dados Comunidade" baixado, e a build
 * marcada não pode sumir por causa disso.
 *
 * Arquivo: Documents/FribbelsOptimizerSaves/marked-builds.json
 *   { version: 1, heroes: { "<nome>": [ { key, origin, name, stats, setIcons, gs, artifactCode, markedAt } ] } }
 */
'use strict';
const fs = require('fs');
const path = require('path');
const paths = require('./forkPaths.js');

function file() { return path.join(paths.savesDir(), 'marked-builds.json'); }

function empty() { return { version: 1, heroes: {} }; }

function load() {
  try {
    const raw = JSON.parse(fs.readFileSync(file(), 'utf8'));
    return raw && raw.heroes ? raw : empty();
  } catch (e) { return empty(); }
}

function save(state) {
  fs.writeFileSync(file(), JSON.stringify(state, null, 1));
  return state;
}

/*
 * Chave pelo CONTEÚDO da build (sets + stats + gear score + data), estável entre
 * downloads: a mesma build real da base sempre gera a mesma chave.
 */
function keyOf(row) {
  const s = row.stats || {};
  return [row.origin === 'pro' || row.origin === 'community' ? 'pub' : row.origin, row.name,
    s.atk, s.def, s.hp, s.spd, s.cr, s.cd, s.eff, s.res, row.gs, row.date].join('|');
}

function list(state, hero) { return (state.heroes[hero] || []).slice(); }
function isMarked(state, hero, key) { return (state.heroes[hero] || []).some((b) => b.key === key); }

/* só os campos necessários para redesenhar a linha depois */
function snapshot(row) {
  return {
    key: row.markKey || keyOf(row), origin: row.origin, name: row.name,
    stats: row.stats, setIcons: row.setIcons || [], gs: row.gs, date: row.date || null,
    artifactCode: row.artifactCode || null, winRate: row.winRate == null ? null : row.winRate,
    markedAt: new Date().toISOString(),
  };
}

/* liga/desliga — puro: devolve um estado NOVO */
function toggle(state, hero, row) {
  const key = row.markKey || keyOf(row);
  const cur = state.heroes[hero] || [];
  const next = cur.some((b) => b.key === key) ? cur.filter((b) => b.key !== key) : cur.concat([snapshot(row)]);
  const heroes = Object.assign({}, state.heroes);
  if (next.length) heroes[hero] = next; else delete heroes[hero];
  return Object.assign({}, state, { heroes });
}

module.exports = { file, load, save, keyOf, list, isMarked, toggle, snapshot };
