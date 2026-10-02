/*
 * relevance.js — ranking pessoal do usuário + flags por herói.
 *
 * MODELO (revisado):
 *  - A LISTA É O PRÓPRIO RANK. `order` é a ordem de TODOS os heróis (1..N).
 *    Começa alfabética (order vazio) e só é materializada quando o usuário arrasta
 *    ou digita uma posição. Arrastar pra cima/baixo muda a posição no rank.
 *  - `favorite`: sinalizador visual/filtro. NÃO altera a posição no rank.
 *    Todo favorito é automaticamente "equipável".
 *  - `equipavel` ("quer equipamento"): herói que deve aparecer na relação
 *    "este herói quer este item". Todo favorito é equipável; nem todo equipável
 *    é favorito. Ao desfavoritar, o app pergunta se também remove de equipável.
 *  - `profile`: arquétipo aplicado (archetypeId) + corte de interesse próprio (interestMin, % de
 *    potencial; null = o do arquétipo, senão o global).
 *    `profile.gemMode` = pedra fixada do herói (regra da Cobertura; null = a do arquétipo, senão `profileGemMode`).
 *  - `profileGemMode` (raiz): pedra padrão dos perfis (Cobertura; ausente = Sem troca — lib/interest.js).
 *  - `interestMin` (raiz): corte GLOBAL de interesse das peças (lib/interest.js).
 *  - `gemMode` (raiz): pedra de troca simulada no potencial por perfil — none | safe | reversible |
 *    permanent (itemRatings.GEM_MODES; ausente = itemRatings.DEFAULT_GEM_MODE). Os antigos `simulateGem`/
 *    `lossyGem` (dois botões) migram: simulateGem false → none; lossyGem false → safe.
 *
 * Persistido em Documents/FribbelsOptimizerSaves/relevance.json.
 * Formato: { order: [nome...], heroes: { "<nome>": { favorite, equipavel, note, profile } },
 *           classicOrderImported }   ← a ordem do clássico já foi adotada uma vez (heroOrder.js)
 * A ordem dos heróis DA CONTA é empurrada para o backend (prioridade do otimizador).
 */
'use strict';
const fs = require('fs');
const path = require('path');
const paths = require('./forkPaths.js');

function file() { return path.join(paths.savesDir(), 'relevance.json'); }

// normaliza qualquer arquivo (inclui migração do formato antigo {nome:{favorite,rank,...}})
function normalize(raw) {
  if (!raw || typeof raw !== 'object') return { order: [], heroes: {} };
  if (raw.heroes && typeof raw.heroes === 'object') {
    const out = { order: Array.isArray(raw.order) ? raw.order.slice() : [], heroes: raw.heroes, classicOrderImported: !!raw.classicOrderImported };
    if (isFinite(Number(raw.interestMin)) && raw.interestMin != null) out.interestMin = Number(raw.interestMin);
    if (isFinite(Number(raw.interestLimit)) && raw.interestLimit != null) out.interestLimit = Number(raw.interestLimit);
    if (typeof raw.gemMode === 'string') out.gemMode = raw.gemMode;
    if (typeof raw.profileGemMode === 'string') out.profileGemMode = raw.profileGemMode;
    else if (raw.simulateGem === false) out.gemMode = 'none';
    else if (raw.lossyGem === false) out.gemMode = 'safe';
    return out;
  }
  // formato antigo: mapa nome -> {favorite, rank, note, profile}
  const heroes = {};
  const oldFav = [];
  for (const name of Object.keys(raw)) {
    const e = raw[name] || {};
    heroes[name] = { note: e.note || '', profile: e.profile || undefined };
    if (e.favorite) { heroes[name].favorite = true; heroes[name].equipavel = true; oldFav.push([name, e.rank || 999]); }
  }
  // preserva a ordem antiga dos favoritos no início do novo rank
  const order = oldFav.sort((a, b) => a[1] - b[1]).map((x) => x[0]);
  return { order, heroes };
}

function load() {
  try { return normalize(JSON.parse(fs.readFileSync(file(), 'utf8'))); }
  catch (e) { return { order: [], heroes: {} }; }
}
function save(state) {
  try { fs.writeFileSync(file(), JSON.stringify(state, null, 2)); return true; }
  catch (e) { return false; }
}

function entry(state, name) { return state.heroes[name] || null; }
function isFavorite(state, name) { const e = state.heroes[name]; return !!(e && e.favorite); }
function isEquipavel(state, name) { const e = state.heroes[name]; return !!(e && e.equipavel); }

function favoriteNames(state) { return Object.keys(state.heroes).filter((n) => state.heroes[n].favorite); }
function equipavelNames(state) { return Object.keys(state.heroes).filter((n) => state.heroes[n].equipavel); }

