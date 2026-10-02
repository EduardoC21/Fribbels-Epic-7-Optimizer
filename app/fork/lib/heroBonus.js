/*
 * heroBonus.js (fork) — ARTEFATO, EE (equipamento exclusivo) e IMPRINT do herói.
 *
 * Esses três dão stats FORA do gear — é essencial separá-los para saber quanto do
 * poder vem dos equipamentos e quanto vem de imprint/artefato (os pros costumam ter
 * imprint alto, a conta do usuário não).
 *
 * Fontes (todas locais):
 *  - Artefato: accountHero.artifact{Name,Level,Attack,Health,Defense} (backend) +
 *    data/cache/artifactdata.json (raridade/classe/code).
 *  - EE:      herodata[hero].ex_equip = [{stat:{type,value}}]; valor aplicado em
 *             accountHero.eeNumber. Só ~135 dos 388 heróis têm EE.
 *  - Imprint: herodata[hero].self_devotion = {type, grades{B,A,S,SS,SSS}}; valor
 *             aplicado em accountHero.imprintNumber.
 *
 * Convenção do jogo (igual dialog.js do app clássico): tipos "flat" usam o valor
 * cru; os demais são taxas decimais e viram % (×100).
 *
 * NENHUMA fórmula de stat aqui: os stats do artefato por nível e a gravação dos
 * bônus (tirar o valor antigo dos campos aei* e somar o novo) são do BACKEND —
 * /fork/artifactStats e /fork/setBonus (backend/src/main/java/com/fribbels/fork).
 * Este módulo só lê o herodata (tipos/valores de imprint e EE, catálogo de artefatos).
 */
'use strict';
const fs = require('fs');
const path = require('path');
const paths = require('./forkPaths.js');
const heroList = require('./heroList.js');

// tipos de stat do jogo (e7) -> rótulo, ícone (chave de assets.statIcon) e se é %
const E7_STAT = {
  att: { label: 'Ataque', short: 'ATK', icon: 'atk', pct: false },
  att_rate: { label: 'Ataque', short: 'ATK', icon: 'atk', pct: true },
  max_hp: { label: 'Vida', short: 'HP', icon: 'hp', pct: false },
  max_hp_rate: { label: 'Vida', short: 'HP', icon: 'hp', pct: true },
  def: { label: 'Defesa', short: 'DEF', icon: 'def', pct: false },
  def_rate: { label: 'Defesa', short: 'DEF', icon: 'def', pct: true },
  speed: { label: 'Velocidade', short: 'SPD', icon: 'spd', pct: false },
  cri: { label: 'Chance Crítica', short: 'CC', icon: 'chc', pct: true },
  acc: { label: 'Eficácia', short: 'EFF', icon: 'eff', pct: true },
  res: { label: 'Resistência', short: 'RES', icon: 'efr', pct: true },
  coop: { label: 'Ataque Duplo', short: 'DUAL', icon: null, pct: true },
};
// no jogo esses quatro são valores absolutos; o resto é taxa (decimal -> %)
const FLAT_TYPES = ['max_hp', 'speed', 'att', 'def'];

function statInfoOf(type) { return E7_STAT[type] || { label: type, short: type, icon: null, pct: false }; }
function isFlat(type) { return FLAT_TYPES.indexOf(type) >= 0; }
const round1 = (v) => Math.round(v * 10) / 10;
function num(v) {
  if (v == null || v === 'None' || v === '') return null;
  const n = parseFloat(v);
  return isNaN(n) ? null : n;
}
// converte o valor cru do herodata para o que o jogo/app exibem
function displayValue(type, rawValue) { return isFlat(type) ? rawValue : round1(rawValue * 100); }

let _artData = null;
function artifactData() {
  if (!_artData) {
    try { _artData = JSON.parse(fs.readFileSync(path.join(paths.dataDir(), 'cache', 'artifactdata.json'), 'utf8')); }
    catch (e) { _artData = {}; }
  }
  return _artData;
}

// código do artefato -> nome (o /getBuilds da comunidade devolve só o code)
let _byCode = null;
function artifactByCode(code) {
  if (!_byCode) {
    _byCode = {};
    const d = artifactData();
    Object.keys(d).forEach((n) => { if (d[n] && d[n].code) _byCode[d[n].code] = n; });
  }
  return _byCode[code] || null;
}

// ---- ARTEFATO equipado (null se o herói não está na conta ou está sem artefato) ----
function artifact(accountHero) {
  const name = accountHero && accountHero.artifactName;
  if (!name || name === 'None') return null;
  const meta = artifactData()[name] || {};
  const lvl = num(accountHero.artifactLevel);
  // ATK/HP/DEF do artefato no nível atual: o backend calcula em getAllHeroes
  return {
    name,
    level: lvl,
    attack: num(accountHero.artifactAttack) || 0,
    health: num(accountHero.artifactHealth) || 0,
    defense: num(accountHero.artifactDefense) || 0,
    rarity: meta.rarity || null,
    role: meta.role || null,
    code: meta.code || null,
  };
}

