/*
 * communityBuilds.js — motor de dados das builds da comunidade (feature C do fork).
 *
 * Busca as builds globais de um herói no endpoint público do Fribbels (/getBuilds),
 * mas NÃO guarda as builds cruas: destila e persiste apenas um RESUMO por herói —
 * os "padrões" (combos de set mais usados, cada um com suas faixas de stat e artefato),
 * as faixas gerais (min/p25/p50/p75/p90/max), o artefato geral e uma leitura automática
 * do que o boneco "quer" (stats fixos vs. stats que variam muito).
 *
 * Sem jQuery, sem DOM: lógica pura e testável via Node. A UI (janela React) consome isto.
 * Roda no renderer do Electron (tem require de 'https'/'fs') e também em Node puro (testes).
 */

'use strict';

const https = require('https');
const fs = require('fs');
const path = require('path');
const paths = require('./forkPaths.js');

const gameData = require('./gameData.js'); // fonte viva de sets (blindado p/ set novo)

const ENDPOINT = 'https://krivpfvxi0.execute-api.us-west-2.amazonaws.com/dev/getBuilds';
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 dias
const TOP_PATTERNS = 5; // quantos combos de set guardar como "padrões"

// campos de stat vindos do /getBuilds e como exibi-los
const STAT_FIELDS = [
  ['atk', 'ATK', false], ['def', 'DEF', false], ['hp', 'HP', false], ['spd', 'SPD', false],
  ['chc', 'CR', true], ['chd', 'CD', true], ['eff', 'EFF', true], ['efr', 'RES', true],
];
// stats que costumam ser "alvo intencional" (quando fixos, são a assinatura do herói)
const TARGETABLE = new Set(['spd', 'chc', 'chd', 'eff', 'efr']);

// -------------------------------------------------------------- util numérico
function percentile(sortedAsc, p) {
  if (!sortedAsc.length) return 0;
  const idx = Math.min(sortedAsc.length - 1, Math.max(0, Math.round((p / 100) * (sortedAsc.length - 1))));
  return sortedAsc[idx];
}
function median(arr) {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
}
function stdev(arr) {
  if (arr.length < 2) return 0;
  const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
  return Math.sqrt(arr.reduce((a, b) => a + (b - mean) ** 2, 0) / arr.length);
}
function statSummary(values) {
  const s = [...values].sort((a, b) => a - b);
  return {
    min: s[0] || 0,
    p25: percentile(s, 25),
    p50: percentile(s, 50),
    p75: percentile(s, 75),
    p90: percentile(s, 90),
    max: s[s.length - 1] || 0,
  };
}

// combo de set "AttackSet4+CritSet2" a partir de {set_att:"4", set_cri:"2"}
/*
 * A base conta PEÇAS por set, inclusive as soltas ("set_coop":"1"). Só entra no
 * combo o que ATIVA set (múltiplo das peças exigidas): sem isso "Vampire4+Coop1+
 * Speed1" e "Vampire4+Hit1+Speed1" viravam combos diferentes do mesmo Lifesteal 4.
 */
function activePieces(code, n) {
  const need = gameData.setPieces(gameData.SET_CODE_TO_NAME[code]) || 2;
  return Math.floor(n / need) * need;
}
function comboLabel(sets) {
  const parts = Object.entries(sets || {})
    .map(([k, v]) => [gameData.ingameSetShort(k), activePieces(k, parseInt(v, 10) || 0)])
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1]);
  return parts.map(([name, n]) => `${name}${n}`).join('+') || '(sem set)';
}

/*
 * Chave da COMBINAÇÃO de sets ativos, UMA entrada por set ATIVADO (com repetição):
 *   RTA oficial  equip_list = ["set_speed","set_torrent"]  (Speed 4 + Torrent 2)
 *                             ["set_torrent","set_torrent","set_torrent"]  (Torrent ×3)
 *   base Fribbels sets = {"set_torrent":"6"} -> 6 peças ÷ 2 = 3 ativações -> torrent×3;
 *                 peça solta ({"set_acc":"1"}) não ativa nada e fica de fora.
 * As duas viram "set_speed+set_torrent" / "set_torrent+set_torrent+set_torrent".
 * (Até 2026-09-28 a chave tirava a repetição: "torrent×3" do RTA aceitava uma build
 * com UM Torrent + peças soltas.)
 */
