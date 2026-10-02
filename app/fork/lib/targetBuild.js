/*
 * targetBuild.js (fork) — PLANEJAMENTO da build-alvo (comunidade / pro):
 * "com o que o gear precisa entregar, quais mains usar e quanto de substatus falta?"
 *
 * NÃO há fórmula de stat aqui. O "quanto o gear precisa entregar" vem do BACKEND
 * (POST /fork/gearNeeded, via lib/forkCalc.js), que usa o StatCalculator dele com
 * os bônus simulados, os sets e os mains fixos. Este módulo só:
 *   - monta a SIMULAÇÃO de bônus (imprint / EE / artefato) no formato do backend;
 *   - escolhe os 3 mains variáveis (colar / anel / bota) e divide o resto pelos
 *     substatus — usando as tabelas do jogo (valores de main e de roll, reforge.js);
 *   - soma os substatus que o gear equipado entrega hoje (para comparar).
 *
 * Regras do Eduardo:
 *  - Simulação começa com imprint e EE no MÁXIMO e o artefato da própria build
 *    (nível 30) — editável, nunca gravado na conta.
 *  - O valor por item NÃO é "dividir por 6": um item não pode ter substatus igual
 *    ao próprio main, e cada slot só aceita certos substatus.
 */
'use strict';
const heroList = require('./heroList.js');
const heroBonus = require('./heroBonus.js');
const gameRules = require('./gameRules.js');
const gc = require('./gameConstants.js');

const SLOTS = ['Weapon', 'Helmet', 'Armor', 'Necklace', 'Ring', 'Boots'];
const VARIABLE_SLOTS = ['Necklace', 'Ring', 'Boots'];
const FIXED_MAIN = { Weapon: 'Attack', Helmet: 'Health', Armor: 'Defense' };

// ordem padrão do projeto: ATK, DEF, HP, SPD, CC, CD, EFF, RES
const KEYS = ['atk', 'def', 'hp', 'spd', 'cr', 'cd', 'eff', 'res'];
const KEY_LABEL = { atk: 'ATK', hp: 'HP', def: 'DEF', spd: 'SPD', cr: 'CC', cd: 'CD', eff: 'EFF', res: 'RES' };
const KEY_ICON = { atk: 'atk', hp: 'hp', def: 'def', spd: 'spd', cr: 'chc', cd: 'chd', eff: 'eff', res: 'efr' };
// stat "de gear" equivalente a cada chave (a versão % para atk/hp/def)
const KEY_TO_STAT = {
  atk: 'AttackPercent', hp: 'HealthPercent', def: 'DefensePercent', spd: 'Speed',
  cr: 'CriticalHitChancePercent', cd: 'CriticalHitDamagePercent',
  eff: 'EffectivenessPercent', res: 'EffectResistancePercent',
};
const STAT_TO_KEY = Object.keys(KEY_TO_STAT).reduce((a, k) => { a[KEY_TO_STAT[k]] = k; return a; }, {});
const PCT_KEYS = ['atk', 'hp', 'def'];   // em % da base do herói

function rules() { return gameRules.load() || {}; }
const r1 = (v) => Math.round(v * 10) / 10;

// base do herói (lv60, 6★, desperto) — a MESMA que o app entrega ao backend
function baseStats(heroName) {
  const hd = heroList.rawByName(heroName);
  const c = hd && hd.calculatedStatus && hd.calculatedStatus.lv60SixStarFullyAwakened;
  if (!c) return null;
  return {
    atk: c.atk, hp: c.hp, def: c.def, spd: c.spd,
    cr: Math.round((c.chc || 0) * 100), cd: Math.round((c.chd || 0) * 100),
    eff: Math.round((c.eff || 0) * 100), res: Math.round((c.efr || 0) * 100),
    // ataque em dupla: vem do herodata do upstream (0.03 = 3%), não é constante nossa
    dac: Math.round((c.dac || 0) * 100),
    cp: c.cp,   // CP do herói sem equipamento (herodata)
  };
}

