/*
 * gameData.js — fonte VIVA de sets do fork. Importa o constants.js do app (que o
 * upstream atualiza a cada set novo) em vez de hardcodar. Assim, set novo entra
 * automaticamente após o merge, sem mexer no nosso código.
 *
 * Único ponto que ainda pede 1 linha por set novo: o mapa código-do-jogo (set_xxx)
 * -> nome interno, que vem do scanner.js (não exportável). Tem fallback gracioso:
 * set desconhecido aparece como o próprio código em vez de quebrar.
 */
'use strict';

let constants = null;
try { constants = require('../../js/lib/constants.js'); } catch (e) { constants = null; }

// fallback caso o require do constants falhe (ex.: teste isolado): lista mínima conhecida
const FALLBACK_SETS = ['HealthSet', 'DefenseSet', 'AttackSet', 'SpeedSet', 'CriticalSet', 'HitSet', 'DestructionSet', 'LifestealSet', 'CounterSet', 'ResistSet', 'UnitySet', 'RageSet', 'ImmunitySet', 'PenetrationSet', 'RevengeSet', 'InjurySet', 'ProtectionSet', 'TorrentSet', 'ReversalSet', 'RiposteSet', 'WarfareSet', 'PursuitSet', 'WeakeningSet', 'FervorSet'];

// código do jogo (dados de /getBuilds e e7api) -> nome interno do set.
// Fonte: scanner.js `setsByIngameSet`. Set novo do jogo => adicionar 1 linha aqui.
const SET_CODE_TO_NAME = {
  set_acc: 'HitSet', set_att: 'AttackSet', set_coop: 'UnitySet', set_counter: 'CounterSet',
  set_cri_dmg: 'DestructionSet', set_cri: 'CriticalSet', set_def: 'DefenseSet', set_immune: 'ImmunitySet',
  set_max_hp: 'HealthSet', set_penetrate: 'PenetrationSet', set_rage: 'RageSet', set_res: 'ResistSet',
  set_revenge: 'RevengeSet', set_scar: 'InjurySet', set_speed: 'SpeedSet', set_vampire: 'LifestealSet',
  set_shield: 'ProtectionSet', set_torrent: 'TorrentSet', set_revenant: 'ReversalSet', set_riposte: 'RiposteSet',
  set_chase: 'PursuitSet', set_opener: 'WarfareSet', set_weak: 'WeakeningSet', set_might: 'FervorSet',
};

function setNames() {
  return (constants && Array.isArray(constants.setsByIndex) && constants.setsByIndex.length)
    ? constants.setsByIndex.slice()
    : FALLBACK_SETS.slice();
}
function sets() {
  const names = setNames();
  const pieces = (constants && constants.piecesBySetIndex) || [];
  return names.map((name, i) => ({ name, pieces: pieces[i] || 0 }));
}
function setPieces(name) {
  const s = sets().find((x) => x.name === name);
  return s ? s.pieces : 0;
}
function shortName(name) { return String(name).replace(/Set$/, ''); }

// código do jogo -> nome curto (para exibir combos de /getBuilds e e7api).
// Set desconhecido: devolve o código sem 'set_' em vez de quebrar (+ aviso no console).
const _warned = new Set();
function ingameSetShort(code) {
  const full = SET_CODE_TO_NAME[code];
  if (!full) {
    if (!_warned.has(code)) { _warned.add(code); try { console.warn('[fork] set desconhecido:', code, '— adicionar a gameData.SET_CODE_TO_NAME'); } catch (e) { /* */ } }
    return String(code).replace(/^set_/, '');
  }
  return shortName(full);
}

module.exports = { setNames, sets, setPieces, shortName, SET_CODE_TO_NAME, ingameSetShort, hasConstants: !!constants };
