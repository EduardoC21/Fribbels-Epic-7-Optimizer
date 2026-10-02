/*
 * archetypes.js — arquétipos DE PERSONAGEM (fork), GLOBAIS (nota 20).
 *
 * Um arquétipo é um PRESET do otimizador: o mesmo formato da caixa Personagem da
 * aba Otimizador (optimizerProfile: sets por slot, mains de colar/anel/bota,
 * prioridade −1..3 e mín/máx por stat) + nome + SÍMBOLO. Escolher o arquétipo no
 * Otimizador do herói SUBSTITUI tudo isso no herói (OP.applyArchetype).
 *
 *   symbol = { bg, fg, main, subs }
 *     bg/fg  cor do fundo e dos símbolos (#rrggbb, qualquer uma)
 *     main   classe do jogo (CLASSES) — o símbolo grande
 *     subs   0 a 3 stats (chaves do otimizador: atk…res), na ordem escolhida
 *
 * Gravado em Documents/FribbelsOptimizerSaves/archetypes.json ({ version: 2, archetypes }).
 * O arquivo do usuário é a única fonte (a lista embutida antiga saiu em 2026-09-28).
 */
'use strict';
const fs = require('fs');
const path = require('path');
const paths = require('./forkPaths.js');
const OP = require('./optimizerProfile.js');
const { GEM_MODES } = require('./itemRatings.js');

// as 6 classes do jogo (role do herodata), na ordem do jogo — nomes em ui/features/sidebar/order.js
const CLASSES = ['warrior', 'knight', 'assassin', 'ranger', 'mage', 'manauser'];
const MAX_SUBS = 3;
const HEX = /^#[0-9a-f]{6}$/i;
const DEFAULT_FG = '#f1ede6';

// teste troca por module.exports.userFile (nunca o arquivo real)
function userFile() {
  return path.join(paths.savesDir(), 'archetypes.json');
}

/* cor de fundo de um arquétipo novo: um tom escuro qualquer, para a lista não virar tudo igual */
function randomBg() {
  const h = Math.floor(Math.random() * 360) / 360;
  const s = 0.42;
  const l = 0.3;
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const ch = (t) => {
    const x = t < 0 ? t + 1 : (t > 1 ? t - 1 : t);
    const v = x < 1 / 6 ? p + (q - p) * 6 * x : x < 1 / 2 ? q : x < 2 / 3 ? p + (q - p) * (2 / 3 - x) * 6 : p;
    return Math.round(v * 255).toString(16).padStart(2, '0');
  };
  return '#' + ch(h + 1 / 3) + ch(h) + ch(h - 1 / 3);
}

function normSymbol(s) {
  const x = s || {};
  const subs = (Array.isArray(x.subs) ? x.subs : []).filter((k, i, a) => OP.STATS.includes(k) && a.indexOf(k) === i);
  return {
    bg: HEX.test(x.bg) ? x.bg.toLowerCase() : '#3a3632',
    fg: HEX.test(x.fg) ? x.fg.toLowerCase() : DEFAULT_FG,
    main: CLASSES.includes(x.main) ? x.main : CLASSES[0],
    subs: subs.slice(0, MAX_SUBS),
  };
}

/* arquétipo completo e bem formado (o arquivo pode ter sido editado à mão) */
function normalize(a) {
  const x = a || {};
  const prof = OP.applyArchetype(OP.emptyProfile(), x);
  // corte de interesse próprio (% de potencial); null = usa o global (lib/interest.js)
  const min = Number(x.interestMin);
  const interestMin = x.interestMin != null && x.interestMin !== '' && isFinite(min) ? Math.max(0, Math.min(150, Math.round(min))) : null;
  // pedra fixada (regra da Cobertura); null = a padrão dos perfis
  const gemMode = GEM_MODES.includes(x.gemMode) ? x.gemMode : null;
  return { id: String(x.id || ''), name: String(x.name || ''), symbol: normSymbol(x.symbol), sets: prof.sets, mains: prof.mains, stats: prof.stats, interestMin, gemMode };
}

function list(file) {
  let raw = [];
  try { raw = JSON.parse(fs.readFileSync(file || module.exports.userFile(), 'utf8')).archetypes || []; } catch (e) { raw = []; }
  return raw.filter((a) => a && a.id).map(normalize);
}
function get(id) { return (id && list().find((a) => a.id === id)) || null; }

/* grava a lista inteira (arquivo temporário + rename: não corta o arquivo no meio) */
function save(arr, file) {
  const f = file || module.exports.userFile();
  const tmp = f + '.fork-tmp';
  fs.writeFileSync(tmp, JSON.stringify({ version: 2, archetypes: arr.map(normalize) }, null, 2));
  fs.renameSync(tmp, f);
}

/* um arquétipo novo, vazio (todas as barras em 0, sets/mains livres) */
function create(name) {
  return normalize({
    id: 'arq_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
    name: name || 'Novo arquétipo',
    symbol: { bg: randomBg(), fg: DEFAULT_FG, main: CLASSES[0], subs: [] },
  });
}

module.exports = { CLASSES, MAX_SUBS, HEX, userFile, normalize, normSymbol, list, get, save, create };