// ---- EE (equipamento exclusivo). null = este herói NÃO tem EE no jogo ----
function ee(heroName, accountHero) {
  const hd = heroList.rawByName(heroName);
  const ex = hd && hd.ex_equip && hd.ex_equip[0];
  if (!ex || !ex.stat) return null;
  const type = ex.stat.type;
  const base = displayValue(type, ex.stat.value); // valor no nível 1
  return {
    type, info: statInfoOf(type), pct: !isFlat(type),
    base, max: round1(base * 2),                   // EE escala até ~2× o base
    value: num(accountHero && accountHero.eeNumber), // aplicado na conta (null = não informado)
  };
}

// ---- IMPRINT (self devotion). null = herodata sem self_devotion ----
function imprint(heroName, accountHero) {
  const hd = heroList.rawByName(heroName);
  const sd = hd && hd.self_devotion;
  if (!sd || !sd.grades) return null;
  const type = sd.type;
  const grades = {};
  for (const g of Object.keys(sd.grades)) grades[g] = displayValue(type, sd.grades[g]);
  const value = num(accountHero && accountHero.imprintNumber);
  // o imprint é contínuo (o valor fica ENTRE graus), então o grau exibido é o
  // GRAU ATINGIDO: o maior cujo valor ainda é <= o aplicado.
  const gradeKeys = Object.keys(grades).sort((a, b) => grades[a] - grades[b]);
  let grade = null;
  if (value != null) {
    for (const g of gradeKeys) { if (value + 0.05 >= grades[g]) grade = g; }
  }
  return {
    type, info: statInfoOf(type), pct: !isFlat(type),
    grades, value, grade,
    max: grades[gradeKeys[gradeKeys.length - 1]], // normalmente SSS
    maxGrade: gradeKeys[gradeKeys.length - 1],
  };
}

// formata um valor já convertido
function fmt(pct, v) {
  if (v == null) return '—';
  return pct ? round1(v) + '%' : Math.round(v).toLocaleString('pt-BR');
}

// ---- ARTEFATOS: catálogo e arte (stats por nível: backend, /fork/artifactStats) ----
const ARTIFACT_MAX_LEVEL = 30;
// catálogo; se `role` vier, mantém os do herói + os universais (role vazio)
function artifactList(role) {
  const d = artifactData();
  return Object.keys(d)
    .map((n) => ({ name: n, rarity: d[n].rarity || 0, role: d[n].role || '', code: d[n].code || '', stats: d[n].stats || {} }))
    .filter((a) => !role || !a.role || a.role === role)
    .sort((a, b) => (b.rarity - a.rarity) || a.name.localeCompare(b.name));
}
// arte do artefato — CDN oficial da Smilegate (o app clássico usa o mesmo endereço)
const ART_CDN = 'https://static.smilegatemegaport.com/event/live/epic7/guide/wearingStatus/images/artifact/';
function artifactIcon(code) { return code && code.length > 2 ? ART_CDN + code + '_ico.png' : ''; }
// fallback: epic7db por slug (minúsculas, apóstrofo REMOVIDO, resto vira '-')
function artifactIconFallback(name) {
  const slug = String(name || '').toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return slug ? `https://epic7db.com/images/artifacts/${slug}.webp` : '';
}

// ---- gravação: pedido para /fork/setBonus (a CONTA é feita no backend) ----
// tipo de stat do jogo -> campo aei* que o backend usa (dado, não fórmula; mesma
// ideia do e7StatToBonusStat do app clássico)
const E7_TO_AEI = {
  att: 'aeiAtk', def: 'aeiDef', max_hp: 'aeiHp',
  att_rate: 'aeiAtkPercent', def_rate: 'aeiDefPercent', max_hp_rate: 'aeiHpPercent',
  speed: 'aeiSpeed', cri: 'aeiCr', cri_dmg: 'aeiCd', acc: 'aeiEff', res: 'aeiRes',
  // coop (ataque duplo) não tem campo aei -> ignorado
};

/*
 * Estado DESEJADO dos três bônus depois de aplicar `changes` sobre o herói atual.
 * `changes` aceita: {artifactName, artifactLevel, imprintValue, eeValue} (ausente = mantém).
 * O backend lê do herói guardado o que está aplicado hoje, tira e põe o novo.
 */
function buildSetBonusRequest(hero, heroName, changes) {
  const c = changes || {};
  const impInfo = imprint(heroName, hero);
  const eeInfo = ee(heroName, hero);
  const pick = (key, cur) => (key in c ? c[key] : cur);
  const imp = pick('imprintValue', num(hero.imprintNumber));
  const eev = pick('eeValue', num(hero.eeNumber));
  const artName = pick('artifactName', hero.artifactName || 'None');
  const artLevel = 'artifactLevel' in c ? (Number(c.artifactLevel) || 0) : (num(hero.artifactLevel) || 0);
  return {
    heroId: hero.id,
    imprintField: (impInfo && E7_TO_AEI[impInfo.type]) || null,
    imprintValue: imp == null ? null : Number(imp),
    eeField: (eeInfo && E7_TO_AEI[eeInfo.type]) || null,
    eeValue: eev == null ? null : Number(eev),
    artifactName: artName && artName !== 'None' ? artName : null,
    artifactLevel: artLevel,
  };
}

module.exports = {
  artifact, ee, imprint, fmt, statInfoOf, isFlat, displayValue, E7_STAT,
  artifactList, artifactIcon, artifactIconFallback, artifactByCode, ARTIFACT_MAX_LEVEL,
  buildSetBonusRequest, E7_TO_AEI,
};
