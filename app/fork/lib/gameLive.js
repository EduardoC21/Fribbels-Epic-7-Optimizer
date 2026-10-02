/*
 * gameLive.js (fork) — aplica na conta, NA HORA, o que a escuta do jogo viu (escuta.py → eventos.jsonl):
 *
 *   up         peça(s) upada(s): op novo → /fork/convertGame (Java) → IE.saveEdit (mantém id, dono, trava)
 *              lote do jogo ("+N níveis") chega numa mensagem só, na ordem da GRADE do jogo
 *   removidas  vender / extrair: some da conta
 *   equipou    peça no herói (o backend tira de quem usava)     tirou   peça solta
 *   novas      peça inteira, crua como no login: a conta não tem (drop, craft, loja) → entra; a conta já tem
 *              (reforja = cmd upgrade_equip, pedra…) → regravada como o up (`changedIds`)
 *
 * O evento de up não traz código/raridade/set: vêm do último login (inventario.json) ou de um evento `novas`,
 * guardados aqui por id do jogo e atualizados a cada evento. Up de peça que a escuta nunca viu inteira (ganha
 * antes de ligar a escuta e depois do último login) fica de fora: `unknown` (a barra do jogo avisa).
 * Devolve { upIds: [ids do APP, ordem da grade], ... } para a tela de Up encaixar as peças nas vagas.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const paths = require('./forkPaths.js');
const upstream = require('./upstream.js');
const heroList = require('./heroList.js');
const IE = require('./itemEdit.js');

let raw = null;       // id do jogo → peça crua
let rawFrom = null;   // `em` do inventario.json lido

function rawMap(escutaDir) {
  const f = path.join(escutaDir, 'inventario.json');
  if (!fs.existsSync(f)) return null;
  const em = fs.statSync(f).mtimeMs;
  if (!raw || rawFrom !== em) {
    const inv = JSON.parse(fs.readFileSync(f, 'utf8'));
    raw = {}; rawFrom = em;
    (inv.equips || []).forEach((e) => { raw[String(e.id)] = e; });
    raw.__units = {};
    (inv.units || []).forEach((u) => { raw.__units[String(u.id)] = u; });
  }
  return raw;
}

async function apply(evs, api, escutaDir, heroesById) {
  const out = { upIds: [], changedIds: [], ups: 0, changed: 0, removed: 0, equips: 0, unknown: 0, novas: 0 };
  const map = rawMap(escutaDir);
  if (!map) return out;
  const byGame = {};
  const reload = async () => {
    Object.keys(byGame).forEach((k) => { delete byGame[k]; });
    (await api.getAllItems()).forEach((it) => { if (it.ingameId) byGame[String(it.ingameId)] = it; });
  };
  await reload();
  const codes = JSON.parse(fs.readFileSync(path.join(paths.dataDir(), 'fork', 'gameCodes.json'), 'utf8'));
  // peça crua que a conta ainda não tem → convertida (Java) e cadastrada, como na sincronização
  const addRaw = async (raws) => {
    if (!raws.length) return;
    const conv = await api.forkConvertGame({ equips: raws, families: codes.families, mainBase: codes.mainBase });
    const add = (conv.items || []).filter((it) => !byGame[String(it.ingameId)]);
    if (!add.length) return;
    const { ItemAugmenter } = upstream.load();
    if (ItemAugmenter) ItemAugmenter.augment(add);
    await api.addItems(add);
    out.novas += add.length;
    await reload();
  };
  // peça crua de uma peça que a conta JÁ tem → convertida (Java) e regravada (mantém id, dono, trava); devolve os ids do app
  const updateRaw = async (raws) => {
    if (!raws.length) return [];
    const conv = await api.forkConvertGame({ equips: raws, families: codes.families, mainBase: codes.mainBase });
    const { ItemAugmenter } = upstream.load();
    const ids = [];
    for (const r of raws) {
      const c = (conv.items || []).find((x) => String(x.ingameId) === String(r.id));
      const stored = byGame[String(r.id)];
      if (!c || !stored) continue;
      const draft = { ...stored, main: c.main, substats: c.substats, enhance: r.enhanced != null ? r.enhanced : c.enhance,
        level: c.level || stored.level, op: c.op };
      if (ItemAugmenter) ItemAugmenter.augment([draft]);
      await IE.saveEdit(api, draft, stored, heroesById);
      ids.push(stored.id);
    }
    return ids;
  };
  const nameByCode = {};
  Object.values(heroList.raw()).forEach((h) => { if (h && h.code) nameByCode[h.code] = h.name; });
  const heroIdByUnit = (unit) => {
    const u = map.__units[String(unit)];
    const name = u && nameByCode[u.code];
    const h = name && Object.values(heroesById || {}).find((x) => x.name === name);
    return h ? h.id : null;
  };

  for (const ev of evs) {
    if (ev.tipo === 'novas') {
      const all = (ev.pecas || []).filter((r) => r && r.id != null);
      all.forEach((r) => { map[String(r.id)] = r; });
      const known = all.filter((r) => byGame[String(r.id)]);
      await addRaw(all.filter((r) => !known.includes(r)));
      const ids = await updateRaw(known);
      out.changedIds.push(...ids);
      out.changed += ids.length;
    } else if (ev.tipo === 'up') {
      // peça vista inteira (login ou `novas`) mas fora da conta: entra antes do up
      await addRaw((ev.pecas || []).filter((p) => map[String(p.equip)] && !byGame[String(p.equip)]).map((p) => map[String(p.equip)]));
      const pieces = (ev.pecas || []).filter((p) => map[String(p.equip)] && byGame[String(p.equip)]);
      out.unknown += (ev.pecas || []).length - pieces.length;
      if (!pieces.length) continue;
      const rawUp = pieces.map((p) => {
        const r = Object.assign({}, map[String(p.equip)], { op: p.op });
        if (p.enhanced != null) r.enhanced = p.enhanced;
        map[String(p.equip)] = r;
        return r;
      });
      const ids = await updateRaw(rawUp);
      out.upIds.push(...ids);
      out.ups += ids.length;
    } else if (ev.tipo === 'removidas') {
      const ids = (ev.ids || []).map((g) => byGame[String(g)]).filter(Boolean).map((it) => it.id);
      (ev.ids || []).forEach((g) => { delete map[String(g)]; });
      if (ids.length) { await api.deleteItems(ids); out.removed += ids.length; }
    } else if (ev.tipo === 'equipou') {
      const it = byGame[String(ev.peca)];
      const hero = heroIdByUnit(ev.heroi);
      if (map[String(ev.peca)]) map[String(ev.peca)].p = ev.heroi;
      if (it && hero) { await api.equipItemsOnHero(hero, [it.id]); out.equips++; }
    } else if (ev.tipo === 'tirou') {
      const ids = (ev.pecas || []).map((g) => byGame[String(g)]).filter(Boolean).map((it) => it.id);
      (ev.pecas || []).forEach((g) => { if (map[String(g)]) delete map[String(g)].p; });
      if (ids.length) { await api.unequipItems(ids); out.equips += ids.length; }
    }
  }
  return out;
}

module.exports = { apply };
