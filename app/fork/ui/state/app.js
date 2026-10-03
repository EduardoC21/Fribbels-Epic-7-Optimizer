/*
 * app.js — o estado da aplicação, num Context só.
 *
 * Fica aqui tudo que mais de uma tela precisa: catálogo de heróis, o que veio
 * da conta (backend), o ranking/flags do usuário, quem está selecionado, em que
 * tela e aba se está e os filtros da barra lateral.
 *
 * As telas NÃO leem arquivo nem chamam o backend: elas pedem daqui. Assim dá
 * para trocar a origem do dado sem mexer em componente de interface.
 */
'use strict';
const { React, html, useState, useEffect, useMemo, useCallback, useRef } = require('../h.js');
const heroList = require('../../lib/heroList.js');
const relevance = require('../../lib/relevance.js');
const backend = require('../../lib/backend.js');
const buildsList = require('../../lib/buildsList.js');
const heroBonus = require('../../lib/heroBonus.js');
const communityBuilds = require('../../lib/communityBuilds.js');
const officialStats = require('../../lib/officialStats.js');
const rtaTiers = require('../../lib/rtaTiers.js');
const markedBuilds = require('../../lib/markedBuilds.js');
const forkCalc = require('../../lib/forkCalc.js');
const forkSave = require('../../lib/forkSave.js');
const optimizerProfile = require('../../lib/optimizerProfile.js');
const heroOrder = require('../../lib/heroOrder.js');
const gearList = require('../features/gear/gearList.js');
const batchState = require('../features/gear/batchState.js');
const itemRatings = require('../../lib/itemRatings.js');
const mainCurve = require('../../lib/mainCurve.js');
const interest = require('../../lib/interest.js');
const archetypes = require('../../lib/archetypes.js');
const forkPaths = require('../../lib/forkPaths.js');
const maintenance = require('../../lib/maintenance.js');

const Ctx = React.createContext(null);

const EMPTY_FILTERS = {
  q: '',
  elements: [],   // fire/ice/earth/light/dark
  roles: [],      // warrior/knight/assassin/ranger/mage/manauser
  stars: [],      // 3/4/5 (raridade base)
  archetype: null,
  favorite: false,
  equipavel: false,
  built: false,   // só heróis com equipamento na conta
};

/*
 * Fila de gravação de bônus — pura, para poder ser testada sem backend.
 * Cada gravação só é montada DEPOIS que a anterior gravou e recarregou, lendo
 * o herói via getHero() naquele momento (nunca o herói capturado antes).
 */
function createSaveQueue({ getHero, persist, reload, onError }) {
  let chain = Promise.resolve();
  return function enqueue(name, changes) {
    const job = chain.then(async () => {
      const hero = getHero(name);
      if (!hero) return false;
      try {
        await persist(hero, name, changes);
        await reload();
        return true;
      } catch (e) {
        if (onError) onError(e);
        return false;
      }
    });
    chain = job.catch(() => false);
    return job;
  };
}

function loadCatalog() {
  try { return { heroes: heroList.load(), error: null }; }
  catch (e) { return { heroes: [], error: e.message }; }
}

/*
 * `initialAccount` / `initialRel` / `initialSelected` / `initialCommunity` / `initialMarks` / `initialTab` / `initialTarget` / `initialGearFilters` / `initialGearBatch`
 * existem para teste e sonda de layout: permitem montar a tela com dados reais
 * sem esperar o backend, sem rede e sem tocar nos arquivos do usuário. Em uso
 * normal ficam vazios.
 */