function setsKey(codes) { return (codes || []).slice().sort().join('+'); }
function activeSetsKey(sets) {
  const codes = [];
  Object.keys(sets || {}).forEach((k) => {
    const n = parseInt(sets[k], 10) || 0;
    const need = gameData.setPieces(gameData.SET_CODE_TO_NAME[k]) || 2;
    for (let i = 0; i < Math.floor(n / need); i++) codes.push(k);
  });
  return setsKey(codes);
}

/*
 * Regras de importação (Eduardo, 2026-09-28): do MAIOR para o menor gear score,
 * só vale build cuja combinação de sets aparece no RTA importado (`rtaCombos` =
 * listas de códigos, ex. [["set_counter","set_immune"], …]); pega até `n`.
 * Sem combos do RTA (falhou/sem dado): não filtra.
 */
function selectRows(all, n, rtaCombos) {
  const sorted = (all || []).slice().sort((a, b) => (b.gs || 0) - (a.gs || 0));
  const allowed = rtaCombos && rtaCombos.length ? new Set(rtaCombos.map(setsKey)) : null;
  const valid = allowed ? sorted.filter((r) => allowed.has(activeSetsKey(r.sets))) : sorted;
  return { rows: valid.slice(0, n), valid: valid.length, allowed: allowed ? [...allowed] : null };
}

function topCounts(items, top) {
  const c = new Map();
  for (const it of items) c.set(it, (c.get(it) || 0) + 1);
  return [...c.entries()].sort((a, b) => b[1] - a[1]).slice(0, top);
}

// -------------------------------------------------------------- agregação
function aggregateStats(rows) {
  const out = {};
  for (const [f] of STAT_FIELDS) out[f] = statSummary(rows.map((r) => Number(r[f]) || 0));
  return out;
}

// leitura automática: o que o boneco "quer" (fixo) e o que varia
function readIntent(rows) {
  const fixed = [];   // stat com mediana relevante e pouca dispersão -> assinatura
  const variable = []; // stat com muita dispersão -> não-definidor
  for (const [f, label] of STAT_FIELDS) {
    const vals = rows.map((r) => Number(r[f]) || 0);
    const med = median(vals);
    const sd = stdev(vals);
    const cv = med ? sd / med : 99; // coef. de variação
    if (med > 0 && cv < 0.12 && TARGETABLE.has(f)) fixed.push({ stat: f, label, value: med });
    else if (cv > 0.35 && med > 0) variable.push({ stat: f, label });
  }
  return { fixed, variable };
}

// -------------------------------------------------------------- clustering por perfil de stat
const CLUSTER_FIELDS = ['atk', 'def', 'hp', 'spd', 'chc', 'chd', 'eff', 'efr'];

