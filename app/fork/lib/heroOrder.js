/*
 * heroOrder.js — a ordem dos heróis do fork (relevance.json) MANDA na ordem do
 * backend, que é a PRIORIDADE do otimizador clássico ("prioridade de heróis": não
 * usa peças de quem está acima). Decisão do Eduardo, 2026-09-28:
 *   1. uma vez só: a nossa lista adota a ordem atual do clássico para os heróis da
 *      conta (os fora da conta ficam depois, na ordem em que estavam) — adoptClassic
 *   2. daí em diante: a ordem dos heróis da conta na nossa lista é empurrada para o
 *      backend (desiredAccountIds + planMoves → /heroes/reorderHeroes)
 * A nossa lista tem os ~388 heróis do jogo; o backend só os da conta: a projeção
 * simplesmente pula quem não está na conta.
 */
'use strict';

/* 1ª vez: nomes da conta (ordem do backend) na frente, o resto como estava */
function adoptClassic(rankedAll, accountNames) {
  const acc = [];
  const seen = new Set();
  (accountNames || []).forEach((n) => { if (!seen.has(n)) { seen.add(n); acc.push(n); } });
  return acc.concat((rankedAll || []).filter((n) => !seen.has(n)));
}

/*
 * A ordem que o backend deveria ter (ids), seguindo a nossa lista. Herói repetido
 * na conta (duas cópias) fica junto, na ordem atual entre eles; herói da conta que
 * não está no nosso catálogo vai para o fim, na ordem atual.
 */
function desiredAccountIds(rankedNames, accountOrder) {
  const byName = new Map();
  (accountOrder || []).forEach((h) => {
    if (!byName.has(h.name)) byName.set(h.name, []);
    byName.get(h.name).push(h.id);
  });
  const out = [];
  (rankedNames || []).forEach((n) => {
    const ids = byName.get(n);
    if (ids) { out.push(...ids); byName.delete(n); }
  });
  (accountOrder || []).forEach((h) => { if (byName.has(h.name)) out.push(h.id); });
  return out;
}

/*
 * Movimentos para `current` virar `desired`, no formato do /heroes/reorderHeroes
 * do backend: { id, destinationIndex } com posição 1-based; o backend TIRA o herói
 * e o INSERE nessa posição. Só move quem está fora do lugar.
 */
function planMoves(current, desired) {
  const cur = current.slice();
  const moves = [];
  for (let i = 0; i < desired.length; i++) {
    if (cur[i] === desired[i]) continue;
    const from = cur.indexOf(desired[i]);
    if (from < 0) continue;   // não está no backend: nada a fazer
    cur.splice(from, 1);
    cur.splice(i, 0, desired[i]);
    moves.push({ id: desired[i], destinationIndex: i + 1 });
  }
  return moves;
}

/* aplica os movimentos numa cópia, com a mesma regra do backend (para teste) */
function simulate(current, moves) {
  const cur = current.slice();
  moves.forEach((m) => {
    let d = Math.max(1, Math.min(m.destinationIndex, cur.length)) - 1;
    const from = cur.indexOf(m.id);
    if (from < 0 || cur[d] === m.id) return;
    cur.splice(from, 1);
    cur.splice(d, 0, m.id);
  });
  return cur;
}

module.exports = { adoptClassic, desiredAccountIds, planMoves, simulate };

// autoteste: node app/fork/lib/heroOrder.js
if (require.main === module) {
  const assert = require('assert');
  const cur = ['a', 'b', 'c', 'd', 'e'];
  [['e', 'd', 'c', 'b', 'a'], ['b', 'a', 'c', 'd', 'e'], ['a', 'b', 'c', 'd', 'e'], ['c', 'a', 'e', 'b', 'd']].forEach((want) => {
    assert.deepStrictEqual(simulate(cur, planMoves(cur, want)), want);
  });
  assert.strictEqual(planMoves(cur, cur).length, 0);
  const acc = [{ id: '1', name: 'X' }, { id: '2', name: 'Y' }, { id: '3', name: 'X' }, { id: '4', name: 'Novo' }];
  assert.deepStrictEqual(desiredAccountIds(['Y', 'Z', 'X'], acc), ['2', '1', '3', '4']);
  assert.deepStrictEqual(adoptClassic(['A', 'B', 'X', 'Y'], ['Y', 'X', 'Y']), ['Y', 'X', 'A', 'B']);
  console.log('heroOrder ok');
}
