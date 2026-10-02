/*
 * forkCalc.js (fork) — pede ao BACKEND os stats calculados das builds públicas
 * (CP, vida efetiva, danos, S1–S3, BS) via POST /fork/calculateStats.
 *
 * O backend usa o próprio StatCalculator (backend/src/main/java/com/fribbels/fork);
 * aqui NÃO há fórmula nenhuma: só montar o pedido e encaixar a resposta.
 *
 *   inputsFromPicks(summary, heroName, heroId)  -> lista de builds para o backend
 *   calcKey(combo, stats, gs, date)            -> chave estável de cada build pública
 *   compute(summary, heroName, heroId)          -> { byKey: {chave: stats}, error }
 *   gearNeeded(target)                          -> quanto o gear precisa somar (build-alvo)
 *
 * Artefato: a base pública só diz QUAL artefato, não o nível. Para o BS (que
 * desconta o artefato) assume-se o nível máximo (30) — ARTIFACT_LEVEL.
 */
'use strict';
const backend = require('./backend.js');
const buildsList = require('./buildsList.js');
const heroBonus = require('./heroBonus.js');
const targetBuild = require('./targetBuild.js');

const ARTIFACT_LEVEL = 30;
// os campos que o backend calcula e a lista mostra
const DERIVED = ['cp', 'ehp', 'hpps', 'ehpps', 'dmg', 'dmgps', 'mcdmg', 'mcdmgps', 'dmgh', 'dmgd', 's1', 's2', 's3', 'bs'];

function calcKey(combo, s, gs, date) {
  const st = s || {};
  return [combo, st.atk, st.def, st.hp, st.spd, st.cr, st.cd, st.eff, st.res, gs, date].join('|');
}

// "Speed4+Torrent2" -> {"SpeedSet":4,"TorrentSet":2} (nº de PEÇAS, como o backend conta)
function piecesOf(combo) {
  const out = {};
  buildsList.comboIcons(combo, false).forEach((ic) => { out[ic.set] = (out[ic.set] || 0) + (ic.count || 0); });
  return out;
}

function inputsFromPicks(summary, heroName, heroId) {
  const picks = (summary && summary.picks) || {};
  const all = [].concat(picks.pros || [], picks.community || []);
  const seen = new Set();
  const out = [];
  all.forEach((b) => {
    const key = calcKey(b.combo, b.stats, b.gs, b.date);
    if (seen.has(key)) return;
    seen.add(key);
    const s = b.stats || {};
    out.push({
      key, heroName, heroId: heroId || null, stars: 6,
      stats: { atk: s.atk, hp: s.hp, def: s.def, spd: s.spd, cr: s.cr, cd: s.cd, eff: s.eff, res: s.res },
      sets: piecesOf(b.combo),
      score: b.gs || 0,
      artifactName: b.artifactCode ? heroBonus.artifactByCode(b.artifactCode) : null,
      artifactLevel: ARTIFACT_LEVEL,
    });
  });
  return out;
}

/* chama o backend; nunca lança — erro vira { error } para a tela mostrar "—" */
async function compute(summary, heroName, heroId) {
  const inputs = inputsFromPicks(summary, heroName, heroId);
  if (!inputs.length) return { byKey: {}, error: null };
  try {
    const results = await backend.forkCalculateStats(inputs);
    const byKey = {};
    let failed = 0;
    results.forEach((r) => {
      if (!r || !r.ok || !r.stats) { failed++; return; }
      const d = {};
      DERIVED.forEach((k) => { d[k] = r.stats[k]; });
      byKey[r.key] = d;
    });
    return { byKey, error: failed ? `${failed} build(s) sem cálculo` : null };
  } catch (e) {
    return { byKey: {}, error: e.message };
  }
}

/*
 * Build-alvo: quanto as 6 peças precisam somar, com os bônus SIMULADOS.
 *   target = { heroName, heroId, stats (8 finais), setIcons, sim }
 *   sim    = { imprintValue, eeValue, artifactName, artifactLevel } (targetBuild.simDefaults)
 * Devolve o resultado do backend ({ need, needFlat, crCap, base, noGear, artifact })
 * ou { error } — nunca lança.
 */
async function gearNeeded(target) {
  const s = target.stats || {};
  const pieces = {};
  (target.setIcons || []).forEach((ic) => { pieces[ic.set] = (pieces[ic.set] || 0) + (ic.count || 0); });
  const sim = target.sim || {};
  try {
    const [r] = await backend.forkGearNeeded([{
      key: 'alvo', heroName: target.heroName, heroId: target.heroId || null, stars: 6,
      stats: { atk: s.atk, hp: s.hp, def: s.def, spd: s.spd, cr: s.cr, cd: s.cd, eff: s.eff, res: s.res },
      sets: pieces,
      aei: targetBuild.aeiFromSim(target.heroName, sim),
      artifactName: sim.artifactName && sim.artifactName !== 'None' ? sim.artifactName : null,
      artifactLevel: sim.artifactLevel == null ? ARTIFACT_LEVEL : sim.artifactLevel,
      fixedMains: targetBuild.fixedMainsFlat(),
    }]);
    if (!r || !r.ok) return { error: (r && r.error) || 'sem resposta do backend' };
    return r;
  } catch (e) {
    return { error: e.message };
  }
}

module.exports = { compute, gearNeeded, inputsFromPicks, calcKey, piecesOf, DERIVED, ARTIFACT_LEVEL };
