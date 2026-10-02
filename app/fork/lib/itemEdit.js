/*
 * itemEdit.js (fork) — edição de UMA peça, pelo MESMO código do app clássico.
 *
 * Decisão do Eduardo (2026-09-23): nada de reimplementar. O que o clássico faz no
 * front ao gravar uma peça (ItemAugmenter.augment: rolls estimados, valores
 * pós-reforja, origem Caça/Conversão, augmentedStats/reforgedStats, id novo) é
 * CHAMADO daqui via lib/upstream.js. Os fluxos espelham app/js/lib/dialog.js
 * (editGearDialog) e app/js/lib/tabs/itemsTab.js:
 *   editar    → augment → [unequip/equip] → /items/editItems
 *   reforjar  → level 90, main e subs = reforgedValue (o diálogo do clássico abre
 *               já assim) → mesma gravação da edição
 *   duplicar  → cópia sem id → augment (id novo) → /items/addItems
 *   remover   → /items/deleteItems
 * O gear score (wss/reforgedWss) quem calcula é o BACKEND ao gravar.
 *
 * Aqui só há DADO (tabelas do jogo) e regra de interface — nenhuma fórmula de stat.
 */
'use strict';
const upstream = require('./upstream.js');
const gameRules = require('./gameRules.js');
const gameData = require('./gameData.js');
const itemStats = require('./itemStats.js');
const mainCurve = require('./mainCurve.js');

const SLOTS = ['Weapon', 'Helmet', 'Armor', 'Necklace', 'Ring', 'Boots'];
const RANKS = ['Epic', 'Heroic', 'Rare', 'Good', 'Normal'];
const BASE_LEVELS = [85, 88];            // não existe peça nativa de nível 90: é a 85 reforjada
const MATERIALS = ['Hunt', 'Conversion', 'Unknown'];
const MAX_SUBS = 4;

/* os módulos do clássico chamam estes globais só no caminho de erro */
function ensureGlobals() {
  if (!global.Notifier) global.Notifier = { error: (m) => console.warn('[fork/item]', m), warn: (m) => console.warn('[fork/item]', m), info() {}, quick() {}, success() {} };
  if (!global.i18next) global.i18next = { t: (s) => s };
}

function mods() {
  ensureGlobals();
  const u = upstream.load();
  if (!u.ItemAugmenter || !u.Reforge) {
    throw new Error('não consegui carregar o código de itens do app clássico: ' + (u.errors.join('; ') || 'motivo desconhecido'));
  }
  return u;
}

const clone = (x) => JSON.parse(JSON.stringify(x));

/*
 * Roda o ItemAugmenter do clássico numa CÓPIA e devolve a cópia.
 * `fresh`: apaga os rolls antes (o diálogo do clássico sempre remonta os
 * substatus sem rolls, então eles são reestimados) — usado quando nível,
 * raridade ou aprimoramento mudaram e o nº de rolls guardado deixou de valer.
 */
// o painel da gema e a ficha pedem o augment do MESMO rascunho várias vezes por render
// (modOptions, lineRolls, modRange×2…): guarda o último por objeto e devolve CÓPIA
// (quem chama pode mexer no resultado — unreforged muda os substatus).
// ponytail: cache por identidade de objeto; vale porque o rascunho é imutável (setDraft cria outro).
const augMemo = new WeakMap();
function augment(item, opts) {
  const fresh = !!(opts && opts.fresh);
  if (!fresh && item && typeof item === 'object' && augMemo.has(item)) return clone(augMemo.get(item));
  const out = augmentNow(item, opts);
  if (!fresh && item && typeof item === 'object') augMemo.set(item, clone(out));
  return out;
}
function augmentNow(item, opts) {
  const { ItemAugmenter } = mods();
  const it = clone(item);
  it.main = it.main || {};
  it.substats = (it.substats || []).filter((s) => s && s.type && s.type !== 'None');
  if (opts && opts.fresh) it.substats.forEach((s) => { delete s.rolls; });
  delete it.alreadyPredictedReforge;
  ItemAugmenter.augment([it]);
  return it;
}

/* ---------- estado da peça ---------- */

