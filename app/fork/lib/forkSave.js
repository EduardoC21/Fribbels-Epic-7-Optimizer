/*
 * forkSave.js (fork) — grava a conta no autosave.json, do MESMO jeito que o app
 * clássico (app/js/lib/saves.js → Saves.autoSave).
 *
 * Por que existe: o backend Java NÃO salva nada em disco. Quem salva é o front
 * do clássico, que depois de cada ação despeja heróis + itens do backend no
 * autosave.json. As gravações feitas pela janela do fork (bônus, pedido do
 * otimizador) ficavam só na memória do backend e se perdiam se o app fechasse
 * antes de o clássico salvar por outro motivo.
 *
 * Pasta: a mesma do clássico — `settingDefaultPath` do settings.ini (que fica
 * sempre em Documents/FribbelsOptimizerSaves), ou essa pasta mesmo se não houver.
 * Grava num arquivo temporário e troca no fim: um erro no meio não deixa o
 * autosave pela metade.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const paths = require('./forkPaths.js');
const backend = require('./backend.js');

function savesFolder() {
  const def = paths.savesDir();
  try {
    const s = JSON.parse(fs.readFileSync(path.join(def, 'settings.ini'), 'utf8'));
    if (s && s.settingDefaultPath && fs.existsSync(s.settingDefaultPath)) return path.normalize(s.settingDefaultPath);
  } catch (e) { /* sem settings.ini ou ilegível: pasta padrão */ }
  return def;
}

function autosaveFile() { return path.join(savesFolder(), 'autosave.json'); }

/* { heroes, items } do backend -> autosave.json. Lança se o backend não responder.
   `opts.file` só para teste (gravar numa cópia, nunca no autosave real). */
async function autoSave(opts) {
  const [heroes, items] = await Promise.all([backend.getAllHeroes(true, true), backend.getAllItems()]);
  if (!Array.isArray(heroes) || !Array.isArray(items)) throw new Error('o backend não devolveu heróis/itens para salvar');
  // backend recém-aberto (a conta ainda não foi carregada) devolve tudo vazio:
  // salvar agora APAGARIA o autosave — recusa
  if (!heroes.length && !items.length) throw new Error('o backend está sem a conta carregada — não salvei para não apagar o autosave');
  const file = (opts && opts.file) || autosaveFile();
  const tmp = file + '.fork-tmp';
  fs.writeFileSync(tmp, JSON.stringify({ heroes, items }));
  fs.renameSync(tmp, file);
  return { file, heroes: heroes.length, items: items.length };
}

module.exports = { autoSave, autosaveFile, savesFolder };
