/*
 * optimizerProfile.js (fork) — a "caixa Personagem" da aba Otimizador ⇄ o pedido
 * do otimizador CLÁSSICO guardado no herói (hero.optimizationRequest).
 *
 * Decisão do Eduardo: o lugar da configuração é o PRÓPRIO otimizador. A aba lê e
 * grava hero.optimizationRequest (POST /heroes/saveOptimizationRequest) — assim o
 * clássico e o fork mostram sempre a mesma coisa. Só o arquétipo escolhido fica à
 * parte (relevance.json → profile.archetypeId), porque o clássico não tem esse campo.
 *
 * Aqui é só mapeamento de campos (nenhuma fórmula de stat):
 *   fromRequest(req)                  pedido do clássico -> perfil da tela
 *   toRequest(profile, existing, id)  perfil da tela -> pedido COMPLETO (mescla com o
 *                                     existente: o que a tela não mostra — filtro Top X%,
 *                                     limites de CP/dano, reforge… — fica como estava)
 *   applyArchetype(profile, arch)     o arquétipo SUBSTITUI sets, mains, prioridades e mín/máx
 *   applyArchetypeChange(p, old, new) só o que MUDOU de old para new vai para o perfil (gêmeo segue a edição do arquétipo)
 *
 * Prioridade na escala do clássico: -1 a 3, inteiro (o peso do filtro "Top X%").
 * Arquétipos usam a mesma escala e o mesmo formato.
 */
'use strict';

// ordem padrão do projeto; chave da tela -> sufixo dos campos do clássico
const STATS = ['atk', 'def', 'hp', 'spd', 'cr', 'cd', 'eff', 'res'];
const CAP = { atk: 'Atk', def: 'Def', hp: 'Hp', spd: 'Spd', cr: 'Cr', cd: 'Cd', eff: 'Eff', res: 'Res' };
const PRIORITY_MIN = -1;
const PRIORITY_MAX = 3;
const NO_MAX = 2147483647;   // Integer.MAX_VALUE: o "sem máximo" do backend
const MAIN_SLOTS = ['Necklace', 'Ring', 'Boots'];
const MAIN_FIELD = { Necklace: 'inputNecklaceStat', Ring: 'inputRingStat', Boots: 'inputBootsStat' };

const clampPrio = (v) => Math.max(PRIORITY_MIN, Math.min(PRIORITY_MAX, Math.round(Number(v) || 0)));
const arr = (v) => (Array.isArray(v) ? v.slice() : []);

function emptyProfile() {
  const stats = {};
  STATS.forEach((k) => { stats[k] = { priority: 0, min: null, max: null }; });
  return { sets: [[], [], []], exclude: [], mains: { Necklace: [], Ring: [], Boots: [] }, stats };
}

/* pedido do clássico -> perfil da tela (0 / MAX_VALUE viram "sem limite") */
function fromRequest(req) {
  const p = emptyProfile();
  if (!req) return p;
  p.sets = [arr(req.inputSetsOne), arr(req.inputSetsTwo), arr(req.inputSetsThree)];
  p.exclude = arr(req.inputExcludeSet);
  MAIN_SLOTS.forEach((s) => { p.mains[s] = arr(req[MAIN_FIELD[s]]); });
  STATS.forEach((k) => {
    const c = CAP[k];
    const mn = Number(req[`input${c}MinLimit`]);
    const mx = Number(req[`input${c}MaxLimit`]);
    p.stats[k] = {
      priority: clampPrio(req[`input${c}Priority`]),
      min: mn > 0 ? mn : null,
      max: mx > 0 && mx < NO_MAX ? mx : null,
    };
  });
  return p;
}

/*
 * perfil -> pedido completo para /heroes/saveOptimizationRequest. O backend
 * SUBSTITUI o pedido inteiro e exige `hero.id` — por isso mescla com o existente.
 * O filtro "Top X%" (inputFilterPriority) começa em 100 (desligado) quando não há
 * pedido anterior: é o padrão do clássico.
 */