function normalizeVectors(rows) {
  const mins = {}, maxs = {};
  for (const f of CLUSTER_FIELDS) {
    const vals = rows.map((r) => Number(r[f]) || 0);
    mins[f] = Math.min(...vals); maxs[f] = Math.max(...vals);
  }
  const vec = (r) => CLUSTER_FIELDS.map((f) => {
    const span = maxs[f] - mins[f];
    return span > 0 ? ((Number(r[f]) || 0) - mins[f]) / span : 0;
  });
  return rows.map(vec);
}
function dist2(a, b) { let s = 0; for (let i = 0; i < a.length; i++) s += (a[i] - b[i]) ** 2; return s; }
function kmeans(V, k, iters = 30) {
  const cents = [V[0]];
  while (cents.length < k) { // k-means++ determinístico (ponto mais distante)
    let bi = 0, bd = -1;
    for (let i = 0; i < V.length; i++) {
      const d = Math.min(...cents.map((c) => dist2(V[i], c)));
      if (d > bd) { bd = d; bi = i; }
    }
    cents.push(V[bi]);
  }
  let groups = [];
  for (let it = 0; it < iters; it++) {
    groups = Array.from({ length: k }, () => []);
    for (let i = 0; i < V.length; i++) {
      let bj = 0, bd = Infinity;
      for (let j = 0; j < k; j++) { const d = dist2(V[i], cents[j]); if (d < bd) { bd = d; bj = j; } }
      groups[bj].push(i);
    }
    const nc = groups.map((g, j) => g.length
      ? CLUSTER_FIELDS.map((_, d) => g.reduce((a, i) => a + V[i][d], 0) / g.length)
      : cents[j]);
    if (JSON.stringify(nc) === JSON.stringify(cents)) break;
    for (let j = 0; j < k; j++) cents[j] = nc[j];
  }
  const inertia = V.reduce((a, v) => a + Math.min(...cents.map((c) => dist2(v, c))), 0);
  return { groups, inertia };
}
function chooseClusters(rows, maxK = 4, minShare = 0.10) {
  if (rows.length < 40) return [rows.map((_, i) => i)];
  const V = normalizeVectors(rows);
  let best = [V.map((_, i) => i)]; let prev = null;
  for (let k = 1; k <= maxK; k++) {
    const { groups, inertia } = kmeans(V, k);
    if (groups.some((g) => g.length < minShare * rows.length)) break;
    if (prev !== null && inertia > 0.82 * prev) break; // ganho marginal < 18%
    best = groups; prev = inertia;
  }
  return best;
}

// rotulagem heurística (camada 2 — regras genéricas, ajustáveis). Universais: CR/CD/EFF/RES/SPD.
// Escala (atk/hp/def) é comparada RELATIVAMENTE aos outros clusters do mesmo herói.
function labelCluster(stats, allStats) {
  const cr = stats.chc.p50, cd = stats.chd.p50, eff = stats.eff.p50, res = stats.efr.p50, spd = stats.spd.p50;
  let dmg;
  if (cr >= 90) dmg = 'crit 100%';
  else if (cr >= 65) dmg = 'crit ~85% (vant. elemental)';
  else if (cr <= 35 && cd <= 162) dmg = 'sem crit no gear (skill/base)';
  else dmg = 'crit parcial';
  const emphasis = [];
  if (allStats.length > 1) {
    const avg = (k) => allStats.reduce((a, s) => a + s[k].p50, 0) / allStats.length;
    if (stats.hp.p50 > avg('hp') * 1.10) emphasis.push('vida');
    if (stats.def.p50 > avg('def') * 1.10) emphasis.push('defesa');
    if (stats.atk.p50 > avg('atk') * 1.10) emphasis.push('ataque');
    if (stats.spd.p50 > avg('spd') * 1.08) emphasis.push('velocidade');
  }
  const tags = [];
  if (eff >= 100) tags.push('debuff (EFF)'); else if (eff >= 60) tags.push('+EFF');
  if (res >= 90) tags.push('+RES anti-debuff');
  if (spd >= 245) tags.push('rápido');
  return { dmg, emphasis, tags };
}

/*
 * Separa as builds por DOIS eixos, como o Eduardo pediu:
 *   1) COMBO DE SET  — "o que o jogador escolheu vestir"
 *   2) PERFIL DE STAT — dentro do mesmo set, ainda há builds diferentes
 *                       (ex.: mesmo Speed+Torrent, um vai crit e outro vai vida)
 * Só por stat, dois sets diferentes com números parecidos viravam a mesma linha —
 * era o que estava acontecendo antes.
 */
const MIN_COMBO_SHARE = 0.06;  // combo com menos que isso não vira grupo próprio
const MIN_CLUSTER_SHARE = 0.04; // perfil final abaixo disso é ruído, descartado

