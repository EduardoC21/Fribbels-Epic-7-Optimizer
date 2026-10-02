/*
 * itemRatings.js — notas de PEÇA pelo backend (/fork/itemRatings). Sem conta aqui:
 * este módulo só monta o pedido (tabelas do data/fork/gameRules.json + as peças +
 * os perfis) e guarda as respostas.
 *
 *   score       Pontos de Equipamento do JOGO (só informativo)
 *   potential   0..1 (passa de 1 com roll raro) contra a Épica de referência (85, ou 90 p/ 88/90)
 *               — é dele que sai o rank D→SSS+ (itemRank.js)
 *   profiles    { [perfil]: potencial da peça PARA ele } — perfis = arquétipos ('a:<id>')
 *               e heróis da conta com prioridade no Otimizador ('h:<nome>')
 *
 * Leitura SÍNCRONA pelo cache (`get(item)`): a tela desenha "—" até a resposta chegar (mudou a regra — perfis ou
 * pedra — a nota ANTIGA segue na tela até a nova chegar: nada pisca);
 * `ensure(items)` pede o que falta e avisa os ouvintes (o app re-renderiza).
 * A chave do cache é o CONTEÚDO da peça (rascunho do lote/popout também ganha nota).
 */
'use strict';
const backend = require('./backend.js');
const gameRules = require('./gameRules.js');

let upstreamIE = null;   // itemEdit (código do clássico) só quando precisar: evita carregar à toa
const isGaveleets = (it) => {
  try { upstreamIE = upstreamIE || require('./itemEdit.js'); return upstreamIE.isGaveleets(it); } catch (e) { return false; }
};

const nums = (o) => {
  const out = {};
  Object.keys(o || {}).forEach((k) => { if (typeof o[k] === 'number') out[k] = o[k]; });
  return out;
};

let rulesCache = null;
function rules() {
  if (rulesCache) return rulesCache;
  const R = gameRules.load() || {};
  const tiers = {};
  Object.keys(R.substatRollRangesByTier || {}).forEach((t) => {
    const x = R.substatRollRangesByTier[t];
    if (x && x.flat && x.percent) tiers[t] = { flat: x.flat, percent: x.percent };
  });
  const gs = R.gameScore || {};
  const rf = R.reforge_85_to_90 || {};
  const pr = R.potentialRules || {};
  const gemKind = pr.gemKind || 'greater';
  rulesCache = {
    weights: nums(R.gearScoreWeights),
    tiers,
    mainMax: gs.mainMax || {},
    mainPct: gs.mainPct || {},
    mainFactor: gs.mainFactor || 0,
    plainStats: R._plainStats || [],
    reforge: {
      flatBonusPorRoll: nums(rf.flatBonusPorRoll), plainStatRollsToValue: nums(rf.plainStatRollsToValue),
      critDamageRollsToValue: nums(rf.critDamageRollsToValue), speedRollsToValue: nums(rf.speedRollsToValue),
    },
    substatsBySlot: R.substatsBySlot || {},
    mainStatsBySlot: R.mainStatsBySlot || {},
    concentrationByUp: pr.concentrationByUp || [],
    subLadder: pr.subLadder || [1],
    subFit: Number(pr.subFit) || 1,
    mainLadder: pr.mainLadder || [1],
    negativeUpFactor: Number(pr.negativeUpFactor) || 0,
    rollsAt15: nums((R.ranks || {}).rollsAte15),
    rankPower: nums((R.ranks || {}).power),
    // pedra de troca: faixa por nº de rolls (a conta compara a peça 90 sem a reforja → tabela do 85;
    // a 88 fica no espaço da 90 → tabela da reforjada)
    gemTable: ((R.substatMods || {}).unreforged || {})[gemKind] || {},
    gemTableReforged: ((R.substatMods || {}).reforged || {})[gemKind] || {},
  };
  return rulesCache;
}

/* só o que a conta usa (e o que muda a nota) */
function toReq(it) {
  return {
    id: String(it.id || ''), gear: it.gear, rank: it.rank, level: Number(it.level) || 0, enhance: Number(it.enhance) || 0, gaveleets: isGaveleets(it), disableMods: !!it.disableMods,
    main: it.main ? { type: it.main.type, value: Number(it.main.value) || 0 } : null,
    substats: (it.substats || []).filter((s) => s && s.type)
      .map((s) => ({ type: s.type, value: Number(s.value) || 0, rolls: s.rolls == null ? null : Number(s.rolls), modified: !!s.modified })),
  };
}
const keyOf = (it) => JSON.stringify(toReq(it));

