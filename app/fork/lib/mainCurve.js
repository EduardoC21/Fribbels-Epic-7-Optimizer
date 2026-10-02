/*
 * mainCurve.js — o main da peça em cada +N (0…15), pelo backend (/fork/mainCurve, mesma regra da sincronização:
 * base × multiplicador do +N; conferido nas 698 peças da conta). A base é o `op[0]` que toda peça guarda.
 * Usado no up à mão (IE.applyUp): sem isto o main ficava parado nos níveis do meio e o score saía errado.
 *
 *   ensure(items)   pede as curvas que faltam (uma ida só; backend antigo = sem curva, o up segue como antes)
 *   get(item)       [16 valores] ou null (leitura síncrona; null se a curva não bate com o main gravado)
 */
'use strict';
const backend = require('./backend.js');

const cache = new Map();   // "tipo|base" → [16]

function keyOf(it) {
  const m = it && Array.isArray(it.op) && Array.isArray(it.op[0]) ? it.op[0] : null;
  const base = m ? Number(m[1]) : NaN;
  return m && typeof m[0] === 'string' && base > 0 ? { k: m[0] + '|' + base, type: m[0], base } : null;
}

/* só vale se a curva reproduz o main GRAVADO no nível atual: peça editada à mão (main mudado no editor) não atualiza o
   op, e aí a curva mentiria — segue o comportamento antigo */
const get = (it) => {
  const x = keyOf(it);
  const c = x && cache.get(x.k);
  return c && it.main && c[Number(it.enhance) || 0] === Number(it.main.value) ? c : null;
};

async function ensure(items) {
  const todo = new Map();
  (items || []).forEach((it) => { const x = keyOf(it); if (x && !cache.has(x.k)) todo.set(x.k, x); });
  if (!todo.size) return;
  const list = [...todo.values()];
  try {
    const r = await backend.post('/fork/mainCurve', { mains: list.map((x) => ({ type: x.type, base: x.base })) });
    (r && r.curves || []).forEach((c, i) => { if (Array.isArray(c) && c.length === 16 && c[15] > 0) cache.set(list[i].k, c); });
  } catch (e) { /* backend sem a rota (jar < v16): o up segue sem mexer no main dos níveis do meio */ }
}

module.exports = { ensure, get };