const isPlus15 = (it) => Number(it && it.enhance) === 15;
function isReforgeableNow(it) {
  const { Reforge } = mods();
  return !!Reforge.isReforgeableNow(it);
}
function isGaveleets(it) {
  const { Reforge } = mods();
  return !!Reforge.isGaveleets(it);
}
/*
 * O que a coluna do meio da ficha mostra:
 *   'up'      → abaixo do +15: faixa de um up (mín · méd · máx) no nível da peça
 *   'reforge' → nível 85 no +15: o valor após a reforja
 *   null      → 88/90 no +15: nada a subir (a ficha usa a coluna para os ups em destaque;
 *               o valor sem reforja da 90 não aparece — pedido do Eduardo)
 */
function middleColumn(it) {
  if (!it) return null;
  if (!isPlus15(it)) return 'up';
  return isReforgeableNow(it) ? 'reforge' : null;
}

/* ---------- próximo up: faixa de UM roll (tabela do jogo, gameRules.json) ---------- */
const FLATS = ['Attack', 'Defense', 'Health'];
function upRange(it, type) {
  const tier = String(upstream.rollTier(it));
  const t = ((gameRules.load() || {}).substatRollRangesByTier || {})[tier];
  if (!t || !type) return null;
  let r = null;
  if (FLATS.includes(type)) r = ((t.flat || {})[type] || {})[it.rank] || null;
  else {
    const plain = ((gameRules.load() || {})._plainStats || []).includes(type);
    r = (t.percent || {})[plain ? 'Plain' : type] || null;
  }
  if (!r) return null;
  let [min, max] = r;
  if (type === 'Speed' && it.rank === 'Epic') min = Math.max(2, min);   // gameRules._epicSpeedMinIs2
  // rolls raros fora da faixa (velocidade 1 e 5 na 85): botões extras; o potencial segue a faixa normal
  const rare = ((t.rareMax || {})[type] > max) ? t.rareMax[type] : null;
  const rareLow = ((t.rareMin || {})[type] < min) ? t.rareMin[type] : null;
  return { min, max, avg: Math.round((min + max) / 2), rare, rareLow };
}

/* ---------- ups por linha (marcações ›››) ---------- */
/*
 * `rolls` (backend/jogo) conta o roll INICIAL dos substatus iniciais; ups = rolls − 1
 * neles, e substatus que entrou depois vale 1 up (lib/itemStats.upgradeCounts).
 * Regra do jogo, conferida nas 401 peças do inventário: a soma dos ups = aprimoramento ÷ 3.
 */
const MAX_UPS = 5;
function lineInitial(it, i) {
  return i < itemStats.initialSubstatCount(it.rank, subCount(it));
}
function minUps(it, i) { return lineInitial(it, i) ? 0 : 1; }
/* marca `n` ups na linha i (o usuário corrigindo à mão) */
function setUps(it, i, n) {
  const out = clone(it);
  const s = out.substats[i];
  if (!s) return out;
  const u = Math.max(minUps(it, i), Math.min(MAX_UPS, Math.round(n)));
  out.substats[i] = { ...s, rolls: u + (lineInitial(it, i) ? 1 : 0) };
  return out;
}
/* soma dos ups × o que o nível pede; null quando alguma linha ainda não tem rolls (o clássico estima) */
function upsCheck(it) {
  const subs = (it.substats || []).filter((s) => s && s.type);
  if (!subs.length || subs.some((s) => s.rolls == null)) return null;
  const sum = itemStats.upgradeCounts({ ...it, substats: subs }).reduce((a, b) => a + b, 0);
  const want = Math.floor((Number(it.enhance) || 0) / 3);
  return { sum, want, ok: sum === want };
}

/* ---------- aplicar um up (clique no valor do "Próximo up") ---------- */
/*
 * Regra do jogo: o up acontece a cada +3. Clicar num valor da faixa soma aquele
 * valor no substatus (+1 roll) e leva a peça ao próximo múltiplo de 3; se naquele
 * nível a peça ganha um substatus NOVO (Heroica no +12, Rara no +9…), o up é o
 * substatus novo (tipo escolhido pelo usuário, 1 roll). No +15 o main vai para o
 * valor do +15 (tabela do clássico, MainStatFixer — não depende da raridade,
 * conferido no inventário). Nos níveis do meio o main NÃO muda aqui: a tabela de
 * main por aprimoramento não existe no código do clássico (corrigir à mão).
 */