/* pedra de troca simulada no potencial por perfil (regra no Java, ForkItemRatings.gemMode) */
const GEM_MODES = ['none', 'safe', 'reversible', 'permanent'];
const DEFAULT_GEM_MODE = 'reversible';   // tela Equipamentos (a tela de herói começa em 'none': peça como está)
const GEM_MODE_LABEL = { none: 'Sem troca', safe: 'Sem perda', reversible: 'Com perda', permanent: 'Perda permanente' };
const GEM_MODE_TIP = {
  none: 'Peça como está',
  safe: 'Melhor troca que não baixa a peça',
  reversible: 'Aceita troca que baixa a peça, se outra pedra recupera',
  permanent: 'Aceita qualquer troca, mesmo perda definitiva',
};
let gemMode = DEFAULT_GEM_MODE;
let profiles = [];          // [{ id, prio, mains, base }]
let profilesKey = '';
const cache = new Map();    // chave da peça → resultado
// notas da regra ANTERIOR (perfis/pedra mudaram): seguem na tela até a nova chegar — sem "—" piscando
const stale = new Map();
const lastById = new Map();   // id da peça → última nota (peça editada/upada: a anterior segue até a nova chegar)
const retire = () => { cache.forEach((v, k) => stale.set(k, v)); cache.clear(); asked.clear(); };
const asked = new Set();
const listeners = new Set();

/* troca os perfis (arquétipos/heróis): as notas por perfil deixam de valer */
function setProfiles(list) {
  const clean = (list || []).filter((p) => p && p.id && p.prio && Object.keys(p.prio).some((k) => p.prio[k]));
  const key = JSON.stringify(clean);
  if (key === profilesKey) return false;
  profiles = clean;
  profilesKey = key;
  retire();
  return true;
}

/* modo da pedra PADRÃO de leitura (o da tela Equipamentos). O backend (v15) devolve os 4 modos juntos
   (`byMode`): trocar o modo não pede nada de novo — só muda qual nota a tela lê. */
function setGemMode(mode) {
  const m = GEM_MODES.includes(mode) ? mode : DEFAULT_GEM_MODE;
  if (m === gemMode) return false;
  gemMode = m;
  return true;
}
const currentGemMode = () => gemMode;

function get(it) {
  if (!it) return null;
  const k = keyOf(it);
  return cache.get(k) || stale.get(k) || (it.id != null && lastById.get(String(it.id))) || null;
}

function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }

/* pede ao backend as notas das peças que ainda não têm (em lotes) */
async function ensure(items) {
  const todo = [];
  (items || []).forEach((it) => {
    if (!it) return;
    const k = keyOf(it);
    if (cache.has(k) || asked.has(k)) return;
    asked.add(k);
    todo.push([k, toReq(it)]);
  });
  if (!todo.length) return 0;
  const pk = profilesKey;
  for (let i = 0; i < todo.length; i += 500) {
    const part = todo.slice(i, i + 500);
    try {
      const gm = gemMode;
      const r = await backend.forkItemRatings({ rules: Object.assign({}, rules(), { gemMode: gm, simulateGem: gm !== 'none', allowLossyGem: gm === 'permanent' }), items: part.map((x) => x[1]), profiles });
      if (pk !== profilesKey) return 0;   // perfis mudaram no meio: descarta
      part.forEach(([k, q], j) => { if (r[j]) { cache.set(k, r[j]); stale.delete(k); if (q.id) lastById.set(q.id, r[j]); } });
    } catch (e) {
      part.forEach(([k]) => asked.delete(k));   // tenta de novo na próxima vez
      throw e;
    }
  }
  listeners.forEach((fn) => { try { fn(); } catch (e) { /* ouvinte com erro não para os outros */ } });
  return todo.length;
}

module.exports = { rules, toReq, keyOf, setProfiles, setGemMode, currentGemMode, GEM_MODES, DEFAULT_GEM_MODE, GEM_MODE_LABEL, GEM_MODE_TIP, get, ensure, subscribe };
