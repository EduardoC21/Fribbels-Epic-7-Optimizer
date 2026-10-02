/*
 * assets.js (fork) — caminhos de ícones/retratos para a janela nova.
 * Caminhos relativos a app/fork/index.html: ../assets (= app/assets) e
 * ../../data/cachedimages (= data/cachedimages). Espelha app/js/lib/assets.js
 * mas sem depender de globals (DarkMode etc.).
 */
'use strict';

const A = '../assets/';
// BLINDADO: quando o app clássico tiver o asset, usamos o dele (sets novos entram sozinhos)
let gc = null;
try { gc = require('./gameConstants.js'); } catch (e) { gc = null; }

// attribute do herodata (dark/fire/ice/light/wind) -> ícone (wind usa elementearth.png)
const ELEMENT = {
  dark: A + 'elementdark.png', fire: A + 'elementfire.png', ice: A + 'elementice.png',
  light: A + 'elementlight.png', wind: A + 'elementearth.png', earth: A + 'elementearth.png',
};
const CLASS = {
  assassin: A + 'classassassin.png', knight: A + 'classknight.png', mage: A + 'classmage.png',
  manauser: A + 'classmanauser.png', ranger: A + 'classranger.png', warrior: A + 'classwarrior.png',
};
const SET = {
  HealthSet: 'sethealth', DefenseSet: 'setdefense', AttackSet: 'setattack', SpeedSet: 'setspeed',
  CriticalSet: 'setcritical', HitSet: 'sethit', DestructionSet: 'setdestruction', LifestealSet: 'setlifesteal',
  CounterSet: 'setcounter', ResistSet: 'setresist', UnitySet: 'setunity', RageSet: 'setrage',
  ImmunitySet: 'setimmunity', RevengeSet: 'setrevenge', InjurySet: 'setinjury', PenetrationSet: 'setpenetration',
  ProtectionSet: 'setprotection', TorrentSet: 'settorrent', ReversalSet: 'setreversal', RiposteSet: 'setriposte',
  WarfareSet: 'setwarfare', PursuitSet: 'setpursuit', WeakeningSet: 'setweakening', FervorSet: 'setfervor',
};
// chaves curtas de stat -> ícone (versão dark)
const STAT = {
  atk: 'statatkdark', def: 'statdefdark', hp: 'stathpdark', spd: 'statspddark',
  chc: 'statcrdark', chd: 'statcddark', eff: 'stateffdark', efr: 'statresdark',
};

function element(attribute) { return ELEMENT[attribute] || ''; }
function klass(role) { return CLASS[role] || ''; }
function setIcon(setName) {
  const up = gc && gc.assetBySet && gc.assetBySet(setName);
  if (up) return up;
  return SET[setName] ? A + SET[setName] + '.png' : '';
}
function statIcon(shortKey) { return STAT[shortKey] ? A + STAT[shortKey] + '.png' : ''; }
// tipo de peça (slot do backend: Weapon/Helmet/Armor/Necklace/Ring/Boots) -> ícone do jogo
function gearIcon(slot) { return slot ? A + 'gear' + String(slot).toLowerCase() + '.png' : ''; }
function portrait(code) { return code ? `../../data/cachedimages/${code}_s.png` : ''; }
function starBase() { return A + 'star_dt.png'; }        // estrela branca (nº base de estrelas do herói)
function starFav() { return A + 'cm_icon_star_j.png'; }  // estrela do jogo (favorito)
// ícone do grau de imprint (B/A/S/SS/SSS — também existem C/D nos assets)
const IMPRINT_GRADES = ['D', 'C', 'B', 'A', 'S', 'SS', 'SSS'];
function imprintGrade(grade) { return grade && IMPRINT_GRADES.includes(grade) ? A + 'imprint' + grade + '.png' : ''; }

/* arte do PRÓPRIO fork (app/fork/assets) */
const F = 'assets/';
/*
 * Símbolos do jogo MONOCROMÁTICOS, a partir de prints que o Eduardo mandou
 * (2026-09-28). Usados como MÁSCARA (components/Icon.js GameGlyph): a cor vem do
 * CSS (currentColor), nunca do arquivo — sem fundo, sem degradê.
 *   artifact  raio                          → artefato
 *   ee        mancha com adaga vazada       → EE (equipamento exclusivo)
 *   imprint   mira (anel + 4 setas)         → imprint
 *   modified  duas setas em círculo         → substatus modificado (gema)
 *   modify    espada diagonal + 2 setas     → botão "modificar substatus"
 *   reforge   espada com explosão           → reforja (recorte do jogo, reforge.png)
 */
const GAME_GLYPHS = { artifact: 'glyph-artifact.svg', ee: 'glyph-ee.svg', imprint: 'glyph-imprint.svg',
  modified: 'glyph-modified.svg', modify: 'glyph-modify.svg', reforge: 'reforge.png' };
const gameGlyph = (name) => (GAME_GLYPHS[name] ? F + GAME_GLYPHS[name] : '');

module.exports = { element, klass, setIcon, statIcon, gearIcon, portrait, starBase, starFav, imprintGrade, gameGlyph, GAME_GLYPHS, SET, STAT };
