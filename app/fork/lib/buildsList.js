/*
 * buildsList.js (fork) — monta a LISTA ÚNICA de builds do herói, juntando as 4 origens
 * numa mesma escala para dar pra comparar linha a linha:
 *   equipped   = a build que está equipada agora (objeto herói do backend)
 *   saved      = histórico salvo (accountHero.builds — vem do otimizador/"Save As Build")
 *   community  = perfis (clusters) do /getBuilds do Fribbels — MEDIANA (p50) por tipo de
 *                build, com faixa p25–p75. Mediana+IQR é robusta a distorção; e o corte
 *                por tipo evita a pior distorção de todas (misturar DPS com tank).
 *   pro        = combos de set do RTA oficial (win rate real). A API oficial dá win rate
 *                por combo, NÃO stats — então casamos com o cluster de comunidade que usa
 *                o mesmo combo para a linha ter números reais; se não casar, fica sem.
 *
 * Campos de stat: o herói/build usam cr/cd/res; a comunidade usa chc/chd/efr — normalizado
 * aqui para o formato do herói, que é o que os dois blocos de stat já sabem exibir.
 */
'use strict';

const gameData = require('./gameData.js');
const gc = require('./gameConstants.js');
const targetBuild = require('./targetBuild.js');

// Só o símbolo na linha; o texto fica no tooltip.
const ORIGINS = {
  equipped: { label: 'Equipada', icon: '★', cls: 'o-eq' },
  saved: { label: 'Salva por você', icon: '🖫', cls: 'o-sv' },
  community: { label: 'Comunidade', icon: '🤝', cls: 'o-cm' },
  pro: { label: 'Pro · RTA', icon: '♛', cls: 'o-pr' },
};

// Mesma ordem e mesmos campos da grade do otimizador (optimizerGrid.js).
const COLUMNS = [
  ['atk', 'atk'], ['def', 'def'], ['hp', 'hp'], ['spd', 'spd'],
  ['cr', 'cr'], ['cd', 'cd'], ['eff', 'eff'], ['res', 'res'], ['dac', 'dac'],
  ['cp', 'cp'], ['hpps', 'hps'], ['ehp', 'ehp'], ['ehpps', 'ehps'],
  ['dmg', 'dmg'], ['dmgps', 'dmgs'], ['mcdmg', 'mcd'], ['mcdmgps', 'mcds'],
  ['dmgh', 'dmgh'], ['dmgd', 'dmgd'],
  ['s1', 's1'], ['s2', 's2'], ['s3', 's3'],
  ['score', 'gs'], ['bs', 'bs'], ['upgrades', 'upg'],
];
const PCT_COLS = new Set(['cr', 'cd', 'eff', 'res', 'dac']);

// sets do combo -> [{set:'SpeedSet', count:4}] para desenhar com os assets
// BLINDADO: quantas peças cada set exige vem do constants.js do app clássico
const isFourPiece = (set) => gc.isFourPiece(set);
function comboIcons(combo, fromOfficial) {
  return String(combo || '').split(/[+,\s]+/).filter(Boolean).map((tok) => {
    const m = String(tok).match(/^(.*?)(\d+)?$/);
    const base = (m && m[1]) || tok;
    const count = m && m[2] ? parseInt(m[2], 10) : null;
    let setName = null;
    if (fromOfficial) setName = (gameData.SET_CODE_TO_NAME || {})['set_' + base.toLowerCase()] || null;
    if (!setName) {
      const cand = base.charAt(0).toUpperCase() + base.slice(1) + 'Set';
      setName = (gameData.setNames() || []).includes(cand) ? cand : null;
    }
    return setName ? { set: setName, count: count || (isFourPiece(setName) ? 4 : 2) } : null;
  }).filter(Boolean);
}