function nextUpLevel(it) {
  const e = Number(it && it.enhance) || 0;
  return e >= 15 ? null : Math.min(15, Math.floor(e / 3) * 3 + 3);
}
const subCount = (it) => (it.substats || []).filter((s) => s && s.type).length;
function upAddsSub(it) {
  const n = nextUpLevel(it);
  if (n == null) return false;
  const want = expectedSubCount({ ...it, enhance: n });
  return want != null && want > subCount(it);
}
/* valores clicáveis de um up: todos se a faixa for curta, senão 5 igualmente espaçados (os fixos);
   + os rolls raros fora da faixa, nas pontas */
const UP_STEPS = 5;
function upValues(range) {
  if (!range) return [];
  const lo = range.rareLow ? [range.rareLow] : [];
  const hi = range.rare ? [range.rare] : [];
  const span = range.max - range.min;
  const mid = span < UP_STEPS ? Array.from({ length: span + 1 }, (_, k) => range.min + k)
    : Array.from({ length: UP_STEPS }, (_, k) => Math.round(range.min + (span * k) / (UP_STEPS - 1)));
  return lo.concat(mid.filter((v, k, a) => a.indexOf(v) === k), hi);
}
/* main no +15 para o nível da peça (null = a tabela do clássico não cobre) */
function mainAt15(it) {
  const { MainStatFixer } = mods();
  const type = it.main && it.main.type;
  if (!MainStatFixer || !type) return null;
  const txt = MainStatFixer.fix({ mainStatText: type.replace(/Percent$/, ''), mainStatNumbers: /Percent$/.test(type) ? '0%' : '0' },
    it.gear, Number(it.level) || 85, 14);
  const v = parseInt(txt, 10);
  return v > 0 ? v : null;
}
/* `type` só quando o up cria substatus novo */
function applyUp(it, i, value, type) {
  const n = nextUpLevel(it);
  if (n == null) throw new Error('A peça já está no +15.');
  let rolls = null;
  try { const a = augment(it); rolls = a.substats[i] ? a.substats[i].rolls : null; } catch (e) { /* peça incompleta: sem estimativa */ }
  const out = clone(it);
  if (upAddsSub(it)) {
    if (!type) throw new Error('Neste up entra um substatus novo: escolha o atributo.');
    out.substats = (out.substats || []).filter((s) => s && s.type).concat([{ type, value: Number(value), rolls: 1 }]);
  } else {
    const s = out.substats[i];
    if (!s) throw new Error('Linha sem substatus.');
    out.substats[i] = { ...s, value: Number(s.value) + Number(value), rolls: (s.rolls || rolls || 1) + 1 };
  }
  out.enhance = n;
  const curve = mainCurve.get(it);   // main em cada +N pelo backend (lib/mainCurve.js); sem ela, só o +15 do clássico
  if (curve) out.main = { ...out.main, value: curve[n] };
  else if (n === 15) { const m = mainAt15(it); if (m != null) out.main = { ...out.main, value: m }; }
  return out;
}
/*
 * Baixar o aprimoramento DESFAZ os ups dados nesta edição (`history` = rascunhos
 * de antes de cada up, o último no fim). Sem histórico (nível que já veio do jogo)
 * só muda o número: não dá para saber quanto cada up somou.
 */
function setEnhance(draft, v, history) {
  let d = draft;
  const h = (history || []).slice();
  while (h.length && Number(d.enhance) > v) d = h.pop();
  if (d !== draft) return { draft: d, history: h };
  return { draft: { ...clone(draft), enhance: v }, history: h };
}

/* ---------- modificação (gema) ---------- */
/*
 * Regras do jogo (Eduardo, 2026-09-23): só no +15; só UM substatus por peça pode
 * ser modificado e, depois disso, só ELE pode ser modificado de novo.
 */
function modifiedIndex(it) {
  return (it.substats || []).findIndex((s) => s && s.modified);
}
function canModify(it, i) {
  if (!isPlus15(it) || !(it.substats || [])[i]) return false;
  const m = modifiedIndex(it);
  return m < 0 || m === i;
}
function modBlockReason(it, i) {
  if (!isPlus15(it)) return 'Só no +15';
  const m = modifiedIndex(it);
  if (m >= 0 && m !== i) return 'Só a linha já modificada';
  return null;
}
/* atributos que a gema pode pôr na linha i — `allowedMods` calculado pelo
   ItemAugmenter do clássico (tira o main, os outros substatus não modificados e
   as restrições de Arma/Armadura) + o PRÓPRIO atributo da linha, por último
   (`keep`: trocar por ele mesmo para subir um roll inicial baixo — Eduardo, 2026-09-30) */
