/*
 * rtaTiers.js — o que cada herói usou no último download (preferências por herói):
 *   tier  — de qual tier do RTA pra cima (padrão IMPERADOR)
 *   count — quantas builds de maior gear score (padrão 1.000)
 * Regra do Eduardo (2026-09-23): herói nunca baixado usa o padrão; depois de
 * baixar, ele guarda o que foi usado.
 * Arquivo: Documents/FribbelsOptimizerSaves/community/rta-tiers.json
 *   { [herói]: { tier, count } }   (formato antigo: { [herói]: "tier" } — ainda lido)
 */
'use strict';
const fs = require('fs');
const path = require('path');
const paths = require('./forkPaths.js');

const DEFAULT_TIER = 'emperor';
const DEFAULT_COUNT = 1000;

function file() { return path.join(paths.savesDir(), 'community', 'rta-tiers.json'); }

function load() {
  try { return JSON.parse(fs.readFileSync(file(), 'utf8')) || {}; } catch (e) { return {}; }
}

function save(map) {
  const f = file();
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f + '.tmp', JSON.stringify(map, null, 1));
  fs.renameSync(f + '.tmp', f);
}

const entry = (map, name) => { const v = map && map[name]; return typeof v === 'string' ? { tier: v } : (v || {}); };
const tierOf = (map, name) => entry(map, name).tier || DEFAULT_TIER;
const countOf = (map, name) => entry(map, name).count || DEFAULT_COUNT;
/* grava tier e/ou quantidade do herói, sem perder o outro */
function merge(map, name, patch) { return Object.assign({}, map, { [name]: Object.assign({}, entry(map, name), patch) }); }

module.exports = { DEFAULT_TIER, DEFAULT_COUNT, load, save, file, tierOf, countOf, merge };