// sets ATIVOS a partir das 6 peças equipadas (para a linha da build equipada)
function equipmentSetIcons(equipment) {
  if (!equipment) return [];
  const counts = {};
  Object.keys(equipment).forEach((sl) => { const it = equipment[sl]; if (it && it.set) counts[it.set] = (counts[it.set] || 0) + 1; });
  const out = [];
  Object.keys(counts).forEach((set) => {
    const need = gc.piecesRequired(set);
    for (let i = 0; i < Math.floor(counts[set] / need); i++) out.push({ set, count: need });
  });
  return out.sort((a, b) => b.count - a.count);
}

const p50 = (s, k) => (s && s[k] && s[k].p50) || 0;
// cluster da comunidade -> stats no formato do herói
function clusterToStats(c) {
  const s = c.stats || {};
  return {
    atk: p50(s, 'atk'), def: p50(s, 'def'), hp: p50(s, 'hp'), spd: p50(s, 'spd'),
    cr: p50(s, 'chc'), cd: p50(s, 'chd'), eff: p50(s, 'eff'), res: p50(s, 'efr'),
  };
}
// faixa robusta p25–p75 por stat (para mostrar "de X a Y" na média da comunidade)
function clusterRanges(c) {
  const s = c.stats || {};
  const r = (k) => (s[k] ? { lo: s[k].p25, hi: s[k].p75 } : null);
  return { atk: r('atk'), def: r('def'), hp: r('hp'), spd: r('spd'), cr: r('chc'), cd: r('chd'), eff: r('eff'), res: r('efr') };
}
function clusterName(c, i) {
  const l = c.label || {};
  const parts = [l.dmg].concat(l.emphasis || []).concat(l.tags || []).filter(Boolean);
  return parts.length ? parts.join(' · ') : `Perfil ${i + 1}`;
}
/*
 * Combos vêm em dois dialetos:
 *   comunidade -> "Speed4+Torrent2", "Destruction4+Torrent2"  (nome curto + nº de peças)
 *   oficial    -> "speed+torrent",  "cri_dmg+torrent"          (chave interna do jogo)
 * SET_CODE_TO_NAME traduz a chave interna (set_cri_dmg -> DestructionSet). Normalizamos
 * os dois para tokens minúsculos sem "set" e sem dígitos, ordenados, para poder casar.
 */
function normToken(t, fromOfficial) {
  let s = String(t || '').trim();
  if (fromOfficial) {
    const full = gameData.SET_CODE_TO_NAME && gameData.SET_CODE_TO_NAME['set_' + s.toLowerCase()];
    if (full) s = full;
  }
  return s.toLowerCase().replace(/\d+/g, '').replace(/set$/, '');
}
const comboKey = (s, fromOfficial) => String(s || '')
  .split(/[+,\s]+/).filter(Boolean)
  .map((t) => normToken(t, fromOfficial)).filter(Boolean)
  .sort().join('+');
// "cri_dmg+torrent" -> "Destruction + Torrent" (não mostrar chave crua do jogo na tela)
function prettyCombo(s) {
  return String(s || '').split(/[+,\s]+/).filter(Boolean).map((t) => {
    const full = gameData.SET_CODE_TO_NAME && gameData.SET_CODE_TO_NAME['set_' + t.toLowerCase()];
    const name = full ? String(full).replace(/Set$/, '') : t;
    return name.charAt(0).toUpperCase() + name.slice(1);
  }).join(' + ');
}

/*
 * Monta as linhas. `accountHero` pode ser null (herói fora da conta) e `summary` pode não
 * ter community/official ainda (antes de baixar os dados da comunidade).
 */