/* ---------------- simulação de bônus ---------------- */

/* ponto de partida: imprint e EE no máximo, artefato da build no nível 30 */
function simDefaults(heroName, artifactName) {
  const imp = heroBonus.imprint(heroName, null);
  const ee = heroBonus.ee(heroName, null);
  return {
    imprintValue: imp ? imp.max : null,
    eeValue: ee ? ee.max : null,
    artifactName: artifactName || null,
    artifactLevel: heroBonus.ARTIFACT_MAX_LEVEL,
  };
}

/* imprint + EE simulados -> campos aei* que o backend entende (o artefato vai à parte) */
function aeiFromSim(heroName, sim) {
  const out = {};
  const add = (info, v) => {
    const field = info && heroBonus.E7_TO_AEI[info.type];
    if (field && v != null) out[field] = (out[field] || 0) + Number(v);
  };
  add(heroBonus.imprint(heroName, null), sim && sim.imprintValue);
  add(heroBonus.ee(heroName, null), sim && sim.eeValue);
  return out;
}

// BLINDADO: valores de main stat no +15 vêm do reforge.js
function mainValues() {
  return gc.mainStatValues() || (rules().mainStatMaxValue_lv85_plus15 || {});
}
/* mains FIXOS (arma=ATK, capacete=HP, armadura=DEF) no +15 — entram sempre */
function fixedMainsFlat() {
  const mv = mainValues();
  return { atk: mv.Attack || 0, hp: mv.Health || 0, def: mv.Defense || 0 };
}

/* ---------------- planejamento ---------------- */

/*
 * Valor máximo de UM roll de substatus (tier 85) — serve de "moeda" para comparar
 * stats de escalas diferentes. Sem isso, 70% de HP parece tão valioso quanto 70 de
 * CD, o que leva a recomendar main errado.
 */
function rollValue(stat, level) {
  // BLINDADO: faixas do reforge.js do app clássico (85 e 88)
  const up = gc.maxRollValue(stat, level);
  if (up != null) return up;
  const pct = ((rules().substatRollRangesByTier || {})[level === 88 ? '88' : '85'] || {}).percent || {};
  const pick = (a, d) => (Array.isArray(a) ? a[1] : d);
  if (stat === 'CriticalHitChancePercent') return pick(pct.CriticalHitChancePercent, 5);
  if (stat === 'CriticalHitDamagePercent') return pick(pct.CriticalHitDamagePercent, 7);
  if (stat === 'Speed') return pick(pct.Speed, 4);
  return pick(pct.Plain, 8);
}

function totalRollsFor(need) {
  let sum = 0;
  for (const k of KEYS) {
    const v = need[k] || 0;
    if (v > 0) sum += v / rollValue(KEY_TO_STAT[k]);
  }
  return sum;
}

/*
 * Escolhe os 3 mains variáveis (colar/anel/bota) testando TODAS as combinações
 * (~100) e ficando com a que exige MENOS ROLLS de substatus no total.
 * `need` já vem do backend com a CC limitada ao que ainda faz diferença (≤100%).
 */
function recommendMains(need) {
  const R = rules();
  const bySlot = R.mainStatsBySlot || {};
  const maxv = mainValues();
  const bad = R.discouragedMainsBySlot || {};
  const optsFor = (slot) => (bySlot[slot] || []).filter((m) => !(bad[slot] || []).includes(m) && STAT_TO_KEY[m]);

  const [N, Rg, B] = VARIABLE_SLOTS.map(optsFor);
  let best = null;
  for (const n of N) {
    for (const rg of Rg) {
      for (const b of B) {
        const rem = Object.assign({}, need);
        for (const m of [n, rg, b]) {
          const k = STAT_TO_KEY[m];
          if (k) rem[k] = Math.max(0, r1((rem[k] || 0) - (maxv[m] || 0)));
        }
        const cost = totalRollsFor(rem);
        if (!best || cost < best.cost - 1e-9) best = { cost, mains: { Necklace: n, Ring: rg, Boots: b }, afterMains: rem };
      }
    }
  }
  if (!best) {
    const mains = { Necklace: 'CriticalHitDamagePercent', Ring: 'AttackPercent', Boots: 'Speed' };
    return { mains, afterMains: Object.assign({}, need) };
  }
  return { mains: best.mains, afterMains: best.afterMains, rollsNeeded: r1(best.cost) };
}