function modOptions(it, i) {
  const a = augment(it);
  const allowed = String(a.allowedMods || '').split('|').filter(Boolean);
  const line = a.substats[i];
  if (!line) return [];
  return allowed.filter((t) => t !== line.type).map((t) => ({ type: t, keep: false }))
    .concat([{ type: line.type, keep: true }]);
}
/* nº de rolls da linha (o do jogo; se não houver, a estimativa do clássico) */
function lineRolls(it, i) {
  const a = augment(it);
  return (a.substats[i] && a.substats[i].rolls) || 1;
}
/* qual tabela de gema vale para a peça COMO ELA ESTÁ (o valor que sai no jogo agora): 90 → 'reforged',
   as demais → 'unreforged'. Na 85 que reforja, o jogo "casa" as duas (Eduardo, 2026-09-30): a reforja soma
   na linha modificada o mesmo bônus de um roll natural, e unreforged + bônus = reforged linha a linha
   (2 rolls de ATK% superior: 7–11 agora → 10–14 depois) — `modRange(..., 'reforged')` dá o equivalente. */
function modKind(it) {
  return Number(it && it.level) === 90 ? 'reforged' : 'unreforged';
}
const reforgesLater = (it) => Number(it && it.level) === 85 && !isGaveleets(it);
/* faixa [mín, máx] do valor que a gema dá: constants.modValues do clássico; `kind` força a tabela */
function modRange(it, i, gem, type, kindOverride) {
  const { Constants } = mods();
  const table = Constants && Constants.modValues;
  if (!table) return null;
  const kind = kindOverride || modKind(it);
  const rolls = Math.max(1, Math.min(6, lineRolls(it, i)));
  const row = (((table[kind] || {})[gem] || {})[type] || [])[rolls - 1];
  return row ? { min: row[0], max: row[1], rolls, kind } : null;
}
/* aplica a gema: troca atributo/valor, marca modificado, MANTÉM os rolls da linha */
function applyMod(it, i, type, value) {
  const out = clone(it);
  const s = out.substats[i];
  const rolls = s.rolls;
  out.substats[i] = { type, value: Number(value), modified: true };
  if (rolls != null) out.substats[i].rolls = rolls;
  return out;
}

/* ---------- reforja ---------- */
/* o que o clássico faz ao abrir o diálogo de reforja (dialog.js editGearDialog, useReforgedStats) */
function reforge(it) {
  const a = augment(it);
  if (!isReforgeableNow(a)) throw new Error('Só peça nível 85 no +15 pode ser reforjada (e o set de Gaveleet não reforja).');
  const out = clone(it);
  out.level = 90;
  out.main = { ...out.main, value: a.main.reforgedValue };
  // guarda os rolls usados: desfazer a reforja (unreforge) volta exatamente ao valor de antes
  out.substats = out.substats.map((s, k) => ({ ...s, value: a.substats[k].reforgedValue, rolls: a.substats[k].rolls }));
  return out;
}

/*
 * Valores SEM a reforja de uma peça nível 90: substatus pelo Reforge.unreforgeItem
 * do clássico (tira o bônus pelo nº de rolls) e main pela tabela de main por nível
 * do clássico (MainStatFixer, a mesma do OCR). null = não dá para calcular.
 */
function unreforged(it, level) {
  const { Reforge, MainStatFixer } = mods();
  if (Number(it.level) !== 90 || !Reforge.unreforgeItem) return null;
  let a;
  const warn = console.warn;
  console.warn = () => {};   // o unreforgeItem do clássico loga a peça inteira (depuração dele)
  try { a = augment(it); Reforge.unreforgeItem(a); } catch (e) { return null; } finally { console.warn = warn; }
  let main = it.main && it.main.value;
  const type = it.main && it.main.type;
  if (MainStatFixer && type) {
    // o fixer pensa em texto do OCR: "CriticalHitChance", "60%"… e só age abaixo do +15
    const txt = MainStatFixer.fix({ mainStatText: type.replace(/Percent$/, ''), mainStatNumbers: /Percent$/.test(type) ? '0%' : '0' },
      it.gear, level || 85, 14);
    if (parseInt(txt, 10) > 0) main = parseInt(txt, 10);
  }
  return { main, substats: a.substats.map((s) => s.unreforgedValue) };
}
/* desfaz a reforja: nível 90 → `level` (85), com os valores de antes */
function unreforge(it, level) {
  const u = unreforged(it, level);
  const out = clone(it);
  out.level = level;
  if (!u) return out;
  out.main = { ...out.main, value: u.main };
  out.substats = out.substats.map((s, k) => (u.substats[k] == null ? s : { ...s, value: u.substats[k] }));
  return out;
}

