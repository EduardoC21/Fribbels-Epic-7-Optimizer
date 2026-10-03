/*
 * maintenance.js — ações de manutenção da tela Configurações (sem React).
 *
 * Trocar a pasta dos saves (switchFolder): os arquivos do fork + o autosave são COPIADOS para a pasta nova e
 * conferidos por hash; só então o settings.ini do clássico passa a apontar para ela (forkPaths.setSavesDir). A pasta
 * antiga fica intacta. Quem chama grava a conta antes (forkSave) e reinicia o app depois: o clássico só relê a
 * pasta ao abrir. Pasta nova que já tem autosave.json = usar o que está lá (nada é copiado nem sobrescrito).
 * Ficam na pasta fixa (forkPaths.homeDir): settings.ini e escuta/.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const paths = require('./forkPaths.js');

// o que é "save" (vai junto ao trocar de pasta): arquivos e pastas, relativos à pasta dos saves
const SAVE_FILES = ['autosave.json', 'relevance.json', 'archetypes.json', 'marked-builds.json'];
const SAVE_DIRS = ['community'];
const BACKUP_PREFIX = 'backup-limpeza-';

const hashOf = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');

/* copia arquivo ou pasta (recursiva) e confere cada arquivo por hash; lança na 1ª diferença */
function copyChecked(src, dst) {
  if (fs.statSync(src).isDirectory()) {
    fs.mkdirSync(dst, { recursive: true });
    fs.readdirSync(src).forEach((n) => copyChecked(path.join(src, n), path.join(dst, n)));
    return;
  }
  fs.copyFileSync(src, dst);
  if (hashOf(src) !== hashOf(dst)) throw new Error('cópia diferente do original: ' + dst);
}

/* o que existe hoje na pasta `dir` para levar (nomes relativos) */
function saveEntries(dir) {
  const backups = fs.existsSync(dir) ? fs.readdirSync(dir).filter((n) => n.startsWith(BACKUP_PREFIX)) : [];
  return SAVE_FILES.concat(SAVE_DIRS, backups).filter((n) => fs.existsSync(path.join(dir, n)));
}

const samePath = (a, b) => path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();
const hasSave = (dir) => fs.existsSync(path.join(dir, 'autosave.json'));

/* { mode: 'same' | 'use' | 'copy', entries } — o que switchFolder faria (para a confirmação) */
function planSwitch(dest) {
  const src = paths.savesDir();
  if (samePath(src, dest)) return { mode: 'same', entries: [] };
  if (hasSave(dest)) return { mode: 'use', entries: [] };
  return { mode: 'copy', entries: saveEntries(src) };
}

function switchFolder(dest) {
  const plan = planSwitch(dest);
  if (plan.mode === 'same') return plan;
  const src = paths.savesDir();
  fs.mkdirSync(dest, { recursive: true });
  plan.entries.forEach((n) => copyChecked(path.join(src, n), path.join(dest, n)));
  paths.setSavesDir(dest);
  return plan;
}

module.exports = { SAVE_FILES, SAVE_DIRS, BACKUP_PREFIX, hashOf, copyChecked, saveEntries, planSwitch, switchFolder };
