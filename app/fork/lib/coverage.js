/*
 * coverage.js — E6 COBERTURA (nota 21): quantas peças BOAS a conta tem para o que os heróis pedem.
 * Só CLASSIFICAÇÃO e contagem (a nota por perfil vem do backend via itemRank; nenhuma conta de jogo).
 *
 *   analyze(items, perfis)       contexto: validade de cada peça para cada perfil (perfis = interest.buildProfiles)
 *   rows(ctx, group, opts)       linhas de demanda × oferta, gargalo primeiro. group:
 *                                  'slot'  peça · 'main' peça + mains aceitos · 'full' + UM set por linha · 'set' grupos de set
 *                                opts.profileId = só aquele perfil pedindo (bloco do arquétipo / aba do herói)
 *   funnel(ctx, row)             peças +15 → do set → principal aceito → passa na régua
 *   near(ctx, row, n)            +15 que servem mas ficam abaixo da régua, as mais perto primeiro
 *   profiles(ctx)                por perfil: peso e válidas por slot
 *   allocate(ctx, ordem)         ATENDIDOS: pela ordem dos heróis, cada um pega 1 válida por slot (a menos disputada)
 *   contention(ctx, id, self)    por slot: quantos OUTROS heróis Fav/Eq querem as mesmas peças válidas
 *
 * Regras (Eduardo, 2026-10-02):
 *   só +15 conta (abaixo do +15 não entra em nada)
 *   válida  = +15 · interest.fits (set aceito, sem set excluído, main aceito) · nota PARA o perfil (pedra do perfil) ≥ régua
 *   peso    = heróis Favoritos/Equipáveis que o perfil descreve (herói = 0/1; arquétipo = gêmeos Fav/Eq). Peso 0 não pede.
 *   demanda = slot/main: 1 por herói (na linha por set, a do slot repetida); set: peças exigidas (4 do set de 4, 2 do de 2;
 *             a lista de alternativas é um grupo)
 *   oferta  = peças do tipo válidas para ≥1 dos que pedem (contagem BRUTA: a peça conta para todos)
 *   melhor/média = da maior nota que cada peça da oferta tem para alguém que pede
 *   toda peça entra (equipada em qualquer herói, travada ou não).
 */
'use strict';
const interest = require('./interest.js');
const itemRank = require('./itemRank.js');
const gameRules = require('./gameRules.js');
const OP = require('./optimizerProfile.js');

const SLOTS = ['Weapon', 'Helmet', 'Armor', 'Necklace', 'Ring', 'Boots'];
const is15 = (it) => Number(it && it.enhance) === 15;
const sorted = (l) => (l || []).slice().sort();

function weightOf(p, tiers) {
  if (p.kind === 'h') return p.tier ? { w: 1, names: [p.name] } : { w: 0, names: [] };
  const names = (p.heroes || []).filter((n) => (p.tiers || tiers || {})[n]);
  return { w: names.length, names };
}

function analyze(items, profiles) {
  const list = (items || []).filter((it) => it && it.gear);
  const tiers = (profiles && profiles.tiers) || {};
  const P = (profiles || []).map((p) => {
    const { w, names } = weightOf(p, tiers);
    const valid = new Set();
    const fit = new Set();     // +15 que passam no set/main (antes da régua)
    const pct = new Map();
    list.forEach((it) => {
      if (!is15(it) || !interest.fits(it, p)) return;
      fit.add(it.id);
      const v = itemRank.potentialOf(it, p.id, p.gem);
      if (v == null) return;
      pct.set(it.id, v);
      if (v >= p.min) valid.add(it.id);
    });
    return { p, w, names, valid, fit, pct, rule: interest.setRule(p.sets) };
  });
  const byId = new Map(list.map((it) => [it.id, it]));
  // heróis Fav/Eq sem perfil (sem barras no Otimizador): não pedem peça
  const covered = new Set();
  P.forEach((x) => x.names.forEach((n) => covered.add(n)));
  const unprofiled = Object.keys(tiers).filter((n) => !covered.has(n)).sort();
  return { items: list, byId, P, unprofiled };
}

/* grupos de set que o perfil pede: [{ sets, pieces }] (cada lista escolhida = alternativas) */
function setDemands(p) {
  if (interest.setRule(p.sets).error) return [];
  return (p.sets || []).filter((l) => l && l.length).map((l) => ({ sets: sorted(l), pieces: gameRules.setPieces(l[0]) || 2 }));
}

