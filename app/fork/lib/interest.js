/*
 * interest.js — QUEM se interessa por uma peça (classificação, sem conta de jogo:
 * o potencial por perfil vem do backend via itemRatings/itemRank).
 *
 * Perfis = arquétipos ('a:<id>') + heróis da conta com prioridade no Otimizador
 * ('h:<nome>'); os dois no formato do optimizerProfile (sets por slot, mains de
 * colar/anel/bota, prioridade −1..3 por stat).
 *
 *   setRule(sets)          sets como o otimizador: só restringem quando fecham as 6 peças; `error` = inválido
 *   fits(item, perfil)     a peça SERVE no perfil? set aceito pelo setRule (nenhum
 *                          escolhido = qualquer) e main dentro dos mains do slot (idem)
 *   ranked(item, perfis)   TODOS em que a peça serve (inclusive abaixo do corte; tela de Up: evolução)
 *   split(item, perfis)    só os que passam do CORTE, cada lista do maior para o menor: arquétipos (todos),
 *                          FAVORITOS e EQUIPÁVEIS (todos, mesmo passando do limite) e OUTROS (só o que falta para
 *                          completar o LIMITE de heróis); `heroes` = as três juntas (o herói gêmeo de um arquétipo
 *                          entra com a nota do arquétipo, `via`)
 *   interested(item, perfis)  os perfis dessas listas (arquétipos + heróis mostrados), do maior para o menor
 *   countOk(split)         quantos passam do corte (arquétipos + heróis) — a bolinha da tabela
 *   profileFor(perfis, k)  o perfil de uma escolha do filtro "Para" ('a:<id>' | 'h:<nome>';
 *                          herói gêmeo → o perfil do arquétipo)
 *   targets(perfis)        as escolhas do filtro "Para": arquétipos e heróis (gêmeos inclusos)
 *
 * Corte (`p.min`, % de potencial): herói → o dele, senão o do arquétipo dele, senão o global;
 * arquétipo → o dele, senão o global; global = relevance.interestMin, senão DEFAULT_MIN.
 * Herói IDÊNTICO a um arquétipo (barras + sets + mains; mín/máx livres) não aparece sozinho: entra em `p.heroes` do
 * arquétipo (gêmeo; usa a régua e a pedra dele). `twinAssignments` = gêmeos ainda não atribuídos (o app grava).
 * Pedra do perfil (`p.gem`, regra fixada da Cobertura): herói → arquétipo → relevance.profileGemMode → Sem troca.
 * `fits` respeita os sets EXCLUÍDOS do otimizador (`p.exclude`).
 * Regra dos heróis (Eduardo, 2026-10-01): favoritos, depois equipáveis (favorito ganha: favorito ⊂ equipável), depois
 * os outros até o LIMITE (relevance.interestLimit, padrão DEFAULT_LIMIT; vai em `perfis.limit`). Abaixo do corte nunca.
 * A nota PARA um herói (dono, filtro "Para") não depende disso.
 */
'use strict';
const OP = require('./optimizerProfile.js');
const itemRank = require('./itemRank.js');
const itemRatings = require('./itemRatings.js');
const targetBuild = require('./targetBuild.js');
const gameRules = require('./gameRules.js');
const heroList = require('./heroList.js');

/*
 * BASE de ATK/VIDA/DEF de cada perfil (o fixo vale 100 ÷ base no potencial por perfil —
 * Eduardo, 2026-09-30): herói = a base dele (lv60 6★ desperto, a mesma do otimizador);
 * arquétipo = média dos heróis que usam o arquétipo (atribuídos ou com as mesmas barras);
 * sem nenhum = média de todos os heróis do jogo. Só dado: a conta fica no backend.
 */
const BASE_KEYS = ['atk', 'hp', 'def'];
function heroBase(name) {
  let b = null;
  try { b = targetBuild.baseStats(name); } catch (e) { b = null; }
  return b && b.atk ? { atk: b.atk, hp: b.hp, def: b.def } : null;
}
function avgBase(list) {
  const ok = list.filter(Boolean);
  if (!ok.length) return null;
  const out = {};
  BASE_KEYS.forEach((k) => { out[k] = ok.reduce((s, b) => s + b[k], 0) / ok.length; });
  return out;
}
let allBase = null;
function gameAverageBase() {
  if (allBase) return allBase;
  let names = [];
  try { names = Object.keys(heroList.raw()); } catch (e) { names = []; }
  allBase = avgBase(names.map(heroBase)) || { atk: 1000, hp: 5500, def: 610 };   // sem herodata: média medida em 2026-09-30
  return allBase;
}
/* o que vai para o backend de cada perfil */
const forRatings = (profiles) => (profiles || []).map((p) => ({ id: p.id, prio: p.prio, mains: p.mains || {}, base: p.base || null }));

