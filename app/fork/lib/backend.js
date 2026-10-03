/*
 * backend.js (fork) — cliente do backend Java local (localhost:8130), o MESMO que o app
 * clássico usa. A janela tem nodeIntegration, então falamos via fetch direto.
 *
 * É a fonte dos dados da CONTA do usuário: heróis importados, gear equipado, histórico de
 * builds, itens. Sem backend rodando (ou herói fora da conta), a tela degrada para só dados
 * públicos (comunidade/oficial) — ver isAvailable()/accountHeroByName().
 *
 * Mapeamento: a janela lista TODOS os 388 heróis (herodata.json); a conta só tem os
 * importados. Casamos por `name` (getAllHeroes traz name igual ao herodata).
 */
'use strict';

// FORK_BACKEND_URL só para teste (instância paralela); em uso normal é sempre a 8130
const ENDPOINT = (typeof process !== 'undefined' && process.env && process.env.FORK_BACKEND_URL) || 'http://localhost:8130';

async function post(api, request, timeoutMs) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs || 8000);
  try {
    const res = await fetch(ENDPOINT + api, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request || {}),
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error('HTTP ' + res.status + ' ' + api);
    // Vários endpoints (ex.: /heroes/setBonusStats) respondem 200 com CORPO VAZIO.
    // res.json() estoura nesse caso — por isso leia texto e só então tente parsear.
    const text = await res.text();
    if (!text) return null;
    if (text === 'ERROR') throw new Error('backend ERROR ' + api);
    let data;
    try { data = JSON.parse(text); } catch (e) { return text; }
    if (data === 'ERROR') throw new Error('backend ERROR ' + api);
    return data;
  } finally { clearTimeout(t); }
}

let _available = null;        // null=desconhecido, true/false
let _heroesCache = null;      // heróis da conta (bruto do backend)
let _heroesByName = null;     // índice name -> herói da conta

function isAvailable() { return _available; }

// ping leve; usa getAllHeroes com timeout curto
async function ping() {
  try { await getAllHeroes(true, true, 2500); return true; }
  catch (e) { _available = false; return false; }
}

async function getAllHeroes(useReforgeStats, force, timeoutMs) {
  if (_heroesCache && !force) return _heroesCache;
  const r = await post('/heroes/getAllHeroes', { useReforgeStats: useReforgeStats !== false }, timeoutMs);
  _heroesCache = (r && r.heroes) || [];
  _heroesByName = {};
  for (const h of _heroesCache) _heroesByName[h.name] = h;
  _available = true;
  return _heroesCache;
}

// herói da CONTA correspondente ao nome do herodata (ou null se não importado / cache vazio)
function accountHeroByName(name) { return _heroesByName ? (_heroesByName[name] || null) : null; }
function invalidate() { _heroesCache = null; _heroesByName = null; }

// leitura detalhada
async function getHeroById(id, useReforgeStats) {
  return post('/heroes/getHeroById', { id, useReforgeStats: useReforgeStats !== false });
}
async function getItemsByIds(ids) {
  const r = await post('/items/getItemsByIds', { ids });
  return (r && r.items) || [];
}
async function getAllItems() {
  const r = await post('/items/getAllItems');
  return (r && r.items) || [];
}

// mutações (usadas nas tarefas de edição) — mesmos contratos do app clássico
const equipItemsOnHero = (heroId, itemIds, useReforgeStats) => post('/heroes/equipItemsOnHero', { heroId, itemIds, useReforgeStats: useReforgeStats !== false });
const addBuild = (heroId, build) => post('/heroes/addBuild', { heroId, build });
const editBuild = (heroId, build) => post('/heroes/editBuild', { heroId, build });
const removeBuild = (heroId, build) => post('/heroes/removeBuild', { heroId, build });
const unequipItems = (ids) => post('/heroes/unequipItems', { ids });
// o backend lê `ids` (IdsRequest) — o nome antigo `itemIds` era ignorado em silêncio
const lockItems = (ids) => post('/items/lockItems', { ids });
const unlockItems = (ids) => post('/items/unlockItems', { ids });
// peças (popout de item): o backend grava o que vier e recalcula o gear score (wss)
const editItems = (items) => post('/items/editItems', { items });
const addItems = (items) => post('/items/addItems', { items });
const deleteItems = (ids) => post('/items/deleteItems', { ids });
// payload PLANO (atk/def/…/aei*/artifact*/imprintNumber/eeNumber/stars/heroId).
// Rota do app clássico (o payload já com os aei* somados). A janela do fork NÃO usa
// mais: grava bônus por forkSetBonus, que faz a conta no backend.
const setBonusStats = (payload) => post('/heroes/setBonusStats', payload);
const setModStats = (modStats, heroId) => post('/heroes/setModStats', { modStats, heroId });
const reorderHeroes = (id, destinationIndex) => post('/heroes/reorderHeroes', { id, destinationIndex });
const addHeroes = (heroes) => post('/heroes/addHeroes', { heroes });
const removeHeroById = (id) => post('/heroes/removeHeroById', { id });


/*
 * Salva o "pedido de otimização" no próprio herói (hero.optimizationRequest).
 * É o mesmo canal do app clássico: ao selecionar o herói na aba Optimizer, ele
 * restaura esses campos nos filtros. O backend SUBSTITUI o pedido inteiro e só
 * aceita com `hero.id` — monte com optimizerProfile.toRequest(), que mescla com o
 * pedido existente.
 */
