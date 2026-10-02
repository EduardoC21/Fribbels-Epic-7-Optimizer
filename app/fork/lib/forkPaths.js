/*
 * forkPaths.js — resolução de caminhos compartilhada pelos módulos do fork.
 * Centraliza o que estava duplicado em heroList/archetypes/gameRules/relevance/
 * communityBuilds/officialStats (documentsDir, pasta de saves, pasta data/).
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

function savesDir() {
  const dir = path.join(documentsDir(), 'FribbelsOptimizerSaves');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
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

module.exports = { documentsDir, savesDir, dataDir };