const DEFAULT_MIN = 69;   // = piso do rank C (Eduardo, 2026-09-30); editável na tela Equipamentos
const DEFAULT_LIMIT = 10;   // máximo de heróis interessados (favoritos/equipáveis passam dele; os outros completam)
const limitOf = (rel) => (rel && has(rel.interestLimit) ? Math.max(0, Number(rel.interestLimit)) : DEFAULT_LIMIT);

const prioOf = (stats) => {
  const out = {};
  OP.STATS.forEach((k) => { out[k] = (stats && stats[k] && stats[k].priority) || 0; });
  return out;
};

const has = (x) => x != null && isFinite(Number(x));
const globalMin = (rel) => (rel && has(rel.interestMin) ? Number(rel.interestMin) : DEFAULT_MIN);
const samePrio = (a, b) => OP.STATS.every((k) => (a[k] || 0) === (b[k] || 0));
const sameList = (a, b) => { const x = (a || []).slice().sort(); const y = (b || []).slice().sort(); return x.length === y.length && x.every((v, i) => v === y[i]); };
/*
 * GÊMEO (Eduardo, 2026-10-02): barras + sets (3 grupos, como conjunto) + mains de colar/anel/bota IGUAIS, e a RÉGUA e a
 * PEDRA também (herói sem valor próprio herda = igual; com valor próprio diferente do efetivo do arquétipo = variante).
 * Mín/máx livres. Sets excluídos não entram: o arquétipo não tem esse campo (só o otimizador clássico edita).
 */
const sameProfile = (a, prio, p) => samePrio(a.prio, prio)
  && [0, 1, 2].every((i) => sameList((a.sets || [])[i], (p.sets || [])[i]))
  && OP.MAIN_SLOTS.every((s) => sameList((a.mains || {})[s], (p.mains || {})[s]));
/* régua e pedra EFETIVAS de um arquétipo (próprias, senão as padrão) */
const archMin = (a, rel) => (a && has(a.interestMin) ? Number(a.interestMin) : globalMin(rel));
const archGem = (a, rel) => (a && gemOk(a.gemMode) ? a.gemMode : globalGem(rel));
/* a régua/pedra PRÓPRIAS do herói (`own` = relevance profile) batem com as do arquétipo? (sem própria = herda = bate) */
const sameRule = (own, min, gem) => (!own || !has(own.interestMin) || Number(own.interestMin) === min) && (!own || !gemOk(own.gemMode) || own.gemMode === gem);
/* o perfil do otimizador (formato optimizerProfile) é gêmeo do arquétipo? `own`/`rel` (opcionais) conferem régua e pedra */
const isTwinOf = (a, profile, own, rel) => !!a && !!profile && sameProfile({ prio: prioOf(a.stats), sets: a.sets, mains: a.mains }, prioOf(profile.stats), profile)
  && sameRule(own, archMin(a, rel), archGem(a, rel));
/* pedra do perfil (mesma herança da régua): herói → arquétipo → padrão dos perfis (relevance.profileGemMode, Sem troca) */
const DEFAULT_PROFILE_GEM = 'none';
const gemOk = (m) => itemRatings.GEM_MODES.includes(m);
const globalGem = (rel) => (rel && gemOk(rel.profileGemMode) ? rel.profileGemMode : DEFAULT_PROFILE_GEM);