const saveOptimizationRequest = (request) => post('/heroes/saveOptimizationRequest', request);

/*
 * Leva o herói para a aba Optimizer da JANELA PRINCIPAL. É o mesmo gesto do
 * duplo-clique na grade de heróis do app clássico (heroesGrid.js): seleciona o
 * herói no seletor e clica na aba 1.
 */
function openInOptimizer(heroId) {
  const remote = require('@electron/remote');
  const wins = remote.BrowserWindow.getAllWindows();
  const main = wins.find((w) => !w.isDestroyed() && w.getTitle && !/Comunidade/.test(w.getTitle()));
  if (!main) throw new Error('janela principal não encontrada');
  const js = `try{$("#inputHeroAdd").val(${JSON.stringify(heroId)}).change();$('#tab1').trigger('click');}catch(e){console.warn(e);}`;
  main.webContents.executeJavaScript(js);
  main.focus();
}

/*
 * FORK — stats calculados PELO BACKEND para builds dadas só por stats finais + sets
 * (POST /fork/calculateStats, código em backend/src/main/java/com/fribbels/fork).
 * 404 = o backend.jar em uso ainda não tem o fork (rodar backend/fork-build.ps1).
 */
async function forkCalculateStats(builds) {
  try {
    const r = await post('/fork/calculateStats', { builds }, 30000);
    return (r && r.results) || [];
  } catch (e) {
    if (/HTTP 404/.test(e.message)) throw new Error('o backend em uso não tem o cálculo do fork — feche o app e rode backend/fork-build.ps1');
    throw e;
  }
}

/* FORK — quanto as 6 peças precisam somar para chegar numa build-alvo (POST /fork/gearNeeded) */
async function forkGearNeeded(builds) {
  try {
    const r = await post('/fork/gearNeeded', { builds }, 15000);
    return (r && r.results) || [];
  } catch (e) {
    if (/HTTP 404/.test(e.message)) throw new Error('o backend em uso não tem o cálculo do fork (versão 2) — feche o app e rode backend/fork-build.ps1');
    throw e;
  }
}

/*
 * FORK — grava imprint / EE / artefato (POST /fork/setBonus). `request` =
 * heroBonus.buildSetBonusRequest(): o estado DESEJADO dos três bônus; o backend
 * tira o que está aplicado e põe o novo nos campos aei* do herói guardado.
 */
async function forkSetBonus(request) {
  let r;
  try { r = await post('/fork/setBonus', request, 10000); }
  catch (e) {
    if (/HTTP 404/.test(e.message)) throw new Error('o backend em uso não tem a gravação do fork (versão 3) — feche o app e rode backend/fork-build.ps1');
    throw e;
  }
  if (!r || !r.ok) throw new Error((r && r.error) || 'o backend não confirmou a gravação');
  return r;
}

/* FORK — ATK/HP/DEF de artefatos por nível, pela tabela do backend (POST /fork/artifactStats) */
async function forkArtifactStats(items) {
  const r = await post('/fork/artifactStats', { items }, 10000);
  return (r && r.results) || [];
}

/* notas de peça: score do jogo, potencial e potencial por perfil (lib/itemRatings.js monta o pedido) */
async function forkItemRatings(request) {
  const r = await post('/fork/itemRatings', request, 20000);
  return (r && r.results) || [];
}

/* sincronizar com o jogo (lib/gameSync.js): peças cruas do login → item do app (POST /fork/convertGame, v12) */
async function forkConvertGame(request) {
  try { return await post('/fork/convertGame', request, 60000); }
  catch (e) {
    if (/HTTP 404/.test(e.message)) throw new Error('o backend em uso não tem a conversão do jogo (versão 12) — feche o app e rode backend/fork-build.ps1');
    throw e;
  }
}
// merge do upstream (importer.js "Merge heroes"): substitui o inventário e equipa os heróis pelo id do jogo
const mergeHeroes = (items, heroes, enhanceLimit, heroFilter) =>
  post('/items/mergeHeroes', { items, mergeHeroes: heroes, enhanceLimit, heroFilter }, 120000);

/* versão do fork no backend (ForkHandler.VERSION); null = backend fora do ar ou sem o fork */
const forkPing = () => post('/fork/ping', {}, 3000).then((r) => (r && r.version) || null, () => null);
const setItems = (items) => post('/items/setItems', { items });
const setHeroes = (heroes) => post('/heroes/setHeroes', { heroes });

module.exports = {
  forkPing, setItems, setHeroes,
  forkCalculateStats, forkGearNeeded, forkSetBonus, forkArtifactStats, forkItemRatings, forkConvertGame, mergeHeroes,
  saveOptimizationRequest, openInOptimizer,
  ENDPOINT, post,
  isAvailable, ping, getAllHeroes, accountHeroByName, invalidate,
  getHeroById, getItemsByIds, getAllItems,
  equipItemsOnHero, addBuild, editBuild, removeBuild, unequipItems,
  lockItems, unlockItems, editItems, addItems, deleteItems, setBonusStats, setModStats, reorderHeroes, addHeroes, removeHeroById,
};
