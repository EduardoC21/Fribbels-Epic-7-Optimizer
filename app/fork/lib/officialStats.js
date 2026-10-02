/*
 * officialStats.js — dados OFICIAIS de RTA da Smilegate (e7api.onstove.com).
 * Diferencial vs. Fribbels: traz WIN RATE por combo de set (qualidade, não só uso),
 * pick/ban e a distribuição de stats do RTA de alto nível (master/legend).
 *
 * IMPORTANTE: os endpoints são POST com params na QUERY STRING (GET dá 500).
 * De Node/Electron funciona direto (sem CORS). Usa https core, sem jQuery/DOM.
 */
'use strict';
const https = require('https');
const fs = require('fs');
const path = require('path');
const paths = require('./forkPaths.js');

const HOST = 'e7api.onstove.com';
const BASE = '/gameApi';
const SEASON_TTL_MS = 24 * 60 * 60 * 1000;      // 1 dia
const ANALYSIS_TTL_MS = 3 * 24 * 60 * 60 * 1000; // 3 dias
const ABILITY_KEYS = ['att', 'def', 'max_hp', 'speed', 'cri', 'cri_dmg', 'acc', 'res'];

function cacheDir() {
  const dir = path.join(paths.savesDir(), 'community', 'official');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function postQuery(apiPath, params) {
  const qs = Object.entries(params).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
  const fullPath = `${BASE}/${apiPath}${qs ? '?' + qs : ''}`;
  return new Promise((resolve, reject) => {
    const req = https.request(
      { method: 'POST', hostname: HOST, path: fullPath,
        headers: { 'Referer': 'https://epic7.onstove.com/', 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json', 'Content-Length': 0 } },
      (res) => {
        let data = '';
        res.on('data', (c) => { data += c; });
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            if (json.code !== 0) return reject(new Error(`${apiPath}: ${json.message || 'code ' + json.code}`));
            resolve(json.value && json.value.result_body ? json.value.result_body : json.value);
          } catch (e) { reject(new Error(`${apiPath}: resposta inválida (${e.message})`)); }
        });
      }
    );
    req.on('error', reject);
    req.setTimeout(30000, () => req.destroy(new Error(`${apiPath}: timeout`)));
    req.end();
  });
}

// ---- season atual (cacheada) ----
let _seasonCache = null;
async function getCurrentSeason() {
  if (_seasonCache && Date.now() - _seasonCache.at < SEASON_TTL_MS) return _seasonCache.code;
  try {
    const p = path.join(cacheDir(), '_season.json');
    const disk = JSON.parse(fs.readFileSync(p, 'utf8'));
    if (Date.now() - disk.at < SEASON_TTL_MS) { _seasonCache = disk; return disk.code; }
  } catch (e) { /* ignore */ }
  const list = await postQuery('getSeasonList', { lang: 'en' });
  const arr = Array.isArray(list) ? list : (list.season_list || []);
  const now = arr.find((s) => s.is_now_season === 1) || arr[0];
  const code = now.season_code;
  _seasonCache = { code, at: Date.now(), name: now.name };
  try { fs.writeFileSync(path.join(cacheDir(), '_season.json'), JSON.stringify(_seasonCache)); } catch (e) { /* */ }
  return code;
}

function parseHist(str) {
  return String(str || '').split(',').map((x) => parseInt(x, 10) || 0);
}

function summarize(rb) {
  const equip = (rb.equip || []).map((e) => ({
    sets: e.equip_list,
    combo: (e.equip_list || []).map((s) => s.replace(/^set_/, '')).join('+'),
    usage: e.rate,
    winRate: e.win_rate,
  }));
  const abillity = {};
  for (const k of ABILITY_KEYS) abillity[k] = parseHist(rb.abillity && rb.abillity[k]);
  const winNow = (rb.win_rate && rb.win_rate[0]) || null;
  return {
    heroCode: rb.heroCode,
    seasonCode: rb.seasonCode,
    grade: rb.seasonTierCode,
    regDate: rb.regDate,
    sampleSize: rb.current_seasontier_tot || null,
    equip,                                  // combos com WIN RATE (qualidade)
    abillity,                               // histograma de cada stat
    recommendSkill: rb.recommend_skill || null,
    pick: rb.pick || null,
    ban: rb.ban || null,
    winRate: winNow ? winNow.win_rate : null,
    rank: winNow ? winNow.rank : null,
    fetchedAt: new Date().toISOString(),
  };
}