/* arquétipos + heróis da conta (só quem tem alguma barra ≠ 0); `rel` = relevance.json (cortes) */
function buildProfiles(archetypes, heroesByName, rel) {
  const g = globalMin(rel);
  const gg = globalGem(rel);
  const heroProf = (n) => (rel && rel.heroes && rel.heroes[n] && rel.heroes[n].profile) || {};
  const tiers = {};   // nome → 'fav' | 'eq' (os demais heróis não se interessam por peça)
  Object.keys((rel && rel.heroes) || {}).forEach((n) => {
    const e = rel.heroes[n] || {};
    if (e.favorite) tiers[n] = 'fav';
    else if (e.equipavel) tiers[n] = 'eq';
  });
  const list = [];
  (archetypes || []).forEach((a) => list.push({ id: 'a:' + a.id, kind: 'a', name: a.name || 'Sem nome', symbol: a.symbol, sets: a.sets, mains: a.mains,
    prio: prioOf(a.stats), min: has(a.interestMin) ? Number(a.interestMin) : g, ownMin: has(a.interestMin),
    gem: gemOk(a.gemMode) ? a.gemMode : gg, ownGem: gemOk(a.gemMode), inhMin: g, inhGem: gg, exclude: [], heroes: [], tiers }));
  Object.keys(heroesByName || {}).forEach((n) => {
    const h = heroesByName[n];
    if (!h || !h.optimizationRequest) return;
    let p = null;
    try { p = OP.fromRequest(h.optimizationRequest); } catch (e) { p = null; }
    if (!p) return;
    const prio = prioOf(p.stats);
    const hp = heroProf(n);
    // idêntico a um arquétipo (o atribuído primeiro): o herói vai para a lista dele em vez de aparecer sozinho
    const twins = list.filter((x) => x.kind === 'a' && sameProfile(x, prio, p) && sameRule(hp, x.min, x.gem));
    const twin = twins.find((x) => x.id === 'a:' + hp.archetypeId) || twins[0];
    if (twin) { twin.heroes.push(n); return; }
    const arch = hp.archetypeId ? list.find((x) => x.id === 'a:' + hp.archetypeId) : null;
    const inhMin = arch && arch.ownMin ? arch.min : g;
    const inhGem = arch && arch.ownGem ? arch.gem : gg;
    const min = has(hp.interestMin) ? Number(hp.interestMin) : inhMin;
    const gem = gemOk(hp.gemMode) ? hp.gemMode : inhGem;
    list.push({ id: 'h:' + n, kind: 'h', name: n, sets: p.sets, mains: p.mains, exclude: p.exclude || [], prio, min, ownMin: has(hp.interestMin),
      gem, ownGem: gemOk(hp.gemMode), inhMin, inhGem, base: heroBase(n), tier: tiers[n] || null });
  });
  // base do arquétipo: média dos heróis dele (gêmeos + os que escolheram o arquétipo)
  list.forEach((a) => {
    if (a.kind !== 'a') return;
    const id = a.id.slice(2);
    const users = Object.keys((rel && rel.heroes) || {}).filter((n) => ((rel.heroes[n] || {}).profile || {}).archetypeId === id);
    const names = Array.from(new Set(a.heroes.concat(users)));
    a.base = avgBase(names.map(heroBase)) || gameAverageBase();
  });
  // sets que o otimizador recusa = perfil inválido (o editor dele mostra o aviso)
  const out = list.filter((p) => Object.keys(p.prio).some((k) => p.prio[k]) && !setRule(p.sets).error);
  out.limit = limitOf(rel);
  out.tiers = tiers;
  return out;
}

/* heróis gêmeos cujo archetypeId ainda não aponta para o arquétipo idêntico: [{ name, archetypeId }] (auto-atribuição) */
function twinAssignments(profiles, rel) {
  const out = [];
  (profiles || []).forEach((p) => {
    if (p.kind !== 'a') return;
    const id = p.id.slice(2);
    (p.heroes || []).forEach((n) => {
      const hp = (rel && rel.heroes && rel.heroes[n] && rel.heroes[n].profile) || {};
      if (hp.archetypeId !== id) out.push({ name: n, archetypeId: id });
    });
  });
  return out;
}

/*
 * SETS como o otimizador do clássico (optimizerTab.js getSetFormat / isFourAndTwoPieceSets /
 * isTwoAndTwoAndTwoPieceSets): os sets escolhidos só restringem a peça quando FECHAM as 6 peças
 * (4 peças no set1 e 2 peças no set2 ou set3; ou 2 peças nos três). Senão sobra espaço e qualquer
 * set serve. `error` = combinação que o otimizador recusa (perfil inválido: fica fora das notas).
 */