// ---- RANK (ordem global) ----
// devolve TODOS os nomes na ordem do rank. allNames = universo de heróis (não ordenado).
// order explícito primeiro (filtrado ao que existe), depois novos heróis em ordem alfabética.
function rankedNames(state, allNames) {
  const alpha = allNames.slice().sort((a, b) => a.localeCompare(b));
  if (!state.order || !state.order.length) return alpha;
  const set = new Set(allNames);
  const seen = new Set();
  const out = [];
  for (const n of state.order) { if (set.has(n) && !seen.has(n)) { out.push(n); seen.add(n); } }
  for (const n of alpha) { if (!seen.has(n)) out.push(n); }
  return out;
}
function rankOf(state, allNames, name) { return rankedNames(state, allNames).indexOf(name) + 1; }

function setOrder(state, orderedAll) {
  const next = { ...state, order: orderedAll.slice() };
  save(next); return next;
}
// 1ª sincronização com o clássico (lib/heroOrder.js): grava a ordem e marca que já importou
function adoptClassicOrder(state, orderedAll) {
  const next = { ...state, order: orderedAll.slice(), classicOrderImported: true };
  save(next); return next;
}
// arraste: coloca `name` imediatamente antes de `anchorName` (null = fim) na ordem GLOBAL.
// orderedAll deve conter todos os heróis (use rankedNames(state, allNames)).
function reorderBefore(state, orderedAll, name, anchorName) {
  const arr = orderedAll.slice();
  const from = arr.indexOf(name);
  if (from < 0) return state;
  arr.splice(from, 1);
  let to = anchorName ? arr.indexOf(anchorName) : arr.length;
  if (to < 0) to = arr.length;
  arr.splice(to, 0, name);
  return setOrder(state, arr);
}
// digitar posição (1-based) DENTRO DA LISTA VISÍVEL (filtrada): move `name` para essa posição.
// orderedAll = rank global; visibleNames = nomes exibidos no momento, em ordem de rank.
function reorderToVisiblePosition(state, orderedAll, visibleNames, name, pos1) {
  const others = visibleNames.filter((n) => n !== name);
  const idx = Math.max(0, Math.min(others.length, (parseInt(pos1, 10) || 1) - 1));
  const anchor = idx < others.length ? others[idx] : null;
  return reorderBefore(state, orderedAll, name, anchor);
}

// ---- flags ----
function setFavorite(state, name, on) {
  const cur = state.heroes[name] || {};
  const heroes = { ...state.heroes };
  if (on) heroes[name] = { ...cur, favorite: true, equipavel: true };
  else heroes[name] = { ...cur, favorite: false }; // equipavel decidido pelo app
  const next = { ...state, heroes };
  save(next); return next;
}
function setEquipavel(state, name, on) {
  const cur = state.heroes[name] || {};
  const heroes = { ...state.heroes };
  heroes[name] = { ...cur, equipavel: !!on };
  if (!on) heroes[name].favorite = false; // sair de equipável tira o favorito (favorito ⊂ equipável)
  const next = { ...state, heroes };
  save(next); return next;
}

// ---- perfil por herói ----
function setProfile(state, name, profile) {
  const cur = state.heroes[name] || {};
  const heroes = { ...state.heroes, [name]: { ...cur, profile } };
  const next = { ...state, heroes };
  save(next); return next;
}
function getProfile(state, name) { const e = state.heroes[name]; return (e && e.profile) || null; }

// ---- pedra de troca simulada no potencial por perfil (modo; null = o padrão) ----
function setGemMode(state, mode) {
  const next = { ...state };
  delete next.simulateGem; delete next.lossyGem;
  if (mode == null) delete next.gemMode; else next.gemMode = mode;
  save(next); return next;
}

// ---- pedra padrão dos perfis (Cobertura; null = Sem troca) ----
function setProfileGemMode(state, mode) {
  const next = { ...state };
  if (mode == null) delete next.profileGemMode; else next.profileGemMode = mode;
  save(next); return next;
}

// ---- corte global de interesse (null = volta ao padrão de lib/interest.js) ----
function setInterestMin(state, v) {
  const next = { ...state };
  if (v == null) delete next.interestMin; else next.interestMin = v;
  save(next); return next;
}

// ---- máximo de heróis interessados por peça (null = padrão de lib/interest.js) ----
function setInterestLimit(state, v) {
  const next = { ...state };
  if (v == null) delete next.interestLimit; else next.interestLimit = v;
  save(next); return next;
}

module.exports = {
  load, save, file,
  entry, isFavorite, isEquipavel, favoriteNames, equipavelNames,
  rankedNames, rankOf, setOrder, adoptClassicOrder, reorderBefore, reorderToVisiblePosition,
  setFavorite, setEquipavel, setProfile, getProfile, setInterestMin, setInterestLimit, setGemMode, setProfileGemMode,
};