function AppProvider({ children, initialScreen, initialAccount, initialRel, initialSelected, initialCommunity, initialMarks, initialTab, initialTarget, initialGearFilters, initialGearBatch }) {
  // catálogo do jogo — leitura de arquivo local, síncrona
  const [catalog] = useState(loadCatalog);
  const heroes = catalog.heroes;
  const catalogError = catalog.error;

  // ranking e flags do usuário (persistido em Documents/…/relevance.json)
  const [rel, setRel] = useState(() => initialRel || relevance.load());

  // conta importada (backend Java local) — pode não estar rodando
  const [account, setAccount] = useState(() => initialAccount
    || { ready: false, loading: true, byName: {}, itemsById: {}, error: null });

  /* (re)carrega todos os heróis da conta. O backend RECALCULA os stats de cada
     herói nessa chamada — é por isso que, depois de gravar um bônus, basta recarregar.
     Os itens vêm junto: as builds salvas guardam só os ids das peças, e é pelos
     itens que se sabe os sets delas. */
  const refreshAccount = useCallback(() => Promise.all([backend.getAllHeroes(true, true), backend.getAllItems()])
    .then(([list, items]) => {
      const byName = {};
      (list || []).forEach((h) => { if (h && h.name) byName[h.name] = h; });
      const itemsById = {};
      (items || []).forEach((it) => { if (it && it.id) itemsById[it.id] = it; });
      // ordem do backend = prioridade do otimizador clássico (ver lib/heroOrder.js)
      const order = (list || []).filter((h) => h && h.id).map((h) => ({ id: h.id, name: h.name }));
      setAccount({ ready: true, loading: false, byName, itemsById, order, error: null });
      return byName;
    })
    .catch((e) => {
      setAccount((a) => ({ ...a, ready: false, loading: false, error: e.message }));
      throw e;
    }), []);

  useEffect(() => {
    if (initialAccount) return;
    refreshAccount().catch(() => {});
  }, []);

  /*
   * Grava imprint / artefato / EE na conta pelo /fork/setBonus (o backend tira o
   * bônus aplicado e põe o novo nos campos aei*) e recarrega para trazer os stats
   * recalculados. `changes` aceita { imprintValue, eeValue, artifactName,
   * artifactLevel } — ausente = mantém.
   *
   * As gravações entram numa FILA e cada uma é montada com o herói MAIS RECENTE
   * (lido de accountRef depois que a anterior terminou). O pedido leva o estado
   * COMPLETO dos três bônus; montado com o herói de antes da gravação anterior,
   * editar o Imprint e logo depois o EE mandaria o imprint antigo junto — e a
   * segunda gravação DESFARIA a primeira.
   * As caixas NÃO ficam desabilitadas enquanto grava (era isso que fazia as
   * três piscarem quando só uma mudava).
   */
  const accountRef = useRef(account);
  useEffect(() => { accountRef.current = account; }, [account]);
  const [saveError, setSaveError] = useState(null);
  const refreshRef = useRef(refreshAccount);
  refreshRef.current = refreshAccount;

  const enqueueSave = useRef(null);
  if (!enqueueSave.current) {
    enqueueSave.current = createSaveQueue({
      getHero: (n) => accountRef.current.byName[n],
      // o BACKEND faz a conta (tira o bônus atual, põe o novo) — ver /fork/setBonus
      persist: (hero, n, changes) => backend.forkSetBonus(heroBonus.buildSetBonusRequest(hero, n, changes)),
      reload: async () => {
        const fresh = await refreshRef.current();
        accountRef.current = { ...accountRef.current, byName: fresh };   // já vale p/ o próximo da fila
        await forkSave.autoSave();   // o backend não salva em disco: sem isto a mudança some ao fechar o app
      },
      onError: (e) => setSaveError(e.message),
    });
  }
  const saveBonus = useCallback((name, changes) => {
    setSaveError(null);
    return enqueueSave.current(name, changes);
  }, []);

  /*
   * Aba Otimizador: grava o perfil no PRÓPRIO pedido do otimizador do herói
   * (hero.optimizationRequest, o mesmo que o clássico lê). Mesma fila e mesma
   * regra da gravação de bônus: monta com o herói mais recente, recarrega e
   * salva no disco. `profile` = optimizerProfile.fromRequest(...) editado.
   */
  const enqueueOptimizer = useRef(null);
  if (!enqueueOptimizer.current) {
    enqueueOptimizer.current = createSaveQueue({
      getHero: (n) => accountRef.current.byName[n],
      persist: (hero, n, profile) => backend.saveOptimizationRequest(
        optimizerProfile.toRequest(profile, hero.optimizationRequest, hero.id)),
      reload: async () => {
        const fresh = await refreshRef.current();
        accountRef.current = { ...accountRef.current, byName: fresh };
        await forkSave.autoSave();
      },
      onError: (e) => setSaveError(e.message),
    });
  }
  const saveOptimizer = useCallback((name, profile) => {
    setSaveError(null);
    return enqueueOptimizer.current(name, profile);
  }, []);
  /* "Otimizador →": grava o perfil (entra na mesma fila) e só depois abre o
     otimizador da janela principal no herói — que lê o pedido recém-gravado */
  const openOptimizer = useCallback(async (name, profile) => {
    setSaveError(null);
    const ok = await enqueueOptimizer.current(name, profile);
    const hero = accountRef.current.byName[name];
    if (!ok || !hero) return false;
    try { backend.openInOptimizer(hero.id); return true; }
    catch (e) { setSaveError('Gravei, mas não consegui abrir o otimizador: ' + e.message); return false; }
  }, []);

  /*
   * Popout de item: cada ação (editar, reforjar, duplicar, remover, trocar de
   * herói…) é uma função (backend) => resultado, montada em lib/itemEdit.js com o
   * código do app clássico. Entram numa FILA — uma de cada vez —, e depois de
   * cada uma recarrega a conta (o backend recalcula stats e gear score) e grava
   * o autosave no disco. O erro volta para quem chamou (o popout o mostra).
   */
  const itemChain = useRef(Promise.resolve());
  const runItemJob = useCallback((fn) => {
    const job = itemChain.current.then(async () => {
      const result = await fn(backend);
      const fresh = await refreshRef.current();
      accountRef.current = { ...accountRef.current, byName: fresh };
      await forkSave.autoSave();
      return result;
    });
    itemChain.current = job.catch(() => null);
    return job;
  }, []);
  /*
   * Ações do herói na mesma fila do item (cada uma recarrega a conta e grava o
   * autosave). Erro vira a faixa "Não foi possível gravar" do topo; devolve true/false.
   */
  const heroJob = useCallback((fn) => {
    setSaveError(null);
    return runItemJob(fn).then(() => true, (e) => { setSaveError(e.message); return false; });
  }, []);
  const SLOTS = ['Weapon', 'Helmet', 'Armor', 'Necklace', 'Ring', 'Boots'];
  const accHero = (name) => accountRef.current.byName[name] || null;
  const equippedIds = (h) => SLOTS.map((s) => h && h.equipment && h.equipment[s] && h.equipment[s].id).filter(Boolean);

  /* builds salvas (mesmas rotas do clássico; o backend casa a build pelas 6 peças) */
  const buildActs = {
    // as 6 peças equipadas agora viram uma build salva; o backend calcula os stats dela
    saveBuild: useCallback((name, buildName) => {
      const h = accHero(name);
      const items = equippedIds(h);
      if (!h || items.length !== 6) { setSaveError('A build só pode ser salva com as 6 peças equipadas.'); return Promise.resolve(false); }
      return heroJob((b) => b.addBuild(h.id, { name: buildName, items }));
    }, []),
    // veste as peças da build: o backend tira cada uma de quem estiver usando
    equipBuild: useCallback((name, row) => {
      const h = accHero(name);
      if (!h || !row.items || row.items.length !== 6) return Promise.resolve(false);
      return heroJob((b) => b.equipItemsOnHero(h.id, row.items)).then((ok) => { if (ok) setTarget(null); return ok; });
    }, []),
    renameBuild: useCallback((name, row, buildName) => {
      const h = accHero(name);
      if (!h || !row.build) return Promise.resolve(false);
      return heroJob((b) => b.editBuild(h.id, Object.assign({}, row.build, { name: buildName })))
        .then((ok) => { if (ok) setTarget((t) => (t && t.row.key === row.key ? { heroName: name, row: Object.assign({}, t.row, { name: buildName }) } : t)); return ok; });
    }, []),
    removeBuild: useCallback((name, row) => {
      const h = accHero(name);
      if (!h || !row.build) return Promise.resolve(false);
      return heroJob((b) => b.removeBuild(h.id, row.build))
        .then((ok) => { if (ok) setTarget((t) => (t && t.row.key === row.key ? null : t)); return ok; });
    }, []),
    /* "⋯" de Equipamentos: as peças EQUIPADAS no herói ('unequip' | 'lock' | 'unlock') */
    gearAll: useCallback((name, kind) => {
      const ids = equippedIds(accHero(name));
      if (!ids.length) return Promise.resolve(false);
      const call = { unequip: 'unequipItems', lock: 'lockItems', unlock: 'unlockItems' }[kind];
      return heroJob((b) => b[call](ids));
    }, []),
  };

  const heroesById = useMemo(() => {
    const m = {};
    Object.values(account.byName).forEach((h) => { if (h && h.id) m[h.id] = h; });
    return m;
  }, [account.byName]);

  /*
   * ATK/HP/DEF de um artefato em cada nível (0–30), pela tabela do BACKEND
   * (/fork/artifactStats) — uma chamada por artefato, guardada, para o seletor de
   * nível mostrar o valor na hora sem fórmula no front. { [nome]: [{attack,health,defense}×31] }
   */
  const [artifactLevels, setArtifactLevels] = useState({});
  const artLevelsAsked = useRef(new Set());
  const ensureArtifactLevels = useCallback((name) => {
    if (!name || name === 'None' || artLevelsAsked.current.has(name)) return;
    artLevelsAsked.current.add(name);
    const items = [];
    for (let lv = 0; lv <= heroBonus.ARTIFACT_MAX_LEVEL; lv++) items.push({ name, level: lv });
    backend.forkArtifactStats(items)
      .then((rows) => {
        const table = [];
        rows.forEach((r) => { table[r.level] = { attack: r.attack, health: r.health, defense: r.defense }; });
        setArtifactLevels((m) => ({ ...m, [name]: table }));
      })
      .catch(() => { artLevelsAsked.current.delete(name); });   // tenta de novo na próxima vez
  }, []);

  /*
   * Dados públicos por herói — UM botão ("Baixar") baixa as duas partes:
   *   BUILDS (Fribbels /getBuilds, as N de maior gear score com combinação de sets
   *     do RTA baixado): summary + computed
   *     → caixas Construções/Estatísticas/Artefatos e a lista da aba Construções.
   *       computed = CP/danos/S1–S3/BS pelo backend.
   *   RTA (oficial, do tier escolhido pra cima): official (combos de set com
   *     win rate) → caixa RTA.
   * entry = { status, summary, computed, error, rtaStatus, official, officialError, tier }
   * Abrir a aba lê só o CACHE (sem rede); a rede é só no botão.
   * Tier e quantidade são POR HERÓI (lib/rtaTiers.js): nunca baixado = o padrão da tela Configurações.
   */
  const [community, setCommunity] = useState(() => initialCommunity || {});
  const [savedPrefs, setSavedPrefs] = useState(() => (initialCommunity ? {} : rtaTiers.load()));
  const [pending, setPending] = useState({});   // { [herói]: { tier?, count? } } escolhido e ainda não baixado
  const prefsRef = useRef({ savedPrefs, pending, rel });
  prefsRef.current = { savedPrefs, pending, rel };
  const rtaTierOf = useCallback((name) => (prefsRef.current.pending[name] || {}).tier
    || rtaTiers.tierOf(prefsRef.current.savedPrefs, name, prefsRef.current.rel.communityTier), [savedPrefs, pending, rel.communityTier]);
  const buildsCountOf = useCallback((name) => (prefsRef.current.pending[name] || {}).count
    || rtaTiers.countOf(prefsRef.current.savedPrefs, name, prefsRef.current.rel.communityCount), [savedPrefs, pending, rel.communityCount]);
  const patchEntry = (name, patch) => setCommunity((c) => ({ ...c, [name]: { ...(c[name] || {}), ...patch } }));
  const choose = (name, patch) => {
    setPending((m) => ({ ...m, [name]: { ...(m[name] || {}), ...patch } }));
    prefsRef.current = { ...prefsRef.current, pending: { ...prefsRef.current.pending, [name]: { ...(prefsRef.current.pending[name] || {}), ...patch } } };
  };
  /* baixou: o herói passa a lembrar o que foi usado */
  const remember = (name, patch) => {
    if (initialCommunity) return;
    setSavedPrefs((m) => { const next = rtaTiers.merge(m, name, patch); try { rtaTiers.save(next); } catch (e) { /* segue em memória */ } return next; });
    setPending((m) => { const cur = { ...(m[name] || {}) }; Object.keys(patch).forEach((k) => { delete cur[k]; }); return { ...m, [name]: cur }; });
  };

  const loadBuilds = useCallback(async (name, opts) => {
    const force = !!(opts && opts.force);
    const count = (opts && opts.count) || buildsCountOf(name);
    patchEntry(name, { status: 'loading', error: null });
    try {
      const summary = await communityBuilds.getHero(name, force ? { force: true, count, rtaCombos: opts.rtaCombos } : { offlineOnly: true });
      const acc = accountRef.current.byName[name];
      const computed = summary ? await forkCalc.compute(summary, name, acc ? acc.id : null) : null;
      patchEntry(name, { status: summary ? 'ready' : 'empty', summary, computed, error: null });
      if (force) remember(name, { count });
    } catch (e) {
      patchEntry(name, { status: 'error', error: e.message });
    }
  }, [buildsCountOf]);

  const loadRta = useCallback(async (name, opts) => {
    const force = !!(opts && opts.force);
    const tier = (opts && opts.minTier) || rtaTierOf(name);
    const hero = heroes.find((h) => h.name === name);
    patchEntry(name, { rtaStatus: 'loading' });
    let official = null, officialError = null;
    if (hero && hero.code) {
      try {
        official = await officialStats.getHeroFromTier(hero.code, force ? { minTier: tier, force: true } : { minTier: tier, offlineOnly: true });
      } catch (e) { officialError = e.message; }
    }
    patchEntry(name, { rtaStatus: 'ready', official, officialError, tier });
    if (force) remember(name, { tier });
    return official;
  }, [heroes, rtaTierOf]);

  /* abrir a aba: os dois, só do cache */
  const loadCommunity = useCallback((name) => Promise.all([loadBuilds(name), loadRta(name)]), [loadBuilds, loadRta]);
  /* o botão "Baixar": RTA (tier escolhido) PRIMEIRO, depois as builds (quantidade
     escolhida) — só valem as builds com uma combinação de sets que aparece nesse RTA
     (communityBuilds.selectRows). RTA indisponível: builds sem esse filtro. */
  const downloadCommunity = useCallback(async (name) => {
    patchEntry(name, { status: 'loading', error: null });
    const official = await loadRta(name, { force: true });
    const rtaCombos = official && official.equip ? official.equip.map((e) => e.sets) : null;
    await loadBuilds(name, { force: true, rtaCombos });
  }, [loadBuilds, loadRta]);
  const setRtaTier = useCallback((name, tier) => choose(name, { tier }), []);
  const setBuildsCount = useCallback((name, count) => choose(name, { count }), []);

  // builds da comunidade marcadas para comparar na Principal (arquivo próprio)
  const [marks, setMarks] = useState(() => initialMarks || markedBuilds.load());
  const toggleMark = useCallback((name, row) => {
    setMarks((m) => {
      const next = markedBuilds.toggle(m, name, row);
      if (!initialMarks) { try { markedBuilds.save(next); } catch (e) { /* segue em memória */ } }
      return next;
    });
  }, []);

  /* "2 cliques" num arquétipo da aba Estatísticas: abre Construções filtrada nele */
  const [consPreset, setConsPreset] = useState(null);   // { heroName, arche }

  // nível 1: tela do app — abre no Otimizador (Eduardo, 2026-10-02); sonda/teste com herói/aba escolhidos abre em Heróis
  const [screen, setScreen] = useState(initialScreen || (initialSelected || initialTab ? 'heroi' : 'otimizador'));
  const [archFocus, setArchFocus] = useState(null);    // arquétipo a abrir na tela Arquétipos (vindo de outra tela)
  const [tab, setTab] = useState(initialTab || 'principal');          // nível 2: aba dentro de Herói
  const [selected, setSelected] = useState(initialSelected || null);
  /*
   * BUILD-ALVO: uma build pública (pro/comunidade, ou marcada) escolhida na lista.
   * Enquanto houver uma, o topo do herói mostra ESSA build e o que o gear precisa
   * entregar para chegar nela. { heroName, row } — trocar de herói limpa.
   */
  const [target, setTarget] = useState(initialTarget || null);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [gearFilters, setGearFilters] = useState(initialGearFilters || gearList.EMPTY_FILTERS);   // tela Equipamentos
  const [gearBatch, setGearBatch] = useState(initialGearBatch || batchState.EMPTY);   // up em lote (sobrevive à troca de tela)
  useEffect(() => { if (account.ready) setGearBatch((s) => batchState.prune(s, account.itemsById)); }, [account.itemsById]);
  /*
   * NOTAS DE PEÇA (backend /fork/itemRatings, lib/itemRatings.js): score do jogo, potencial e
   * potencial por perfil. Perfis = arquétipos + heróis com barras no Otimizador (relidos ao
   * trocar de tela: a tela Arquétipos grava no arquivo). As telas leem SÍNCRONO (lib/itemRank.js)
   * e mostram "—" até a resposta; `ratingsVer` sobe quando chega nota nova (redesenha).
   */
  const [ratingsVer, setRatingsVer] = useState(0);
  // modo da pedra na nota PARA o herói, por herói, só na tela de herói e só até fechar o app (padrão: peça como está)
  const [heroGemModes, setHeroGemModes] = useState({});
  /*
   * archetypes.json relido quando `ver` sobe (outra tela gravou). `overlay` = { nome: { profile, tok } }: Otimizador NOVO de
   * gêmeos que seguiram a edição do arquétipo, ainda na fila do backend — os perfis já usam ele, junto com o arquétipo novo,
   * no MESMO render (antes os gêmeos "piscavam" como variantes até cada gravação voltar). Sai quando a gravação termina.
   */
  const [archState, setArchState] = useState({ ver: 0, overlay: {} });
  const heroesForProfiles = useMemo(() => {
    const names = Object.keys(archState.overlay);
    if (!names.length) return account.byName;
    const out = Object.assign({}, account.byName);
    names.forEach((n) => {
      const h = out[n];
      if (h) out[n] = Object.assign({}, h, { optimizationRequest: optimizerProfile.toRequest(archState.overlay[n].profile, h.optimizationRequest, h.id) });
    });
    return out;
  }, [account.byName, archState.overlay]);
  const ratingProfiles = useMemo(() => interest.buildProfiles(archetypes.list(), heroesForProfiles, rel), [heroesForProfiles, screen, rel, archState.ver]);
  // herói idêntico a um arquétipo é atribuído a ele (Eduardo, 2026-10-02)
  useEffect(() => {
    const todo = interest.twinAssignments(ratingProfiles, rel);
    if (todo.length) setRel((s) => todo.reduce((acc, t) => relevance.setProfile(acc, t.name,
      Object.assign({}, relevance.getProfile(acc, t.name) || {}, { archetypeId: t.archetypeId })), s));
  }, [ratingProfiles]);
  useEffect(() => itemRatings.subscribe(() => setRatingsVer((v) => v + 1)), []);
  useEffect(() => {
    if (!account.ready) return;
    const a = itemRatings.setGemMode(rel.gemMode || itemRatings.DEFAULT_GEM_MODE);
    const b = itemRatings.setProfiles(interest.forRatings(ratingProfiles));
    if (a || b) setRatingsVer((v) => v + 1);
    itemRatings.ensure(Object.values(account.itemsById)).catch(() => {});
  }, [account.itemsById, ratingProfiles, rel.gemMode]);
  // main por +N de cada peça (up à mão no lote e no editor: lib/mainCurve.js)
  useEffect(() => { if (account.ready) mainCurve.ensure(Object.values(account.itemsById)); }, [account.itemsById]);
  /* rascunhos (popout, up em lote) também ganham nota */
  const rateDrafts = useCallback((items) => { itemRatings.ensure(items).catch(() => {}); }, []);

  const byName = useMemo(() => {
    const m = {};
    heroes.forEach((h) => { m[h.name] = h; });
    return m;
  }, [heroes]);

  const allNames = useMemo(() => heroes.map((h) => h.name), [heroes]);
  // a lista É o rank: ordem global de todos os heróis (alfabética até o usuário arrastar)
  const ranked = useMemo(() => relevance.rankedNames(rel, allNames), [rel, allNames]);

  /*
   * A NOSSA ordem manda na do backend (= prioridade do otimizador clássico). Na 1ª
   * vez adota a ordem do clássico para os heróis da conta; depois, sempre que a
   * nossa ordem ou a conta mudar e as duas não baterem, reordena o backend (fila do
   * item: recarrega e grava o autosave). Ver lib/heroOrder.js.
   */
  const orderSyncing = useRef(false);
  useEffect(() => {
    if (initialAccount || !account.ready || !account.order || !account.order.length) return;
    if (!rel.classicOrderImported) {
      setRel((s) => relevance.adoptClassicOrder(s, heroOrder.adoptClassic(relevance.rankedNames(s, allNames), account.order.map((h) => h.name))));
      return;   // o próximo render já compara com a ordem adotada
    }
    if (orderSyncing.current) return;   // ao terminar, a conta recarrega e isto roda de novo
    const moves = heroOrder.planMoves(account.order.map((h) => h.id), heroOrder.desiredAccountIds(ranked, account.order));
    if (!moves.length) return;
    orderSyncing.current = true;
    heroJob(async (b) => { for (const m of moves) await b.reorderHeroes(m.id, m.destinationIndex); })
      .then((ok) => { orderSyncing.current = false; if (!ok) setSaveError('Não foi possível gravar a ordem dos heróis no otimizador.'); });
  }, [account, ranked, rel.classicOrderImported]);

  /* sets equipados de cada herói da conta, já ordenados do que tem mais peças
     para o que tem menos (4 antes de 2) — é o que a barra lateral mostra. */
  const setsByName = useMemo(() => {
    const m = {};
    Object.keys(account.byName).forEach((n) => {
      const h = account.byName[n];
      if (h && h.equipment) m[n] = buildsList.equipmentSetIcons(h.equipment);
    });
    return m;
  }, [account.byName]);

  const act = {
    select: useCallback((name) => {
      setSelected(name);
      setTarget((t) => (t && t.heroName === name ? t : null));
    }, []),
    selectTarget: useCallback((heroName, row) => setTarget({ heroName, row }), []),
    clearTarget: useCallback(() => setTarget(null), []),
    setScreen, setTab, setFilters,
    openConstructions: useCallback((heroName, arche) => { setConsPreset({ heroName, arche }); setTab('construcoes'); }, []),
    clearConsPreset: useCallback(() => setConsPreset(null), []),
    resetFilters: useCallback(() => setFilters(EMPTY_FILTERS), []),

    setFavorite: useCallback((name, on) => setRel((s) => relevance.setFavorite(s, name, on)), []),
    /* arquétipo do herói (o clássico não tem esse campo: fica no relevance.json) */
    setArchetype: useCallback((name, archetypeId) => setRel((s) => relevance.setProfile(s, name,
      Object.assign({}, relevance.getProfile(s, name) || {}, { archetypeId: archetypeId || null }))), []),
    setEquipavel: useCallback((name, on) => setRel((s) => relevance.setEquipavel(s, name, on)), []),
    /* cortes de interesse (% de potencial): global e por herói (o do arquétipo fica no arquétipo) */
    setGlobalInterest: useCallback((v) => setRel((s) => relevance.setInterestMin(s, v)), []),
    setInterestLimit: useCallback((v) => setRel((s) => relevance.setInterestLimit(s, v)), []),
    setGemMode: useCallback((m) => setRel((s) => relevance.setGemMode(s, m)), []),
    // visualização rápida: começa na pedra FIXADA do herói (régua da Cobertura), não persiste
    heroGemMode: (name) => heroGemModes[name] || ((interest.profileFor(ratingProfiles, 'h:' + name) || {}).gem) || interest.DEFAULT_PROFILE_GEM,
    profileGemMode: interest.globalGem(rel),
    setHeroGem: useCallback((name, m) => setRel((s) => relevance.setProfile(s, name,
      Object.assign({}, relevance.getProfile(s, name) || {}, { gemMode: m == null ? null : m }))), []),
    reloadArchetypes: useCallback(() => setArchState((s) => ({ ...s, ver: s.ver + 1 })), []),
    /* tela Arquétipos gravou o arquivo: relê E aplica o Otimizador novo dos gêmeos no mesmo render; grava cada um na fila */
    followArchetype: useCallback((changes) => {
      const tok = Date.now() + Math.random();
      setArchState((s) => {
        const overlay = Object.assign({}, s.overlay);
        changes.forEach((c) => { overlay[c.name] = { profile: c.profile, tok }; });
        return { ver: s.ver + 1, overlay };
      });
      changes.forEach((c) => {
        const done = () => setArchState((s) => {
          if (!s.overlay[c.name] || s.overlay[c.name].tok !== tok) return s;
          const overlay = Object.assign({}, s.overlay);
          delete overlay[c.name];
          return { ...s, overlay };
        });
        Promise.resolve(saveOptimizer(c.name, c.profile)).then(done, done);
      });
    }, [saveOptimizer]),
    setProfileGemMode: useCallback((m) => setRel((s) => relevance.setProfileGemMode(s, m)), []),
    /* tela Configurações: communityTier/communityCount/communityDays/autoSync (relevance.SETTINGS; null = padrão) */
    setSetting: useCallback((key, v) => setRel((s) => relevance.setSetting(s, key, v)), []),
    setHeroGemMode: useCallback((name, m) => setHeroGemModes((s) => ({ ...s, [name]: m })), []),
    setHeroInterest: useCallback((name, v) => setRel((s) => relevance.setProfile(s, name,
      Object.assign({}, relevance.getProfile(s, name) || {}, { interestMin: v == null ? null : v }))), []),
    /* arquétipo apagado: os heróis que apontavam para ele ficam sem arquétipo */
    clearArchetype: useCallback((archetypeId) => setRel((s) => Object.keys(s.heroes || {}).reduce((acc, name) => {
      const p = relevance.getProfile(acc, name);
      return p && p.archetypeId === archetypeId ? relevance.setProfile(acc, name, Object.assign({}, p, { archetypeId: null })) : acc;
    }, s)), []),
    /* tela Equipamentos → clicar num arquétipo interessado abre ele na tela Arquétipos */
    openArchetype: useCallback((id) => { setArchFocus(id); setScreen('arquetipos'); }, []),
    /* tela de Arquétipos → clicar num herói abre a aba Otimizador dele */
    openHeroOptimizer: useCallback((name) => {
      setSelected(name);
      setTarget(null);
      setTab('otimizador');
      setScreen('heroi');
    }, []),

    /* ★ liga/desliga direto, sem pergunta. Desligar o favorito NÃO mexe em
       equipável (quem quiser tirar também, desliga o ⚙). Ligar marca equipável
       junto, porque favorito ⊂ equipável. */
    toggleFavorite: useCallback((name) => {
      setRel((s) => relevance.setFavorite(s, name, !relevance.isFavorite(s, name)));
    }, []),
    /* ⚙ direto: desligar equipável também tira o favorito (regra do relevance) */
    toggleEquipavel: useCallback((name) => {
      setRel((s) => relevance.setEquipavel(s, name, !relevance.isEquipavel(s, name)));
    }, []),

    /* arrasta `name` para antes de `anchor` (null = fim) na ordem GLOBAL */
    moveBefore: useCallback((name, anchor) => {
      setRel((s) => relevance.reorderBefore(s, relevance.rankedNames(s, allNames), name, anchor));
    }, [allNames]),

    /* digitou uma posição: move dentro da lista VISÍVEL (respeita o filtro) */
    moveToPosition: useCallback((name, pos, visibleNames) => {
      setRel((s) => relevance.reorderToVisiblePosition(
        s, relevance.rankedNames(s, allNames), visibleNames, name, pos));
    }, [allNames]),
  };

  /* tela Configurações: versão do fork no backend (uma vez, quando a conta conecta) e a pasta dos saves */
  const [forkVersion, setForkVersion] = useState(null);
  useEffect(() => { if (account.ready && !initialAccount) backend.forkPing().then(setForkVersion); }, [account.ready]);
  /* troca a pasta dos saves: grava a conta, copia e confere (lib/maintenance.js) e aponta o settings.ini.
     Quem chama reinicia o app (o clássico só relê a pasta ao abrir). */
  const switchSavesFolder = useCallback(async (dest) => {
    if (accountRef.current.ready) await forkSave.autoSave().catch(() => {});   // conta vazia: nada a gravar
    return maintenance.switchFolder(dest);
  }, []);

  const value = {
    heroes, byName, allNames, ranked, catalogError,
    rel, account, setsByName,
    refreshAccount, saveBonus, saveOptimizer, openOptimizer, saveError,
    runItemJob, heroesById, itemById: (id) => (id && account.itemsById[id]) || null,
    ...buildActs,
    artifactLevels, ensureArtifactLevels,
    community, loadCommunity, downloadCommunity, loadBuilds, loadRta, rtaTierOf, setRtaTier, buildsCountOf, setBuildsCount,
    communityDays: rel.communityDays || communityBuilds.CACHE_TTL_MS / 864e5, autoSync: rel.autoSync !== false,
    marks, toggleMark, consPreset,
    target: target && target.heroName === selected ? target : null,
    markedOf: (n) => markedBuilds.list(marks, n),
    isMarked: (n, key) => markedBuilds.isMarked(marks, n, key),
    accountHero: (n) => account.byName[n] || null,
    screen, tab, selected, filters, archFocus, gearFilters, setGearFilters, gearBatch, setGearBatch,
    ratingsVer, ratingProfiles, rateDrafts, interestGlobal: interest.globalMin(rel), interestLimit: interest.limitOf(rel), gemMode: rel.gemMode || itemRatings.DEFAULT_GEM_MODE,
    isFavorite: (n) => relevance.isFavorite(rel, n),
    isEquipavel: (n) => relevance.isEquipavel(rel, n),
    isBuilt: (n) => { const h = account.byName[n]; return !!(h && h.equipment && Object.keys(h.equipment).length); },
    profileOf: (n) => relevance.getProfile(rel, n),
    rel,
    forkVersion, savesDir: forkPaths.savesDir(), planSavesFolder: maintenance.planSwitch, switchSavesFolder,
    ...act,
  };

  return html`<${Ctx.Provider} value=${value}>${children}<//>`;
}

function useApp() { return React.useContext(Ctx); }

module.exports = { AppProvider, useApp, EMPTY_FILTERS, createSaveQueue };