/* as linhas de um perfil num slot: uma (peça / +principal) ou uma POR SET aceito ('full'; sem set fechando = "qualquer") */
function slotKeys(x, slot, group) {
  const mains = OP.MAIN_SLOTS.includes(slot) ? sorted((x.p.mains || {})[slot]) : [];
  const base = [slot];
  if (group !== 'slot') base.push(mains.join('|'));
  const one = (set, excl) => ({ key: base.concat(group === 'full' ? [set || '*', (excl || []).join('|')] : []).join('/'), slot,
    mains: group === 'slot' ? null : mains, set: set || null, sets: group === 'full' ? (set ? [set] : []) : null,
    exclude: group === 'full' && !set ? excl : null,
    inRow: set ? (it) => it.gear === slot && it.set === set : (it) => it.gear === slot });
  if (group !== 'full') return [one(null, null)];
  if (x.rule.restricted) return sorted(x.rule.allowed).filter((s, i, a) => a.indexOf(s) === i).map((s) => one(s, null));
  return [one(null, sorted(x.p.exclude))];
}

function rows(ctx, group, opts) {
  const g = group || 'slot';
  const only = opts && opts.profileId;
  const demanders = ctx.P.filter((x) => (only ? x.p.id === only : x.w > 0));
  const pool15 = {};
  SLOTS.forEach((s) => { pool15[s] = 0; });
  let all15 = 0;
  ctx.items.forEach((it) => { if (is15(it)) { pool15[it.gear] = (pool15[it.gear] || 0) + 1; all15++; } });
  const out = new Map();
  const add = (k, base, x, need, inRow) => {
    let r = out.get(k);
    if (!r) { r = Object.assign({ key: k, group: g, demand: 0, who: [], supplyIds: new Set() }, base, { inRow: undefined }); out.set(k, r); }
    r.demand += need;
    r.who.push(x);
    x.valid.forEach((id) => { if (inRow(ctx.byId.get(id))) r.supplyIds.add(id); });
  };
  const weight = (x) => (only ? Math.max(x.w, 1) : x.w);   // perfil escolhido sem Fav/Eq: mostra como se pedisse 1
  demanders.forEach((x) => {
    if (g === 'set') {
      setDemands(x.p).forEach((d) => add('set/' + d.sets.join('|'), { sets: d.sets, pieces: d.pieces, slot: null }, x,
        weight(x) * d.pieces, (it) => d.sets.includes(it.set)));
    } else {
      SLOTS.forEach((s) => slotKeys(x, s, g).forEach((k) => add(k.key, k, x, weight(x), k.inRow)));
    }
  });
  return Array.from(out.values()).map((r) => {
    const supply = r.supplyIds.size;
    const pool = r.slot ? pool15[r.slot] || 0 : all15;
    const best = [];
    r.supplyIds.forEach((id) => {
      let v = null;
      r.who.forEach((x) => { const p = x.valid.has(id) ? x.pct.get(id) : null; if (p != null && (v == null || p > v)) v = p; });
      if (v != null) best.push(v);
    });
    return Object.assign(r, { supply, cover: r.demand ? supply / r.demand : null, slotShare: pool ? supply / pool : null, pool,
      best: best.length ? Math.max(...best) : null, avg: best.length ? best.reduce((s, v) => s + v, 0) / best.length : null,
      who: r.who.map((x) => ({ p: x.p, w: x.w, names: x.names, supply: Array.from(r.supplyIds).filter((id) => x.valid.has(id)).length })) });
  }).sort((a, b) => (a.cover == null) - (b.cover == null) || (a.cover - b.cover) || (b.demand - a.demand) || a.key.localeCompare(b.key));
}

/* as peças +15 candidatas da linha (o slot e o set dela, ou o grupo de set) e os perfis que pedem */
function rowScope(ctx, row) {
  const ids = new Set(row.who.map((w) => w.p.id));
  const xs = ctx.P.filter((x) => ids.has(x.p.id));
  const inRow = row.slot ? (it) => it.gear === row.slot : (it) => row.sets.includes(it.set);
  return { xs, cands: ctx.items.filter((it) => is15(it) && inRow(it)) };
}

/* etapas: 'plus15' (as +15 do slot / dos sets) → 'set' (o set da linha, ou aceito) → 'main' → 'cut' */
function funnel(ctx, row) {
  const { xs, cands } = rowScope(ctx, row);
  const setOk = row.set ? (it) => it.set === row.set
    : (it) => xs.some((x) => (!x.rule.restricted || x.rule.allowed.includes(it.set)) && !(x.p.exclude || []).includes(it.set));
  const sSet = cands.filter(setOk);
  const sMain = sSet.filter((it) => xs.some((x) => x.fit.has(it.id)));
  const sCut = sMain.filter((it) => xs.some((x) => x.valid.has(it.id)));
  const st = [{ id: 'plus15', n: cands.length }];
  if (row.group !== 'set') st.push({ id: 'set', n: sSet.length });   // na linha de set as +15 já são do set
  return st.concat([{ id: 'main', n: sMain.length }, { id: 'cut', n: sCut.length }]);
}

