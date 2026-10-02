/*
 * gameConstants.js (fork) — BLINDAGEM das constantes do jogo.
 *
 * Regra do projeto: tudo que é fixo do jogo e já existe em código que NÃO é nosso
 * deve ser lido de lá, nunca copiado. Assim, quando o mantenedor original atualizar
 * (novo set, rebalance de bônus, etc.), a gente herda a mudança sem tocar em nada.
 *
 * Fontes, em ordem de preferência:
 *   1. `app/js/lib/constants.js`      — setsByIndex, piecesBySetIndex (upstream JS)
 *   2. `app/js/lib/assets.js`         — mapas de asset por set/stat/classe/elemento
 *   3. fallback nosso — só se a fonte sumir.
 *
 * Fórmula de stat (bônus de set, imprint, artefato, dano…) NÃO mora mais aqui:
 * quem calcula é o BACKEND, pelas rotas /fork/* (lib/forkCalc.js). Antes este
 * arquivo lia o StatCalculator.java por texto — frágil e ausente no .exe.
 *
 * `report()` diz de onde veio cada coisa, para a manutenção não ficar às cegas.
 */
'use strict';
const fs = require('fs');
const path = require('path');

// ---------- 1) constants.js do app clássico ----------
let upstreamConstants = null;
try { upstreamConstants = require('../../js/lib/constants.js'); } catch (e) { upstreamConstants = null; }

// ---------- 2) assets.js do app clássico ----------
let upstreamAssets = null;
try { upstreamAssets = require('../../js/lib/assets.js'); } catch (e) { upstreamAssets = null; }

// ---------- sets (índices e peças) ----------
function setsByIndex() {
  const u = upstreamConstants && upstreamConstants.setsByIndex;
  return (Array.isArray(u) && u.length) ? u : [];
}
function piecesBySetIndex() {
  const u = upstreamConstants && upstreamConstants.piecesBySetIndex;
  return (Array.isArray(u) && u.length) ? u : [];
}
// quantas peças aquele set exige (2 ou 4) — lido do upstream, não chutado
function piecesRequired(setName) {
  const i = setsByIndex().indexOf(setName);
  const p = piecesBySetIndex();
  if (i >= 0 && p[i]) return p[i];
  return 2;
}
function isFourPiece(setName) { return piecesRequired(setName) === 4; }
function indexOfSet(setName) { return setsByIndex().indexOf(setName); }

// ---------- assets ----------
// os caminhos do upstream são relativos à raiz do app ("./assets/x.png");
// a janela do fork roda em app/fork, então viram "../assets/x.png".
function reRoot(p) { return typeof p === 'string' ? p.replace(/^\.\//, '../') : p; }
function assetBySet(setName) {
  try {
    const m = upstreamAssets && upstreamAssets.getAssetsBySet && upstreamAssets.getAssetsBySet();
    if (m && m[setName]) return reRoot(m[setName]);
  } catch (e) { /* upstream pode depender de globals */ }
  return null;
}
function assetByStat(stat) {
  try {
    const m = upstreamAssets && upstreamAssets.getAssetsByStat && upstreamAssets.getAssetsByStat();
    if (m && m[stat]) return reRoot(m[stat]);
  } catch (e) { /* idem */ }
  return null;
}


/* ---------- tabelas privadas do reforge.js do app clássico ----------
 * O reforge.js só exporta funções; estas tabelas são `const` de módulo. Como são
 * literais simples, extraímos por parsing balanceado e avaliamos. É preferível a
 * copiar os números: se o upstream rebalancear, herdamos.
 */
function findJs(rel) {
  const cands = [path.resolve(__dirname, '../../js/lib', rel), path.resolve(process.cwd(), 'app/js/lib', rel)];
  for (const c of cands) { if (fs.existsSync(c)) return c; }
  return null;
}
let _reforgeSrc;
function reforgeSource() {
  if (_reforgeSrc !== undefined) return _reforgeSrc;
  const f = findJs('reforge.js');
  try { _reforgeSrc = f ? fs.readFileSync(f, 'utf8') : null; } catch (e) { _reforgeSrc = null; }
  return _reforgeSrc;
}
function parseLiteral(src, name) {
  if (!src) return null;
  const i = src.indexOf('const ' + name + ' = ');
  if (i < 0) return null;
  const start = src.indexOf('{', i);
  if (start < 0) return null;
  let d = 0, end = -1;
  for (let j = start; j < src.length; j++) {
    if (src[j] === '{') d += 1;
    else if (src[j] === '}') { d -= 1; if (d === 0) { end = j + 1; break; } }
  }
  if (end < 0) return null;
  try { return new Function('return ' + src.slice(start, end))(); } catch (e) { return null; }
}
const _cache = {};
function fromReforge(name) {
  if (!(name in _cache)) _cache[name] = parseLiteral(reforgeSource(), name);
  return _cache[name];
}
// valor do MAIN stat no +15 (Attack 525, Speed 45, …) — upstream reforge.js
function mainStatValues() { return fromReforge('mainStatValuesByStatType'); }
// pesos de qualidade de roll (Speed 8/4=2, CC 8/5=1.6, CD 8/7≈1.14) — upstream
function substatWeights() { return fromReforge('substatWeights'); }
// faixas de substatus PERCENTUAIS por nível de item (85 / 88)
function substatRangesByLevel() { return fromReforge('plainStatsByLevel'); }
// faixas de substatus FLAT por nível de item (85 / 88)
function flatRangesByLevel() { return fromReforge('flatsByLevel'); }
// valor máximo de UM roll daquele stat, no nível do item (85 por padrão)
function maxRollValue(stat, level) {
  const t = substatRangesByLevel();
  const tier = (level === 88) ? '88' : '85';
  const tbl = t && t[tier];
  if (!tbl) return null;
  if (tbl[stat]) return tbl[stat].max;
  return tbl.Plain ? tbl.Plain.max : null;
}
// rolls -> valor (tabela do constants.js do app clássico)
function speedRollsToValue() { return (upstreamConstants && upstreamConstants.speedRollsToValue) || null; }
function modValues() { return (upstreamConstants && upstreamConstants.modValues) || null; }

function report() {
  return {
    constantsJs: upstreamConstants ? 'upstream app/js/lib/constants.js' : 'INDISPONÍVEL (usando fallback)',
    assetsJs: upstreamAssets ? 'upstream app/js/lib/assets.js' : 'INDISPONÍVEL (usando mapa próprio)',
    reforgeJs: reforgeSource() ? 'upstream app/js/lib/reforge.js (tabelas por parsing)' : 'INDISPONÍVEL',
    tabelasUpstream: {
      mainStatValues: mainStatValues() ? 'ok' : 'fallback',
      substatWeights: substatWeights() ? 'ok' : 'fallback',
      substatRanges: substatRangesByLevel() ? 'ok' : 'fallback',
      speedRollsToValue: speedRollsToValue() ? 'ok' : 'fallback',
    },
    sets: setsByIndex().length + ' sets conhecidos',
  };
}

module.exports = {
  mainStatValues, substatWeights, substatRangesByLevel, flatRangesByLevel, maxRollValue,
  speedRollsToValue, modValues,
  setsByIndex, piecesBySetIndex, piecesRequired, isFourPiece, indexOfSet,
  assetBySet, assetByStat, report,
};