/* ---------- validação (as mesmas do diálogo do clássico) ---------- */
function validate(it) {
  const errs = [];
  if (!it.rank || !it.set || !it.gear || !it.main || !it.main.type || !it.main.value) {
    errs.push('Preencha peça, set, raridade, nível, aprimoramento e o main.');
  }
  const enh = Number(it.enhance);
  if (!(enh >= 0 && enh <= 15)) errs.push('Aprimoramento vai de 0 a 15.');
  const subs = (it.substats || []).filter((s) => s && s.type);
  const want = expectedSubCount(it);
  if (want != null && subs.length !== want) {
    errs.push(`Peça ${rankPt(it.rank)} +${enh} tem ${want} substatus no jogo (preenchidos: ${subs.length}).`);
  }
  if (subs.some((s) => !(Number(s.value) > 0))) errs.push('Substatus sem valor.');
  const types = subs.map((s) => s.type);
  if (new Set(types).size !== types.length) errs.push('Dois substatus com o mesmo atributo.');
  if (it.main && types.includes(it.main.type)) errs.push('Substatus igual ao main.');
  if (subs.filter((s) => s.modified).length > 1) errs.push('Só um substatus pode estar modificado.');
  const uc = upsCheck(it);
  if (uc && !uc.ok) errs.push(`Os ups somam ${uc.sum}, mas no +${enh} são ${uc.want}: ajuste as marcações de up em Editar campos.`);
  if (it.gear && it.main && it.main.type && !mainTypes(it.gear).includes(it.main.type)) errs.push('Esse main não existe nesse tipo de peça.');
  const wrong = subs.filter((s) => !s.modified && it.gear && !subTypes(it.gear).includes(s.type));
  if (wrong.length) errs.push('Substatus que não existe nesse tipo de peça.');
  return errs;
}

/*
 * Quantos substatus a peça tem no jogo: os iniciais da raridade; o substatus de
 * posição k (1..4) que ainda não existia nasce no +3·k (Heroica ganha o 4º no
 * +12, Rara o 3º no +9…) — é o que as travas de getItemReforgedStats e o
 * fixProblemItem do clássico assumem. Fora disso o reforge.js do clássico
 * quebra, por isso é validado antes.
 */
function expectedSubCount(it) {
  const initial = ((gameRules.load() || {}).ranks || {}).substatsIniciais || {};
  const n = initial[it.rank];
  const enh = Number(it.enhance);
  if (n == null || !(enh >= 0 && enh <= 15)) return null;
  return Math.min(MAX_SUBS, Math.max(n, Math.floor(enh / 3)));
}
const RANK_PT = { Epic: 'Épica', Heroic: 'Heroica', Rare: 'Rara', Good: 'Boa', Normal: 'Normal' };
const rankPt = (r) => RANK_PT[r] || r || '';

/*
 * Quando os rolls guardados deixam de valer (o clássico reestima): só se a RARIDADE
 * mudou (muda quantos substatus são iniciais). Aprimoramento/nível NÃO: os ups agora
 * são marcados na tela (up clicável, desfazer, correção à mão) e reestimar apagaria isso.
 */
function needsFreshRolls(before, after) {
  if (!before) return true;
  return String(before.rank) !== String(after.rank);
}

/* peça pronta para o backend: augment do clássico + dono */
function prepare(draft, original) {
  const fresh = needsFreshRolls(original, draft);
  // rolls que o clássico vai reestimar não entram na conta da soma dos ups
  const errs = validate(fresh ? { ...draft, substats: (draft.substats || []).map((s) => (s ? { ...s, rolls: null } : s)) } : draft);
  if (errs.length) { const e = new Error(errs.join(' ')); e.validation = errs; throw e; }
  let out;
  try { out = augment(draft, { fresh }); }
  catch (e) { throw new Error('o código de itens do app clássico recusou a peça: ' + e.message); }
  if (original && original.id) out.id = original.id;
  /* origem escolhida à mão vence a detecção pelo nome (no clássico o select era sobrescrito) */
  if (draft.material && original && draft.material !== original.material) out.material = draft.material;
  return out;
}

