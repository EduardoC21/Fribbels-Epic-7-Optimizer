/*
 * forkPaths.js — resolução de caminhos compartilhada pelos módulos do fork.
 * Centraliza o que estava duplicado em heroList/archetypes/gameRules/relevance/
 * communityBuilds/officialStats (documentsDir, pasta de saves, pasta data/).
 *
 * Duas pastas:
 *   homeDir()  Documents/FribbelsOptimizerSaves, FIXA: settings.ini do clássico (que diz onde estão os saves) e
 *              escuta/ (o escuta.py grava lá, caminho fixo no Python)
 *   savesDir() a pasta dos saves = `settingDefaultPath` do settings.ini (a MESMA do clássico, que carrega o
 *              autosave dela ao abrir); sem settings.ini ou pasta inexistente = homeDir(). Trocar a pasta
 *              (setSavesDir) só vale depois de reiniciar o app — o clássico guarda a pasta na memória.
 * Teste: FORK_HOME_DIR / FORK_SAVES_DIR trocam as duas (nunca tocar a pasta real).
 */
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');

function documentsDir() {
  try {
    // eslint-disable-next-line global-require
    return require('@electron/remote').app.getPath('documents');
  } catch (e) {
    return path.join(os.homedir(), 'Documents');
  }
}

function homeDir() {
  const dir = process.env.FORK_HOME_DIR || path.join(documentsDir(), 'FribbelsOptimizerSaves');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

const settingsIni = () => path.join(homeDir(), 'settings.ini');

function readIni() {
  try { return JSON.parse(fs.readFileSync(settingsIni(), 'utf8')) || null; } catch (e) { return null; }
}

// lida uma vez por processo: a troca só vale depois de reiniciar (o clássico também só relê ao abrir)
let saves = null;
function savesDir() {
  if (process.env.FORK_SAVES_DIR) return process.env.FORK_SAVES_DIR;
  if (!saves) {
    const s = readIni();
    const p = s && s.settingDefaultPath;
    saves = p && fs.existsSync(p) ? path.normalize(p) : homeDir();
  }
  return saves;
}

/* grava a pasta dos saves no settings.ini do clássico (só o campo settingDefaultPath; o resto fica como está).
   Sem settings.ini legível recusa: escrever um incompleto quebraria a leitura do clássico. */
function setSavesDir(dir) {
  const s = readIni();
  if (!s) throw new Error('settings.ini ausente ou ilegível — abra o app uma vez antes de trocar a pasta');
  s.settingDefaultPath = path.normalize(dir);
  const f = settingsIni();
  fs.writeFileSync(f + '.fork-tmp', JSON.stringify(s, null, 2));
  fs.renameSync(f + '.fork-tmp', f);
}

function dataDir() {
  const c = [];
  try {
    // eslint-disable-next-line global-require
    const remote = require('@electron/remote');
    c.push(path.join(path.dirname(remote.app.getAppPath()), 'data'));
    c.push(path.join(path.dirname(remote.app.getPath('exe')), 'data'));
  } catch (e) { /* fora do electron */ }
  c.push(path.resolve(__dirname, '../../../data'));
  c.push(path.resolve(process.cwd(), 'data'));
  for (const d of c) {
    if (fs.existsSync(path.join(d, 'cache', 'herodata.json')) || fs.existsSync(path.join(d, 'fork'))) return d;
  }
  throw new Error('pasta data/ não encontrada (procurei em: ' + c.join(' | ') + ')');
}

module.exports = { documentsDir, homeDir, savesDir, setSavesDir, settingsIni, dataDir };