function setRule(sets) {
  const s = [0, 1, 2].map((k) => ((sets || [])[k] || []));
  const has = (list, n) => list.some((x) => gameRules.setPieces(x) === n);
  const TOP = 'Preencha os sets de cima para baixo (como no otimizador).';
  let error = null;
  if (!s[0].length) { if (s[1].length || s[2].length) error = TOP; }
  else if (has(s[0], 4)) {
    if (has(s[0], 2)) error = 'O set 1 precisa ser todo de 4 peças ou todo de 2 peças (como no otimizador).';
    else if (has(s[2], 2)) error = TOP;
  } else if (has(s[0], 2) && !s[1].length && s[2].length) error = TOP;
  const restricted = !error && ((has(s[0], 4) && (has(s[1], 2) || has(s[2], 2))) || (has(s[0], 2) && has(s[1], 2) && has(s[2], 2)));
  return { error, restricted, allowed: restricted ? [].concat(...s) : null };
}

function fits(item, p) {
  const rule = setRule(p.sets);
  if (rule.error) return false;
  if (rule.restricted && !rule.allowed.includes(item.set)) return false;
  if ((p.exclude || []).includes(item.set)) return false;   // sets excluídos do otimizador
  const mains = (p.mains || {})[item.gear];
  if (mains && mains.length && !mains.includes(item.main && item.main.type)) return false;
  return true;
}

/* todos em que a peça serve (sem a regra de favorito/equipável), maior primeiro; `ok` = passou do corte */
function rankedAll(item, profiles) {
  return (profiles || [])
    .filter((p) => fits(item, p))
    .map((p) => ({ p, pct: itemRank.potentialOf(item, p.id) }))
    .filter((x) => x.pct != null)
    .map((x) => Object.assign(x, { ok: x.pct >= (x.p.min == null ? DEFAULT_MIN : x.p.min) }))
    .sort((a, b) => b.pct - a.pct);
}
const ranked = rankedAll;

function split(item, profiles) {
  const ok = rankedAll(item, profiles).filter((x) => x.ok);
  const all = [];
  ok.forEach((x) => {
    const add = (name, tier, via) => all.push({ name, pct: x.pct, ok: true, p: x.p, via, tier: tier || null });
    if (x.p.kind === 'h') add(x.p.name, x.p.tier, null);
    else (x.p.heroes || []).forEach((n) => add(n, (x.p.tiers || {})[n], x.p));
  });
  all.sort((a, b) => b.pct - a.pct);
  const fav = all.filter((x) => x.tier === 'fav');
  const eq = all.filter((x) => x.tier === 'eq');
  const limit = profiles && profiles.limit != null ? profiles.limit : DEFAULT_LIMIT;
  const outros = all.filter((x) => !x.tier).slice(0, Math.max(0, limit - fav.length - eq.length));
  return { arch: ok.filter((x) => x.p.kind === 'a'), fav, eq, outros, heroes: fav.concat(eq, outros) };
}
/* os perfis das listas: arquétipos + heróis mostrados (o gêmeo vem pela linha do arquétipo) */
function interested(item, profiles) {
  const s = split(item, profiles);
  const shown = new Set(s.heroes.filter((h) => !h.via).map((h) => h.name));
  return rankedAll(item, profiles).filter((x) => x.ok && (x.p.kind === 'a' || shown.has(x.p.name)));
}
const countOk = (s) => s.arch.filter((x) => x.ok).length + s.heroes.filter((x) => x.ok).length;

function profileFor(profiles, key) {
  if (!key) return null;
  const list = profiles || [];
  const direct = list.find((p) => p.id === key);
  if (direct) return direct;
  const name = key.slice(0, 2) === 'h:' ? key.slice(2) : null;
  return name ? list.find((p) => p.kind === 'a' && (p.heroes || []).includes(name)) || null : null;
}

function targets(profiles) {
  const byName = (a, b) => a.name.localeCompare(b.name, 'pt-BR');
  const list = profiles || [];
  const arch = list.filter((p) => p.kind === 'a').map((p) => ({ key: p.id, kind: 'a', name: p.name, symbol: p.symbol })).sort(byName);
  const heroes = [];
  list.forEach((p) => {
    if (p.kind === 'h') heroes.push({ key: p.id, kind: 'h', name: p.name });
    else (p.heroes || []).forEach((n) => heroes.push({ key: 'h:' + n, kind: 'h', name: n, via: p }));
  });
  return arch.concat(heroes.sort(byName));
}

module.exports = { DEFAULT_PROFILE_GEM, globalGem, archMin, archGem, sameProfile, isTwinOf, twinAssignments, DEFAULT_MIN, DEFAULT_LIMIT, limitOf, globalMin, setRule, buildProfiles, fits, ranked, interested, split, countOk, profileFor, targets, prioOf, forRatings, heroBase, gameAverageBase };