/*
 * O que sobra tem que vir de SUBSTATUS. `eligible` = quantas das 6 peças podem
 * carregar aquele substatus (respeita substatsBySlot e a regra "substatus não pode
 * ser igual ao main da própria peça").
 */
function substatPlan(afterMains, mains) {
  const R = rules();
  const bySlot = R.substatsBySlot || {};
  const plan = [];
  for (const k of KEYS) {
    const total = afterMains[k] || 0;
    if (total <= 0) continue;
    const stat = KEY_TO_STAT[k];
    let eligible = 0;
    for (const slot of SLOTS) {
      const allowed = bySlot[slot] || [];
      const slotMain = mains[slot] || FIXED_MAIN[slot];
      if (allowed.includes(stat) && slotMain !== stat) eligible++;
    }
    if (eligible > 0) plan.push({ key: k, label: KEY_LABEL[k], icon: KEY_ICON[k], total: r1(total), perItem: r1(total / eligible), eligible });
  }
  return plan;
}

/*
 * O que os SUBSTATUS do gear equipado já entregam hoje, na mesma unidade do
 * `need` (atk/hp/def em % sobre a base; o resto em pontos). Substatus flat são
 * convertidos para % da base, para poder comparar maçã com maçã.
 */
function currentSubstats(equipment, base) {
  const out = {}; KEYS.forEach((k) => { out[k] = 0; });
  if (!equipment || !base) return out;
  const FLAT_TO_KEY = { Attack: 'atk', Health: 'hp', Defense: 'def' };
  for (const slot of Object.keys(equipment)) {
    const it = equipment[slot];
    if (!it || !Array.isArray(it.substats)) continue;
    for (const sub of it.substats) {
      const v = Number(sub.value) || 0;
      const k = STAT_TO_KEY[sub.type];
      if (k) { out[k] += v; continue; }
      const fk = FLAT_TO_KEY[sub.type];
      if (fk && base[fk]) out[fk] += (v / base[fk]) * 100;   // flat -> % da base
    }
  }
  KEYS.forEach((k) => { out[k] = r1(out[k]); });
  return out;
}

/*
 * Tudo junto, a partir do `need` que o backend devolveu:
 * mains recomendados, o que sobra para substatus e o que o gear atual entrega.
 */
function plan(need, currentEquipment, base) {
  if (!need) return null;
  const { mains, afterMains, rollsNeeded } = recommendMains(need);
  return {
    need, mains, afterMains, rollsNeeded,
    substats: substatPlan(afterMains, mains).map((x) => {
      const rv = rollValue(KEY_TO_STAT[x.key]);
      const rolls = Math.round((x.perItem / rv) * 10) / 10;
      return Object.assign(x, { rollValue: rv, rolls, feasible: rolls <= 6 });
    }),
    mainValue: mainValues(),
    current: currentSubstats(currentEquipment, base),
  };
}

module.exports = {
  baseStats, simDefaults, aeiFromSim, fixedMainsFlat, mainValues,
  plan, rollValue, currentSubstats, recommendMains, substatPlan,
  KEYS, KEY_LABEL, KEY_ICON, KEY_TO_STAT, STAT_TO_KEY, VARIABLE_SLOTS, FIXED_MAIN, PCT_KEYS, SLOTS,
};