function buildClusters(rows) {
  const combos = rows.map((r) => comboLabel(r.sets));
  const counts = {};
  combos.forEach((c) => { counts[c] = (counts[c] || 0) + 1; });

  const buckets = [];
  const used = new Set();
  Object.keys(counts)
    .filter((c) => counts[c] / rows.length >= MIN_COMBO_SHARE)
    .sort((a, b) => counts[b] - counts[a])
    .forEach((combo) => {
      const idx = [];
      combos.forEach((c, i) => { if (c === combo) { idx.push(i); used.add(i); } });
      buckets.push({ combo, idx });
    });
  const rest = [];
  combos.forEach((c, i) => { if (!used.has(i)) rest.push(i); });
  if (rest.length / rows.length >= MIN_COMBO_SHARE) buckets.push({ combo: null, idx: rest });
  if (!buckets.length) buckets.push({ combo: null, idx: rows.map((_, i) => i) });

  const out = [];
  for (const b of buckets) {
    const sub = b.idx.map((i) => rows[i]);
    // dentro do combo, separa por perfil de stat (só se houver amostra pra isso)
    const groups = sub.length >= 40 ? chooseClusters(sub, 2, 0.25) : [sub.map((_, i) => i)];
    for (const g of groups) {
      const items = g.map((i) => sub[i]);
      if (items.length / rows.length < MIN_CLUSTER_SHARE) continue;
      out.push({
        sharePct: Math.round((100 * items.length) / rows.length),
        count: items.length,
        combo: b.combo,
        stats: aggregateStats(items),
        sets: topCounts(items.map((r) => comboLabel(r.sets)), 3).map(([combo, n]) => ({ combo, pct: Math.round((100 * n) / items.length) })),
        artifacts: topCounts(items.map((r) => r.artifactCode).filter(Boolean), 3).map(([code, n]) => ({ code, pct: Math.round((100 * n) / items.length) })),
      });
    }
  }
  out.sort((a, b) => b.sharePct - a.sharePct);
  const allStats = out.map((c) => c.stats);
  out.forEach((c) => { c.label = labelCluster(c.stats, allStats); });
  return out;
}

/*
 * SELEÇÃO DE BUILDS REAIS (correção conceitual pedida pelo Eduardo).
 * As builds das listas devem vir CRUAS, como estão na base — o que é fruto de
 * cálculo é a ESCOLHA de quais mostrar, nunca os números.
 *
 * Dois grupos, tirados das 3000 builds reais do /getBuilds:
 *   pro        = as melhores (topo do gear score)  -> "as fodas"
 *   community  = as da média pra cima              -> "as okays"
 *
 * Dentro de cada grupo escolhemos por DIVERSIDADE (farthest-point sampling):
 * pega a melhor, depois sempre a que está mais LONGE das já escolhidas no espaço
 * de stats normalizado. Assim cobrimos o maior número de tipos de build em vez de
 * devolver 50 builds quase idênticas.
 */
const PICK_COUNT = 50;

// linha crua -> build no formato que a tela usa (cr/cd/res como o herói)
function rowToBuild(r, key) {
  return {
    key,
    stats: {
      atk: r.atk, def: r.def, hp: r.hp, spd: r.spd,
      cr: r.chc, cd: r.chd, eff: r.eff, res: r.efr,
    },
    gs: r.gs || 0,
    artifactCode: r.artifactCode || null,
    combo: comboLabel(r.sets),
    sets: r.sets || null,
    date: r.createDate || null,
  };
}

// amostragem do ponto mais distante: máxima variedade de perfis
function pickDiverse(rows, idxPool, count) {
  if (!idxPool.length) return [];
  const V = normalizeVectors(rows);
  // começa pela de maior gear score do pool
  const start = idxPool.reduce((b, i) => ((rows[i].gs || 0) > (rows[b].gs || 0) ? i : b), idxPool[0]);
  const picked = [start];
  const minDist = new Map();
  for (const i of idxPool) minDist.set(i, dist2(V[i], V[start]));
  while (picked.length < Math.min(count, idxPool.length)) {
    let best = -1, bestD = -1;
    for (const i of idxPool) {
      if (minDist.get(i) === -1) continue;
      const d = minDist.get(i);
      if (d > bestD) { bestD = d; best = i; }
    }
    if (best < 0) break;
    picked.push(best);
    minDist.set(best, -1);
    for (const i of idxPool) {
      if (minDist.get(i) === -1) continue;
      const d = dist2(V[i], V[best]);
      if (d < minDist.get(i)) minDist.set(i, d);
    }
  }
  return picked;
}

