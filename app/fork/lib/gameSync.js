/*
 * gameSync.js (fork) — "Sincronizar com o jogo": peças, heróis e quem veste o quê, SEM o Lambda do Fribbels.
 *
 *   escuta.py (admin) grava Documents/FribbelsOptimizerSaves/escuta/inventario.json no login do jogo
 *   → /fork/convertGame (Java: tipo, nível, main no +N — ForkGameImport)
 *   → ItemAugmenter do clássico (o mesmo passo do importer.js)
 *   → /items/mergeHeroes do upstream (substitui o inventário: vendidas/extraídas somem; builds com peça
 *     que sumiu são apagadas pelo próprio merge — Eduardo: "jogou fora, nunca mais volta")
 *
 * Build ANTIGA: herói da conta com as 6 peças cujo conjunto (ids do jogo) mudou → antes do merge vira build
 * salva "Até dd/mm hh:mm". Só 6 peças: o hash da build do upstream exige as 6.
 * Heróis: os que têm peça equipada no jogo (filtro 'fivestar' do upstream: 5★ e 6★).
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const paths = require('./forkPaths.js');
const backend = require('./backend.js');
const heroList = require('./heroList.js');
const upstream = require('./upstream.js');
const heroBonus = require('./heroBonus.js');

const SLOTS = ['Weapon', 'Helmet', 'Armor', 'Necklace', 'Ring', 'Boots'];
const escutaDir = () => path.join(paths.savesDir(), 'escuta');
const codesFile = () => path.join(paths.dataDir(), 'fork', 'gameCodes.json');

function readInventory() {
  const f = path.join(escutaDir(), 'inventario.json');
  if (!fs.existsSync(f)) return null;
  return JSON.parse(fs.readFileSync(f, 'utf8'));
}

const stamp = (d) => {
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

/* herói novo no formato do clássico (heroesTab.getNewHeroByName + importer.js) */
function newHero(name, stars) {
  const data = JSON.parse(JSON.stringify(heroList.rawByName(name)));
  const s = data.skills || {};
  const opts = ['S1', 'S2', 'S3'].map((k) => (s[k] || {}).options);
  // herodata com opção de habilidade vazia derruba o merge do upstream (Hero.getDamageMultipliers lê S1[0]):
  // sem as três, o herói vai sem `skills` e o backend monta o padrão dele
  const skills = opts.every((o) => Array.isArray(o) && o.length) ? { S1: opts[0], S2: opts[1], S3: opts[2] } : undefined;
  return {
    id: uuidv4(), name, data, equipped: new Array(6),
    rarity: data.rarity, attribute: data.attribute, role: data.role, path: name, stars, skills,
  };
}

/* builds a arquivar: herói com 6 peças cujo conjunto no jogo mudou (o merge ainda não rodou) */
function changedBuilds(accountHeroes, accountItems, newItems, unitIdByName, when) {
  const byId = {};
  accountItems.forEach((it) => { byId[it.id] = it; });
  const nowOn = {};
  newItems.forEach((it) => { (nowOn[it.ingameEquippedId] = nowOn[it.ingameEquippedId] || []).push(it.ingameId); });
  const out = [];
  accountHeroes.forEach((h) => {
    const eq = h.equipment || {};
    const old = SLOTS.map((s) => eq[s] && byId[eq[s].id]).filter(Boolean);
    if (old.length !== 6 || old.some((it) => !it.ingameId)) return;
    const unit = unitIdByName[h.name];
    if (!unit) return;   // herói fora do jogo/sem peça: o merge não mexe nele
    const now = (nowOn[unit] || []).slice().sort().join();
    if (now === old.map((it) => String(it.ingameId)).sort().join()) return;
    out.push({ heroId: h.id, name: h.name, build: { name: 'Até ' + stamp(when), items: old.map((it) => it.id) } });
  });
  return out;
}

/*
 * opts.inventory só para teste; devolve um resumo para a tela.
 * Lança com mensagem pt-BR se faltar algo (sem login capturado, backend fora, conversão falhou).
 */