/*
 * Grava a edição. `api` = lib/backend.js (injetável para teste).
 * Ordem: sair do herói antigo quando o tipo de peça muda (o herói guarda a peça
 * pelo tipo) → editItems → equipar no dono novo (o backend tira do dono anterior
 * e desequipa o que estava naquele espaço do novo).
 */
async function saveEdit(api, draft, original, heroesById) {
  const item = prepare(draft, original);
  const wasOwner = original.equippedById || null;
  const wantOwner = draft.equippedById || null;
  const gearChanged = original.gear !== item.gear;
  let current = wasOwner;
  if (wasOwner && (gearChanged || !wantOwner)) { await api.unequipItems([item.id]); current = null; }
  item.equippedById = current;
  item.equippedByName = current ? original.equippedByName : null;
  await api.editItems([item]);
  if (wantOwner && wantOwner !== current) {
    await api.equipItemsOnHero(wantOwner, [item.id]);
    item.equippedById = wantOwner;
    item.equippedByName = heroesById && heroesById[wantOwner] ? heroesById[wantOwner].name : null;
  }
  return item;
}

/* peça nova (a partir de um espaço vazio do herói) — o clássico "Add new" */
async function saveNew(api, draft, heroesById) {
  const item = prepare(draft, null);
  const owner = draft.equippedById || null;
  delete item.equippedById; delete item.equippedByName;
  await api.addItems([item]);
  if (owner) {
    await api.equipItemsOnHero(owner, [item.id]);
    item.equippedById = owner;
    item.equippedByName = heroesById && heroesById[owner] ? heroesById[owner].name : null;
  }
  return item;
}

/* cópia fora de qualquer herói e destravada (o clássico "Duplicate") */
async function duplicate(api, original) {
  const copy = clone(original);
  delete copy.id; delete copy.ingameId; delete copy.equippedById; delete copy.equippedByName;
  copy.locked = false;
  const item = augment(copy);
  await api.addItems([item]);
  return item;
}

const remove = (api, original) => api.deleteItems([original.id]);
const unequip = (api, original) => api.unequipItems([original.id]);

/* esqueleto de peça nova para um espaço vazio */
function blank(slot, owner) {
  const mains = mainTypes(slot);
  return {
    gear: slot, rank: 'Epic', set: 'SpeedSet', level: 85, enhance: 0,
    main: { type: mains[0] || 'Attack', value: null },
    substats: [], locked: false, disableMods: false, material: 'Hunt',
    equippedById: owner ? owner.id : null, equippedByName: owner ? owner.name : null,
  };
}

/* ---------- listas para os campos ---------- */
function mainTypes(slot) { return ((gameRules.load() || {}).mainStatsBySlot || {})[slot] || []; }
function subTypes(slot) { return ((gameRules.load() || {}).substatsBySlot || {})[slot] || []; }
/* atributos livres para a linha i (sem o main e sem os das outras linhas) */
function freeSubTypes(it, i) {
  const others = (it.substats || []).filter((s, k) => k !== i && s && s.type).map((s) => s.type);
  return subTypes(it.gear).filter((t) => t !== (it.main && it.main.type) && !others.includes(t));
}
const sets = () => gameData.setNames();

module.exports = {
  SLOTS, RANKS, BASE_LEVELS, MATERIALS, MAX_SUBS,
  augment, clone, isPlus15, isReforgeableNow, isGaveleets, middleColumn, upRange,
  nextUpLevel, upAddsSub, upValues, mainAt15, applyUp, setEnhance, MAX_UPS, minUps, setUps, upsCheck,
  modifiedIndex, canModify, modBlockReason, modOptions, lineRolls, modKind, reforgesLater, modRange, applyMod,
  reforge, unreforged, unreforge, validate, expectedSubCount, RANK_PT, prepare, saveEdit, saveNew, duplicate, remove, unequip, blank,
  mainTypes, subTypes, freeSubTypes, sets,
};