function pickBuilds(rows) {
  const gsSorted = rows.map((r) => r.gs || 0).sort((a, b) => a - b);
  const p = (q) => percentile(gsSorted, q);
  const hiCut = p(90);   // topo -> pros
  const loCut = p(40);   // média pra cima -> comunidade
  const midCut = p(85);

  const proPool = rows.map((_, i) => i).filter((i) => (rows[i].gs || 0) >= hiCut);
  const comPool = rows.map((_, i) => i).filter((i) => (rows[i].gs || 0) >= loCut && (rows[i].gs || 0) < midCut);

  const pros = pickDiverse(rows, proPool.length ? proPool : rows.map((_, i) => i), PICK_COUNT)
    .map((i, n) => rowToBuild(rows[i], 'pro-' + n));
  const community = pickDiverse(rows, comPool.length ? comPool : rows.map((_, i) => i), PICK_COUNT)
    .map((i, n) => rowToBuild(rows[i], 'com-' + n));

  return {
    pros, community,
    cuts: { proMinGs: Math.round(hiCut), comMinGs: Math.round(loCut), comMaxGs: Math.round(midCut) },
    poolSizes: { pro: proPool.length, community: comPool.length, total: rows.length },
  };
}

/**
 * Destila 3000 builds cruas em um resumo por herói (o que é persistido).
 */
function aggregate(rows) {
  const total = rows.length;
  const withCombo = rows.map((r) => ({ row: r, combo: comboLabel(r.sets) }));

  // padrões = top combos de set, cada um com suas próprias faixas de stat + artefato dominante
  const patterns = topCounts(withCombo.map((x) => x.combo), TOP_PATTERNS).map(([combo, count]) => {
    const sub = withCombo.filter((x) => x.combo === combo).map((x) => x.row);
    const arts = topCounts(sub.map((r) => r.artifactCode).filter(Boolean), 3)
      .map(([code, n]) => ({ code, pct: Math.round((100 * n) / sub.length) }));
    return {
      combo,
      pct: Math.round((100 * count) / total),
      count,
      artifacts: arts,
      stats: aggregateStats(sub),
    };
  });

  const coveredPct = patterns.reduce((a, p) => a + p.pct, 0);

  return {
    sampleSize: total,
    generatedAt: new Date().toISOString(),
    overall: {
      stats: aggregateStats(rows),
      artifacts: topCounts(rows.map((r) => r.artifactCode).filter(Boolean), 5)
        .map(([code, n]) => ({ code, pct: Math.round((100 * n) / total) })),
      sets: topCounts(withCombo.map((x) => x.combo), 8)
        .map(([combo, n]) => ({ combo, pct: Math.round((100 * n) / total) })),
    },
    patterns,
    clusters: buildClusters(rows), // diferenciação por PERFIL DE STAT (não só por set)
    // TODAS as builds baixadas (top N por gear score), cruas — é a lista da aba Construções.
    // (formato `picks` mantido: quem lê é buildsList.collect e forkCalc)
    picks: { pros: [], community: rows.map((r, i) => rowToBuild(r, 'b-' + i)) },
    otherPct: Math.max(0, 100 - coveredPct), // builds fora dos padrões principais (cauda/outliers)
    intent: readIntent(rows),
  };
}