/*
 * TIERS do RTA, do topo para a base (códigos confirmados na API — todos retornam
 * amostra e win rate próprios). O padrão do app é puxar de CAMPEÃO pra cima e
 * AGREGAR, porque tier baixo suja o dado (bronze tem WR 34% no mesmo herói que
 * tem 56% em lendário).
 */
const TIERS = [
  { code: 'legend', label: 'Lendário' },
  { code: 'emperor', label: 'Imperador' },
  { code: 'warlord', label: 'Senhor da Guerra' },
  { code: 'champion', label: 'Campeão' },
  { code: 'challenger', label: 'Desafiante' },
  { code: 'master', label: 'Mestre' },
  { code: 'gold', label: 'Ouro' },
  { code: 'silver', label: 'Prata' },
  { code: 'bronze', label: 'Bronze' },
];
const DEFAULT_MIN_TIER = 'champion';
// todos os tiers de `minTier` pra cima (inclusive)
function tiersFrom(minTier) {
  const i = TIERS.findIndex((t) => t.code === (minTier || DEFAULT_MIN_TIER));
  return TIERS.slice(0, i < 0 ? 4 : i + 1).map((t) => t.code);
}

/*
 * Junta vários tiers num resumo só. Uso e win rate viram MÉDIA PONDERADA pelo
 * tamanho da amostra de cada tier — sem isso um tier com 5 jogadores pesaria
 * igual a um com 400.
 */
function mergeTiers(list) {
  const ok = list.filter((r) => r && r.equip);
  if (!ok.length) return null;
  if (ok.length === 1) return ok[0];
  const byCombo = {};
  let totW = 0, wr = 0, samples = 0;
  for (const r of ok) {
    const w = Number(r.sampleSize) || 1;
    totW += w; samples += Number(r.sampleSize) || 0;
    if (r.winRate != null) wr += r.winRate * w;
    for (const e of r.equip) {
      const k = e.combo;
      if (!byCombo[k]) byCombo[k] = { sets: e.sets, combo: k, _uw: 0, _ww: 0, _w: 0 };
      byCombo[k]._uw += (e.usage || 0) * w;
      byCombo[k]._ww += (e.winRate || 0) * w;
      byCombo[k]._w += w;
    }
  }
  const equip = Object.values(byCombo).map((c) => ({
    sets: c.sets, combo: c.combo,
    usage: Math.round((c._uw / c._w) * 100) / 100,
    winRate: Math.round((c._ww / c._w) * 100) / 100,
  })).sort((a, b) => b.winRate - a.winRate);
  const base = ok[0];
  return Object.assign({}, base, {
    equip,
    grade: ok.map((r) => r.grade).join('+'),
    tiers: ok.map((r) => r.grade),
    sampleSize: samples,
    winRate: Math.round((wr / totW) * 100) / 100,
  });
}

// resumo agregado de `minTier` pra cima
async function getHeroFromTier(heroCode, opts = {}) {
  const codes = tiersFrom(opts.minTier);
  const out = [];
  for (const g of codes) {
    try { out.push(await module.exports.getHero(heroCode, Object.assign({}, opts, { grade: g }))); }
    catch (e) { /* tier sem dado não invalida os demais */ }
  }
  return mergeTiers(out);
}

function diskPath(heroCode, grade) { return path.join(cacheDir(), `${heroCode}_${grade}.json`); }

async function fetchHero(heroCode, opts = {}) {
  const grade = opts.grade || 'master';
  const season = opts.season || await getCurrentSeason();
  const rb = await postQuery('getHeroAnalysis', { hero_code: heroCode, season_code: season, grade_code: grade, lang: 'en' });
  const summary = summarize(rb);
  try { fs.writeFileSync(diskPath(heroCode, grade), JSON.stringify(summary)); } catch (e) { /* */ }
  return summary;
}

async function getHero(heroCode, opts = {}) {
  const grade = opts.grade || 'master';
  if (!opts.force) {
    try {
      const disk = JSON.parse(fs.readFileSync(diskPath(heroCode, grade), 'utf8'));
      const age = Date.now() - new Date(disk.fetchedAt).getTime();
      if (age < ANALYSIS_TTL_MS || opts.offlineOnly) return disk;
    } catch (e) { if (opts.offlineOnly) return null; }
  } else if (opts.offlineOnly) {
    try { return JSON.parse(fs.readFileSync(diskPath(heroCode, grade), 'utf8')); } catch (e) { return null; }
  }
  return fetchHero(heroCode, opts);
}

module.exports = { getCurrentSeason, fetchHero, getHero, summarize, ABILITY_KEYS,
  TIERS, DEFAULT_MIN_TIER, tiersFrom, getHeroFromTier, mergeTiers,
};