function near(ctx, row, n) {
  const { xs, cands } = rowScope(ctx, row);
  const out = [];
  cands.forEach((it) => {
    if ((row.set && it.set !== row.set) || xs.some((x) => x.valid.has(it.id))) return;
    let best = null;
    xs.forEach((x) => {
      const v = x.pct.get(it.id);
      if (v != null && (!best || v - x.p.min > best.gap)) best = { item: it, p: x.p, pct: v, min: x.p.min, gap: v - x.p.min };
    });
    if (best) out.push(best);
  });
  return out.sort((a, b) => b.gap - a.gap).slice(0, n || 10);
}

function profiles(ctx) {
  return ctx.P.map((x) => {
    const slots = {};
    SLOTS.forEach((s) => { slots[s] = { valid: 0 }; });
    x.valid.forEach((id) => { slots[ctx.byId.get(id).gear].valid++; });
    return { p: x.p, w: x.w, names: x.names, slots };
  });
}

/*
 * ATENDIDOS (Eduardo, 2026-10-02): os heróis Fav/Eq na ORDEM da lista (`order` = nomes, prioridade do otimizador); cada um
 * pega, em cada slot, 1 peça válida ainda livre — a MENOS disputada pelos heróis de baixo (empate: a de maior nota para ele)
 * — e ela sai do estoque. Atendido = pegou nos 6 slots.
 * → { heroes: [{ name, p, got: {slot: id|null}, served }], byProfile: { id: { served, total, slots: {slot: n} } }, served, total }
 */
function allocate(ctx, order) {
  const pos = new Map((order || []).map((n, i) => [n, i]));
  const units = [];
  ctx.P.forEach((x) => x.names.forEach((n) => units.push({ name: n, x })));
  units.sort((a, b) => (pos.has(a.name) ? pos.get(a.name) : 1e9) - (pos.has(b.name) ? pos.get(b.name) : 1e9) || a.name.localeCompare(b.name, 'pt-BR'));
  const wants = new Map();   // id da peça → índices das unidades para quem ela é válida
  units.forEach((u, i) => u.x.valid.forEach((id) => { if (!wants.has(id)) wants.set(id, []); wants.get(id).push(i); }));
  const taken = new Set();
  const later = (id, i) => (wants.get(id) || []).filter((j) => j > i).length;
  const heroes = units.map((u, i) => {
    const got = {};
    SLOTS.forEach((s) => {
      let pick = null;
      u.x.valid.forEach((id) => {
        if (taken.has(id) || ctx.byId.get(id).gear !== s) return;
        const c = { id, claim: later(id, i), pct: u.x.pct.get(id) };
        if (!pick || c.claim < pick.claim || (c.claim === pick.claim && c.pct > pick.pct)) pick = c;
      });
      got[s] = pick ? pick.id : null;
      if (pick) taken.add(pick.id);
    });
    return { name: u.name, p: u.x.p, got, served: SLOTS.every((s) => got[s]) };
  });
  const byProfile = {};
  heroes.forEach((h) => {
    const b = byProfile[h.p.id] || (byProfile[h.p.id] = { served: 0, total: 0, slots: {} });
    b.total++;
    if (h.served) b.served++;
    SLOTS.forEach((s) => { b.slots[s] = (b.slots[s] || 0) + (h.got[s] ? 1 : 0); });
  });
  return { heroes, byProfile, served: heroes.filter((h) => h.served).length, total: heroes.length };
}

/* outros heróis Fav/Eq que disputam as peças válidas do perfil, por slot (`self` = quantos do próprio perfil não contam) */
function contention(ctx, profileId, self) {
  const me = ctx.P.find((x) => x.p.id === profileId);
  const out = {};
  SLOTS.forEach((s) => { out[s] = 0; });
  if (!me) return out;
  SLOTS.forEach((s) => {
    const mine = Array.from(me.valid).filter((id) => ctx.byId.get(id).gear === s);
    if (!mine.length) return;
    let n = Math.max(0, me.w - (self == null ? 1 : self));
    ctx.P.forEach((x) => { if (x !== me && x.w && mine.some((id) => x.valid.has(id))) n += x.w; });
    out[s] = n;
  });
  return out;
}

module.exports = { SLOTS, is15, analyze, rows, funnel, near, profiles, allocate, contention, setDemands };