async function sync(opts) {
  const inv = (opts && opts.inventory) || readInventory();
  if (!inv || !Array.isArray(inv.equips)) throw new Error('Nenhum login capturado ainda: ligue a escuta e abra o jogo (ou volte ao lobby).');
  const codes = JSON.parse(fs.readFileSync(codesFile(), 'utf8'));
  const conv = await backend.forkConvertGame({ equips: inv.equips, families: codes.families, mainBase: codes.mainBase });
  if (!conv || !Array.isArray(conv.items)) throw new Error('O backend do fork não converteu as peças (jar sem /fork/convertGame?).');

  // famílias novas aprendidas nesta conversão ficam para a próxima
  if (conv.families && Object.keys(conv.families).length > Object.keys(codes.families || {}).length) {
    codes.families = conv.families;
    fs.writeFileSync(codesFile(), JSON.stringify(codes, null, 1));
  }

  const items = conv.items;
  const { ItemAugmenter } = upstream.load();
  if (!ItemAugmenter) throw new Error('Não achei o itemAugmenter do app clássico.');
  ItemAugmenter.augment(items);

  // heróis do jogo com peça equipada; cópia repetida do mesmo herói: vale a que tem peça
  const nameByCode = {};
  Object.values(heroList.raw()).forEach((h) => { if (h && h.code) nameByCode[h.code] = h.name; });
  const geared = new Set(items.map((it) => it.ingameEquippedId));
  const unitIdByName = {};
  const merge = [];
  const unknownHeroes = [];
  (inv.units || []).forEach((u) => {
    const name = nameByCode[u.code];
    const id = String(u.id);
    if (!geared.has(id)) return;
    if (!name) { unknownHeroes.push(u.code); return; }   // herói mais novo que o herodata (falta patch do upstream)
    if (unitIdByName[name]) return;
    unitIdByName[name] = id;
    merge.push({ name, id, stars: u.g, awaken: u.z, data: newHero(name, u.g) });
  });

  // p/ arquivar: todo herói do jogo (o que ficou sem peça também perde a build); cópia com peça tem prioridade
  const anyUnitByName = Object.assign({}, unitIdByName);
  (inv.units || []).forEach((u) => { const n = nameByCode[u.code]; if (n && !anyUnitByName[n]) anyUnitByName[n] = String(u.id); });

  const when = new Date();
  const [accountHeroes, accountItems] = await Promise.all([backend.getAllHeroes(true, true), backend.getAllItems()]);
  const archive = changedBuilds(accountHeroes, accountItems, items, anyUnitByName, when);
  for (const a of archive) await backend.addBuild(a.heroId, a.build);

  const before = new Set(accountItems.map((it) => String(it.ingameId)));
  const after = new Set(items.map((it) => String(it.ingameId)));
  // peças NOVAS entram antes: no merge do upstream, peça sem par pelo id do jogo cai no casamento por
  // substatus e pode "roubar" uma peça já casada (+0 iguais são comuns) — 19 peças sumiam no teste
  const fresh = items.filter((it) => !before.has(String(it.ingameId)));
  if (fresh.length) await backend.addItems(fresh);
  await backend.mergeHeroes(items, merge, 0, 'fivestar');
  // o merge só re-equipa quem está na lista: peça que no jogo está solta (ou num herói que o app não conhece)
  // seguia vestida no herói antigo do app
  const nameById = {};
  (await backend.getAllHeroes(true, true)).forEach((h) => { nameById[h.id] = h.name; });
  const loose = (await backend.getAllItems()).filter((it) => it.equippedById &&
    String(it.ingameEquippedId) !== unitIdByName[nameById[it.equippedById]]);
  if (loose.length) await backend.unequipItems(loose.map((it) => it.id));

  // imprint, EE e artefato (o import antigo do Fribbels nunca trouxe): conta no backend (/fork/setBonus)
  const bonus = await syncBonuses(inv, anyUnitByName, codes.artifactExp);
  backend.invalidate();

  return {
    em: inv.em, pecas: items.length, herois: merge.length,
    novas: fresh.length,
    removidas: accountItems.filter((it) => it.ingameId && !after.has(String(it.ingameId))).length,
    semNivel: conv.noLevel, builds: archive.map((a) => a.name), heroisDesconhecidos: unknownHeroes,
    bonus: bonus.changed, artefatoPresumido: bonus.presumed,
  };
}

