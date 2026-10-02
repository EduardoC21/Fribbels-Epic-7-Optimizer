/*
 * archeDetect.js (fork) — tenta encaixar uma build num ARQUÉTIPO olhando só as
 * estatísticas (que é o que define arquétipo — sets são sugestão, não regra).
 *
 * Como: monta um vetor de "ênfase" da build (cada stat normalizado 0..1 contra as
 * outras builds da mesma lista) e compara por similaridade de cosseno com o vetor
 * de PRIORIDADES do arquétipo. Cosseno ignora escala e olha a FORMA do perfil —
 * é o que queremos ("esta build enfatiza velocidade+crit" ≈ "opener de crit").
 *
 * Abaixo de MIN_SCORE não rotula: preferimos "—" a inventar um arquétipo.
 */
'use strict';

// chave do arquétipo -> chave usada nas builds/heróis
const ARCHE_TO_BUILD = { atk: 'atk', def: 'def', hp: 'hp', spd: 'spd', chc: 'cr', chd: 'cd', eff: 'eff', efr: 'res' };
const KEYS = Object.keys(ARCHE_TO_BUILD);
const MIN_SCORE = 0.55;

// vetor 0..1 da build, normalizado pelo min/max das linhas comparadas
function emphasisVector(stats, agg) {
  return KEYS.map((k) => {
    const bk = ARCHE_TO_BUILD[k];
    const a = agg && agg[bk];
    const v = stats ? stats[bk] : null;
    if (v == null || isNaN(v) || !a || !(a.max > a.min)) return 0;
    return (v - a.min) / (a.max - a.min);
  });
}
function cosine(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  if (!na || !nb) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

function detect(stats, archetypes, agg) {
  if (!stats || !archetypes || !archetypes.length) return null;
  const v = emphasisVector(stats, agg);
  let best = null, bestScore = 0;
  for (const ar of archetypes) {
    // barras do arquétipo (−1..3, chaves da build); −1 e 0 = sem ênfase (nota 20)
    const p = KEYS.map((k) => Math.max(0, (ar.stats && ar.stats[ARCHE_TO_BUILD[k]] && ar.stats[ARCHE_TO_BUILD[k]].priority) || 0));
    const s = cosine(v, p);
    if (s > bestScore) { bestScore = s; best = ar; }
  }
  if (!best || bestScore < MIN_SCORE) return null;
  return { id: best.id, name: best.name, score: Math.round(bestScore * 100) };
}

/*
 * Escala ABSOLUTA de referência (PROVISÓRIA — mesma situação do rank de item):
 * vai da base do herói até o quanto um equipamento bem montado costuma somar.
 * Serve quando não há outras builds para comparar (ex.: só a equipada) — sem
 * ela, uma lista de 1 linha não tem min/max e nada seria rotulado.
 *   atk +2.800 · hp +19.000 · def +1.300 · spd +120 · cc até 100 · cd até 350
 *   eff e res de 0 até 250
 */
function referenceAgg(base) {
  if (!base || !base.atk) return null;
  const b = (k) => Number(base[k]) || 0;
  return {
    atk: { min: b('atk'), max: b('atk') + 2800 },
    hp: { min: b('hp'), max: b('hp') + 19000 },
    def: { min: b('def'), max: b('def') + 1300 },
    spd: { min: b('spd'), max: b('spd') + 120 },
    cr: { min: b('cr'), max: 100 },
    cd: { min: b('cd'), max: 350 },
    eff: { min: b('eff'), max: 250 },
    res: { min: b('res'), max: 250 },
  };
}

module.exports = { detect, emphasisVector, referenceAgg, ARCHE_TO_BUILD, MIN_SCORE };