// -------------------------------------------------------------- rede
function fetchRaw(heroName) {
  return new Promise((resolve, reject) => {
    const u = new URL(ENDPOINT);
    const req = https.request(
      { method: 'POST', hostname: u.hostname, path: u.pathname,
        headers: { 'Content-Type': 'text/plain', 'Content-Length': Buffer.byteLength(heroName) } },
      (res) => {
        let data = '';
        res.on('data', (c) => { data += c; });
        res.on('end', () => {
          if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode} para "${heroName}"`));
          try {
            const json = JSON.parse(data);
            resolve(Array.isArray(json.data) ? json.data : []);
          } catch (e) { reject(new Error(`resposta inválida para "${heroName}": ${e.message}`)); }
        });
      }
    );
    req.on('error', reject);
    req.setTimeout(30000, () => req.destroy(new Error(`timeout para "${heroName}"`)));
    req.write(heroName);
    req.end();
  });
}

// -------------------------------------------------------------- cache em disco
function cacheDir() {
  const dir = path.join(paths.savesDir(), 'community');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}
function slug(heroName) {
  return String(heroName).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}
function cachePath(heroName) {
  return path.join(cacheDir(), `${slug(heroName)}.json`);
}
function loadCache(heroName, maxAgeMs = CACHE_TTL_MS) {
  try {
    const p = cachePath(heroName);
    const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
    const age = Date.now() - new Date(raw.generatedAt).getTime();
    return { data: raw, stale: age > maxAgeMs, ageMs: age };
  } catch (e) {
    return null;
  }
}
function saveCache(heroName, data) {
  try {
    fs.writeFileSync(cachePath(heroName), JSON.stringify(data));
    return true;
  } catch (e) {
    return false;
  }
}

// -------------------------------------------------------------- API pública
/*
 * Busca cru + agrega + salva. Sempre vai à rede.
 * `count`: quantas builds usar — as de MAIOR gear score (a base já devolve até
 * 3.000, ordenadas por gs; aqui garantimos a ordem e cortamos).
 * `rtaCombos`: combinações de set do RTA importado — só elas valem (selectRows).
 */
const DEFAULT_COUNT = 1000;
const COUNT_OPTIONS = [100, 250, 500, 1000, 2000, 3000];
async function refreshHero(heroName, count, rtaCombos) {
  // via module.exports: o teste troca rede e disco (roda o fluxo INTEIRO sem internet e sem gravar)
  const all = await module.exports.fetchRaw(heroName);
  const n = Math.max(1, Number(count) || DEFAULT_COUNT);
  const sel = selectRows(all, n, rtaCombos);
  if (!sel.rows.length) {
    throw new Error(all.length ? 'nenhuma build usa as combinações de set do RTA importado' : 'a base não tem builds deste herói');
  }
  const summary = aggregate(sel.rows);
  summary.requested = n;
  summary.available = all.length;
  summary.valid = sel.valid;             // quantas passaram no filtro de sets do RTA (antes do corte em n)
  summary.rtaCombos = sel.allowed;       // null = sem filtro (RTA indisponível)
  summary.name = heroName;
  summary.unitCode = (sel.rows[0] && sel.rows[0].unitCode) || null;
  module.exports.saveCache(heroName, summary);
  return summary;
}

/** Retorna o resumo: usa cache se fresco; senão busca (a menos que offlineOnly). */
async function getHero(heroName, opts = {}) {
  const { force = false, offlineOnly = false, count, rtaCombos } = opts;
  if (!force) {
    const cached = loadCache(heroName);
    if (cached && (!cached.stale || offlineOnly)) return cached.data;
    if (offlineOnly) return cached ? cached.data : null;
  } else if (offlineOnly) {
    const cached = loadCache(heroName, Infinity);
    return cached ? cached.data : null;
  }
  return refreshHero(heroName, count, rtaCombos);
}

/** Atualiza vários (lote dos relevantes). onProgress({name, done, total, ok, error}). */
async function refreshMany(heroNames, onProgress) {
  const results = {};
  let done = 0;
  for (const name of heroNames) {
    try {
      results[name] = await refreshHero(name);
      if (onProgress) onProgress({ name, done: ++done, total: heroNames.length, ok: true });
    } catch (e) {
      results[name] = { error: e.message };
      if (onProgress) onProgress({ name, done: ++done, total: heroNames.length, ok: false, error: e.message });
    }
  }
  return results;
}

module.exports = {
  pickBuilds, rowToBuild, DEFAULT_COUNT, COUNT_OPTIONS,
  ENDPOINT, CACHE_TTL_MS, STAT_FIELDS,
  comboLabel, aggregate, readIntent, statSummary, buildClusters, labelCluster, // puros (testáveis)
  setsKey, activeSetsKey, selectRows,
  fetchRaw, refreshHero, getHero, refreshMany,
  loadCache, saveCache, cachePath, cacheDir,
};
