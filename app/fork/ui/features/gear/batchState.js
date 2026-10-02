/*
 * batchState.js — a parte PURA do up em lote (sem React), testável:
 *
 *   estado = { slots: [16 × id|null] (as MESMAS vagas da tela de lote do jogo), ids: [id…] (as vagas ocupadas,
 *              na ordem da grade — derivado), drafts: { [id]: { draft, hist: [rascunhos anteriores] } } }
 *
 *   toggle(st, item)          marca (1ª vaga livre) / desmarca (a vaga FICA VAZIA, como no jogo); só abaixo do +15
 *   move(st, from, to)        arrastar: troca o conteúdo de duas vagas
 *   place(st, ids)            escuta do jogo: peça upada que não está no lote entra na 1ª vaga livre (sem checar +15)
 *   up(st, stored, i, v, t)   aplica um roll à mão (IE.applyUp: +roll na linha i, peça vai ao próximo +3)
 *   undo(st, id)              desfaz o último up daquela peça
 *   pending                   ids com up ainda não gravado
 *   saveAll(api, st, …)       grava as pendentes, uma a uma (IE.saveEdit); devolve { ok: [ids], errors: { id: msg } }
 *
 * O jogo sobe a peça de 3 em 3; na tela cada clique num valor é "o roll que caiu".
 * (Nome diferente de UpBatch.js de propósito: no Windows upBatch.js seria o MESMO arquivo.)
 */
'use strict';
const IE = require('../../../lib/itemEdit.js');

const MAX = 16;
const EMPTY = { slots: new Array(MAX).fill(null), ids: [], drafts: {} };

const canUp = (it) => !!it && (Number(it.enhance) || 0) < 15;

// estado antigo (só `ids`) vira vagas em sequência
const slotsOf = (st) => (st.slots && st.slots.length === MAX ? st.slots.slice()
  : Array.from({ length: MAX }, (_, i) => (st.ids || [])[i] || null));
const withSlots = (st, slots) => ({ ...st, slots, ids: slots.filter(Boolean) });

function toggle(st, it) {
  const slots = slotsOf(st);
  const at = slots.indexOf(it.id);
  if (at >= 0) {
    const drafts = { ...st.drafts };
    delete drafts[it.id];
    slots[at] = null;
    return withSlots({ ...st, drafts }, slots);
  }
  const free = slots.indexOf(null);
  if (!canUp(it) || free < 0) return st;
  slots[free] = it.id;
  return withSlots(st, slots);
}

function move(st, from, to) {
  if (from === to) return st;
  const slots = slotsOf(st);
  [slots[from], slots[to]] = [slots[to], slots[from]];
  return withSlots(st, slots);
}

function place(st, ids) {
  const slots = slotsOf(st);
  let changed = false;
  ids.forEach((id) => {
    if (slots.includes(id)) return;
    const free = slots.indexOf(null);
    if (free < 0) return;
    slots[free] = id;
    changed = true;
  });
  return changed ? withSlots(st, slots) : st;
}

function up(st, stored, i, value, type) {
  const cur = st.drafts[stored.id] || { draft: stored, hist: [] };
  const next = IE.applyUp(cur.draft, i, value, type);   // lança se não der (ex.: já no +15)
  return { ...st, drafts: { ...st.drafts, [stored.id]: { draft: next, hist: cur.hist.concat([cur.draft]) } } };
}

function undo(st, id) {
  const cur = st.drafts[id];
  if (!cur || !cur.hist.length) return st;
  const hist = cur.hist.slice(0, -1);
  const drafts = { ...st.drafts };
  if (hist.length) drafts[id] = { draft: cur.hist[cur.hist.length - 1], hist };
  else delete drafts[id];
  return { ...st, drafts };
}

const pending = (st) => st.ids.filter((id) => st.drafts[id] && st.drafts[id].hist.length);

/* depois de gravar (ou de o jogo mandar a peça de verdade): voltam a seguir a peça da conta (sem rascunho) */
function clearSaved(st, ids) {
  const drafts = { ...st.drafts };
  ids.forEach((id) => { delete drafts[id]; });
  return { ...st, drafts };
}

/* peça que saiu da conta (vendida, extraída — pelo jogo ou no app) libera a vaga e perde o rascunho */
function prune(st, itemsById) {
  const slots = slotsOf(st);
  const gone = slots.filter((id) => id && !itemsById[id]);
  if (!gone.length) return st;
  const drafts = { ...st.drafts };
  gone.forEach((id) => { delete drafts[id]; });
  return withSlots({ ...st, drafts }, slots.map((id) => (id && itemsById[id] ? id : null)));
}

/* grava as pendentes, uma a uma; a que falhar não impede as outras */
async function saveAll(api, st, itemsById, heroesById) {
  const ok = [];
  const errors = {};
  for (const id of pending(st)) {
    const stored = itemsById[id];
    if (!stored) { errors[id] = 'A peça não está mais na conta.'; continue; }
    try {
      await IE.saveEdit(api, st.drafts[id].draft, stored, heroesById);
      ok.push(id);
    } catch (e) { errors[id] = e.message; }
  }
  return { ok, errors };
}

module.exports = { MAX, EMPTY, canUp, slotsOf, toggle, move, place, up, undo, pending, clearSaved, prune, saveAll };