/*
 * Imprint (unit.d 1… = n-ésimo grau do herodata, a partir do inicial da raridade → valor do grau no herodata), EE (item `exc…` no herói: op[0] é o stat dele) e
 * artefato (item `ef…` no herói: nome pelo código). SEMPRE sobrescreve o que estava no app (Eduardo: vale o jogo).
 * Nível do artefato (+N): o jogo manda a EXPERIÊNCIA (`e`) e as quebras de limite (`sk`) → teto 15 + 3 × sk (máx 30)
 * e o nível pela curva de gameCodes.json → artifactExp: UMA curva para todas as raridades, em degraus (exp ÷ unit da
 * raridade). Ponto de artefato preso no teto só diz "pelo menos". Sem decidir = o mínimo garantido, listado em
 * `presumed` (aviso na tela) — print desses vira ponto novo na tabela.
 */
function artifactLevel(e, rarity, table) {
  const cap = Math.min(30, 15 + 3 * (e.sk || 0));
  const unit = table && table.unit && table.unit[String(rarity)];
  const x = e.e || 0;
  if (!x) return { level: 0, sure: true };
  if (!unit) return { level: 0, sure: false };
  const nx = x / unit;
  let lo = 0; let hi = null; let exact = false;   // lo = nível garantido; hi = nível que ainda não alcançou
  (table.points || []).forEach(([r, ex, l, teto]) => {
    const u = table.unit[String(r)];
    if (!u) return;
    const v = ex / u;
    if (v <= nx + 1e-9) lo = Math.max(lo, l);
    if (!teto && Math.abs(v - nx) < 1e-9) exact = true;
    if (!teto && v > nx + 1e-9 && (hi == null || l < hi)) hi = l;
  });
  if (lo >= cap) return { level: cap, sure: true };
  return { level: lo, sure: exact || hi === lo + 1 };
}

async function syncBonuses(inv, unitByName, artTable) {
  const heroes = await backend.getAllHeroes(true, true);
  const onUnit = {};
  (inv.equips || []).forEach((e) => {
    if (e.f || !e.p) return;
    const k = String(e.p);
    if (/^exc/.test(e.code)) (onUnit[k] = onUnit[k] || {}).ee = e;
    else if (/^ef/.test(e.code)) (onUnit[k] = onUnit[k] || {}).art = e;
  });
  const unitById = {};
  (inv.units || []).forEach((u) => { unitById[String(u.id)] = u; });
  let changed = 0;
  const presumed = [];
  for (const h of heroes) {
    const uid = unitByName[h.name];
    const u = uid && unitById[uid];
    if (!u) continue;
    const on = onUnit[uid] || {};
    const c = {};
    const imp = heroBonus.imprint(h.name, h);
    // d conta a partir do grau INICIAL da raridade (5★ começa no B: d 2 = A), não do D — os graus do herodata já
    // começam nele (5★ B…SSS, 4★ C…SSS, 3★ D…SSS; d máximo na conta = 5/6/7)
    const g = imp && u.d ? Object.keys(imp.grades).sort((a, b) => imp.grades[a] - imp.grades[b])[u.d - 1] : null;
    if (imp) c.imprintValue = g ? imp.grades[g] : null;
    if (heroBonus.ee(h.name, h)) {
      const op = on.ee && on.ee.op && on.ee.op[0];
      c.eeValue = op ? heroBonus.displayValue(op[0], op[1]) : null;
    }
    const artName = on.art ? heroBonus.artifactByCode(on.art.code) : null;
    c.artifactName = artName || 'None';
    c.artifactLevel = 0;
    if (artName) {
      const lv = artifactLevel(on.art, (heroBonus.artifact({ artifactName: artName }) || {}).rarity, artTable);
      c.artifactLevel = lv.level;
      if (!lv.sure) presumed.push(`${h.name}: ${artName} +${lv.level} ou mais`);
    }
    const n = (v) => (v == null || v === 'None' || v === '' ? null : Number(v));
    const same = (a, b) => n(a) === n(b);
    if (('imprintValue' in c && !same(c.imprintValue, h.imprintNumber)) || ('eeValue' in c && !same(c.eeValue, h.eeNumber))
      || c.artifactName !== (h.artifactName || 'None') || Number(c.artifactLevel) !== (Number(h.artifactLevel) || 0)) {
      await backend.forkSetBonus(heroBonus.buildSetBonusRequest(h, h.name, c));
      changed++;
    }
  }
  return { changed, presumed };
}

module.exports = { sync, readInventory, escutaDir, changedBuilds, artifactLevel };