function collect(accountHero, summary, heroName) {
  const rows = [];
  const s = summary || {};
  const com = s.community || null;
  const off = s.official && !s.official.__error ? s.official : null;

  const nm = heroName || (accountHero && accountHero.name) || null;
  let baseOfHero = null;
  try { baseOfHero = nm ? targetBuild.baseStats(nm) : null; } catch (e) { baseOfHero = null; }
  /*
   * O backend devolve dac=0 nos heróis da conta (o campo só é preenchido quando as
   * base stats são empurradas pra ele). O herodata do upstream tem o valor real, e
   * é ele que as builds públicas usam — sem isto a MESMA coluna mostrava 0 na build
   * equipada e 3 nas públicas do mesmo herói.
   */
  const withDac = (st) => (baseOfHero && baseOfHero.dac && !st.dac
    ? Object.assign({}, st, { dac: baseOfHero.dac }) : st);

  if (accountHero) {
    rows.push({
      key: 'equipped', origin: 'equipped', name: 'Build equipada',
      stats: withDac(accountHero), equipment: accountHero.equipment || null, items: null,
      sets: null, setIcons: equipmentSetIcons(accountHero.equipment),
      note: 'O que o herói está usando agora na sua conta.',
    });
    (accountHero.builds || []).forEach((b, i) => {
      rows.push({
        key: 'saved-' + (b.id || i), origin: 'saved', name: b.name || `Build salva ${i + 1}`,
        stats: withDac(b), items: b.items || null, equipment: null, sets: null,
        build: b,   // o objeto do backend, inteiro: renomear/apagar casam pelas 6 peças e não podem perder as gemas simuladas (mods)
        note: 'Salva por você (otimizador ou "salvar build").',
      });
    });
  }

  /*
   * Builds da COMUNIDADE e dos PROS agora são BUILDS REAIS individuais, vindas
   * cruas do /getBuilds (sem média, sem cluster). O cálculo entra só na ESCOLHA:
   * pros = topo do gear score, comunidade = da média pra cima, ambas selecionadas
   * por diversidade para cobrir o máximo de tipos de build.
   * O win rate real (RTA oficial) é anexado pelo COMBO DE SET da própria build.
   */
  const picks = (com && com.picks) || null;
  const wrByCombo = {};
  if (off && off.equip) {
    off.equip.forEach((e) => { wrByCombo[comboKey(e.combo, true)] = { winRate: e.winRate, usage: e.usage }; });
  }
  const addPicked = (list, origin, label) => {
    (list || []).forEach((b, i) => {
      const icons = comboIcons(b.combo, false);
      const wr = wrByCombo[comboKey(b.combo, false)] || null;
      // Só os 8 stats que a base pública traz. Os calculados (CP, vida efetiva,
      // danos, S1–S3, BS) vêm do BACKEND via /fork/calculateStats (lib/forkCalc.js);
      // sem ele ficam vazios — nada de fórmula copiada aqui.
      rows.push({
        key: origin + '-' + i, origin,
        name: b.combo || 'sem set completo',
        stats: withDac(Object.assign({}, b.stats, { score: b.gs })),
        items: null, equipment: null,
        sets: b.combo ? [b.combo] : [], setIcons: icons,
        artifactCode: b.artifactCode || null,
        gs: b.gs,
        date: b.date || null,
        winRate: wr ? wr.winRate : null,
        usage: wr ? wr.usage : null,
        note: `${label} — build real de um jogador (gear score ${b.gs}).`
          + (wr ? ` Win rate ${wr.winRate}% no RTA oficial para este combo.` : ''),
      });
    });
  };
  if (picks) {
    addPicked(picks.pros, 'pro', 'Uma das melhores builds da base');
    addPicked(picks.community, 'community', 'Build da base (entre as de maior gear score)');
  }

  return rows;
}

// catálogo dos tipos de build encontrados (para a caixa "tipos de build")
function types(summary) {
  const clusters = ((summary && summary.community && summary.community.clusters) || []);
  return clusters.map((c, i) => ({
    name: clusterName(c, i), share: c.sharePct,
    sets: (c.sets || []).slice(0, 2).map((x) => x.combo),
    spd: p50(c.stats, 'spd'), cr: p50(c.stats, 'chc'), cd: p50(c.stats, 'chd'),
  }));
}

module.exports = { ORIGINS, COLUMNS, PCT_COLS, comboIcons, equipmentSetIcons, collect, types, clusterToStats, clusterRanges, clusterName };