function toRequest(profile, existing, heroId) {
  const req = Object.assign({}, existing || {});
  const p = profile || emptyProfile();
  req.inputSetsOne = arr(p.sets[0]);
  req.inputSetsTwo = arr(p.sets[1]);
  req.inputSetsThree = arr(p.sets[2]);
  req.inputSets = [req.inputSetsOne, req.inputSetsTwo, req.inputSetsThree];
  req.inputExcludeSet = arr(p.exclude);
  MAIN_SLOTS.forEach((s) => { req[MAIN_FIELD[s]] = arr(p.mains[s]); });
  STATS.forEach((k) => {
    const c = CAP[k];
    const s = p.stats[k] || {};
    req[`input${c}Priority`] = clampPrio(s.priority);
    req[`input${c}MinLimit`] = s.min != null && s.min > 0 ? Math.round(s.min) : 0;
    req[`input${c}MaxLimit`] = s.max != null && s.max > 0 ? Math.round(s.max) : NO_MAX;
  });
  if (req.inputFilterPriority == null) req.inputFilterPriority = 100;
  req.hero = { id: heroId };
  delete req.items;       // nunca reenviar a lista de itens de uma otimização antiga
  return req;
}

/*
 * Aplica um arquétipo (lib/archetypes.js — mesmo formato deste perfil): SUBSTITUI
 * sets, mains, prioridades e mín/máx (decisão do Eduardo, 2026-09-29: o herói fica
 * igual ao arquétipo; campo vazio no arquétipo apaga o do herói). O que o arquétipo
 * não tem (sets excluídos) fica como estava.
 */
const num = (v) => (v != null && v !== '' && isFinite(v) && Number(v) > 0 ? Number(v) : null);
function applyArchetype(profile, arch) {
  const p = JSON.parse(JSON.stringify(profile || emptyProfile()));
  if (!arch) return p;
  const sets = arr(arch.sets);
  p.sets = [0, 1, 2].map((i) => arr(sets[i]));
  MAIN_SLOTS.forEach((s) => { p.mains[s] = arr((arch.mains || {})[s]); });
  STATS.forEach((k) => {
    const a = (arch.stats || {})[k] || {};
    p.stats[k] = { priority: clampPrio(a.priority), min: num(a.min), max: num(a.max) };
  });
  return p;
}

/*
 * Edição do arquétipo levada ao herói GÊMEO (Eduardo, 2026-10-02): cada campo que mudou entre `before` e `after`
 * (set 1..3, mains de cada slot, prioridade/mín/máx de cada stat) recebe o novo valor; o resto do herói (inclusive
 * mín/máx próprios que o arquétipo não mexeu) fica.
 */
const same = (a, b) => JSON.stringify(a == null ? null : a) === JSON.stringify(b == null ? null : b);
function applyArchetypeChange(profile, before, after) {
  const p = JSON.parse(JSON.stringify(profile || emptyProfile()));
  if (!before || !after) return p;
  [0, 1, 2].forEach((i) => { if (!same((before.sets || [])[i], (after.sets || [])[i])) p.sets[i] = arr((after.sets || [])[i]); });
  MAIN_SLOTS.forEach((s) => { if (!same((before.mains || {})[s], (after.mains || {})[s])) p.mains[s] = arr((after.mains || {})[s]); });
  STATS.forEach((k) => {
    const b = (before.stats || {})[k] || {};
    const a = (after.stats || {})[k] || {};
    if ((b.priority || 0) !== (a.priority || 0)) p.stats[k].priority = clampPrio(a.priority);
    if (num(b.min) !== num(a.min)) p.stats[k].min = num(a.min);
    if (num(b.max) !== num(a.max)) p.stats[k].max = num(a.max);
  });
  return p;
}

module.exports = {
  applyArchetypeChange,
  STATS, CAP, PRIORITY_MIN, PRIORITY_MAX, NO_MAX, MAIN_SLOTS,
  emptyProfile, fromRequest, toRequest, applyArchetype,
};
