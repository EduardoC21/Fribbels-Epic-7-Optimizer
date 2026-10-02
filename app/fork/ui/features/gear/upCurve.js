/*
 * upCurve.js — a peça em cada nível do up (+0, +3, +6…), para a curva do potencial na tela de Up.
 *
 * Peça importada do jogo guarda `op` cru: [main, substatus iniciais…, e cada roll ANEXADO no fim] (nota 07).
 * Iniciais por raridade = o deslocamento do convertEnhance do clássico (Épica 4, Heroica 3, Rara 2, Boa 1, Normal 0);
 * cada op seguinte é um +3 (tipo repetido = roll na linha; tipo novo = substatus novo). Linhas de reforja ('u') e de
 * pedra ('c') ficam fora (vêm depois do +15). O main não muda: o potencial já usa o main do +15 do nível (backend).
 * Rascunhos à mão do lote (hist) continuam a curva depois do nível gravado.
 * Sem `op` (peça cadastrada à mão) a curva só tem os rascunhos.
 */
'use strict';

const INITIAL = { Normal: 0, Good: 1, Rare: 2, Heroic: 3, Epic: 4 };
const STAT = {
  att_rate: 'AttackPercent', max_hp_rate: 'HealthPercent', def_rate: 'DefensePercent', att: 'Attack', max_hp: 'Health',
  def: 'Defense', speed: 'Speed', res: 'EffectResistancePercent', cri: 'CriticalHitChancePercent',
  cri_dmg: 'CriticalHitDamagePercent', acc: 'EffectivenessPercent', coop: 'DualAttackChancePercent',
};
const FLAT = new Set(['att', 'max_hp', 'def', 'speed']);

/* substatus a partir de uma fatia de op (mesmo acúmulo do convertSubStats do clássico) */
function subsOf(ops) {
  const acc = {};
  const order = [];
  ops.forEach(([t, raw]) => {
    const type = STAT[t];
    if (!type) return;
    const v = FLAT.has(t) ? Number(raw) : Math.round(Number(raw) * 1000) / 10;
    if (!acc[type]) { acc[type] = { type, value: v, rolls: 1 }; order.push(type); } else {
      acc[type].value = Math.round((acc[type].value + v) * 10) / 10;
      acc[type].rolls += 1;
    }
  });
  return order.map((t) => acc[t]);
}

/* [{enhance, item}] do +0 até o nível gravado (só peça com op do jogo) */
function fromOp(item) {
  const op = Array.isArray(item && item.op) ? item.op : null;
  const k = INITIAL[item && item.rank];
  if (!op || k == null || op.length < 1 + k) return [];
  const rolls = op.slice(1).filter((o) => !(o.length > 2 && (o[2] === 'u' || o[2] === 'c')));
  const max = Math.min(Math.floor((Number(item.enhance) || 0) / 3), rolls.length - k, 5);
  const out = [];
  for (let n = 0; n <= max; n++) {
    out.push({ enhance: n * 3, item: { ...item, enhance: n * 3, substats: subsOf(rolls.slice(0, k + n)), op: undefined } });
  }
  // o último ponto é a própria peça (valores exatos dela, inclusive +4/+7… de sucesso crítico)
  if (out.length) out[out.length - 1] = { enhance: Number(item.enhance) || 0, item };
  return out;
}

/* o op reproduz os substatus gravados? (soma TODAS as linhas, inclusive reforja 'u' e pedra 'c'). Peça editada à mão
   no app não atualiza o op — aí a curva/ganho pelo op mentiriam */
function opMatches(item) {
  const op = Array.isArray(item && item.op) ? item.op : null;
  if (!op || op.length < 2) return false;
  const acc = {};
  op.slice(1).forEach(([t, raw]) => {
    const type = STAT[t];
    if (type) acc[type] = (acc[type] || 0) + (FLAT.has(t) ? Number(raw) : Number(raw) * 100);
  });
  const subs = (item.substats || []).filter((x) => x && x.type);
  return subs.length > 0 && subs.every((x) => acc[x.type] != null && Math.abs(acc[x.type] - Number(x.value)) < 0.6);
}

/* curva completa: op do jogo + rascunhos do lote (entry = { draft, hist }) */
function steps(stored, entry) {
  const base = fromOp(stored);
  const pts = base.length ? base : [{ enhance: Number(stored.enhance) || 0, item: stored }];
  if (entry && entry.hist && entry.hist.length) {
    entry.hist.slice(1).concat([entry.draft]).forEach((d) => pts.push({ enhance: Number(d.enhance) || 0, item: d }));
  }
  return pts;
}

module.exports = { steps, fromOp, subsOf, opMatches };
