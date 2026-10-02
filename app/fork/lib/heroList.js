/*
 * heroList.js — lê a base de heróis do jogo (data/cache/herodata.json) e devolve
 * uma lista simples para a janela nova. Desacoplado do app velho (não usa globals).
 */
'use strict';
const fs = require('fs');
const path = require('path');
const paths = require('./forkPaths.js');


let _cache = null;
let _raw = null;

// herodata bruto (self_devotion/ex_equip/skills/assets…), indexado por nome
function raw() {
  if (!_raw) {
    const file = path.join(paths.dataDir(), 'cache', 'herodata.json');
    _raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  }
  return _raw;
}
function rawByName(name) { return raw()[name] || null; }

function load() {
  if (_cache) return _cache;
  const file = path.join(paths.dataDir(), 'cache', 'herodata.json');
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  _cache = Object.keys(raw).map((name) => {
    const h = raw[name] || {};
    return {
      name,
      code: h.code || null,
      role: h.role || '',          // classe: warrior/knight/mage/ranger/assassin/manauser/soulweaver
      attribute: h.attribute || '', // fire/ice/earth/light/dark
      rarity: h.rarity || 0,
    };
  }).sort((a, b) => a.name.localeCompare(b.name));
  return _cache;
}

module.exports = { load, raw, rawByName };
