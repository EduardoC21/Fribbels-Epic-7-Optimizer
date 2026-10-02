/*
 * gameRules.js — carrega data/fork/gameRules.json (regras core de gear do E7).
 * Fonte única para as features do fork avaliarem peças (main/sub, rolls, reforja, pesos, sets).
 */
'use strict';
const fs = require('fs');
const path = require('path');
const paths = require('./forkPaths.js');


let _rules = null;
function load() {
  if (_rules) return _rules;
  _rules = JSON.parse(fs.readFileSync(path.join(paths.dataDir(), 'fork', 'gameRules.json'), 'utf8'));
  return _rules;
}

// helpers de conveniência
function mainStatsFor(slot) { return (load().mainStatsBySlot || {})[slot] || []; }
function substatsFor(slot) { return (load().substatsBySlot || {})[slot] || []; }
function initialSubstats(rank) { return (load().ranks.substatsIniciais || {})[rank] || 0; }
function maxRolls15(rank) { return (load().ranks.rollsAte15 || {})[rank] || 0; }
function gsWeight(stat) { return (load().gearScoreWeights || {})[stat] || 0; }
function setPieces(set) { return (load().sets.piecesRequired || {})[set] || 0; }

module.exports = { load, mainStatsFor, substatsFor, initialSubstats, maxRolls15, gsWeight, setPieces };
