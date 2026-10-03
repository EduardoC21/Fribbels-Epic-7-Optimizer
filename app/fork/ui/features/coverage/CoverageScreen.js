/*
 * CoverageScreen — tela COBERTURA (E6, nota 21): onde faltam peças boas para o que os heróis pedem.
 *
 *   barra  [Tipos | Perfis] · (Tipos: Agrupar Peça/+Principal/+Set/Set · Peça · Principal · Set · Perfil · N tipos · Limpar)
 *          ··· Atendidos · Régua padrão · Pedra padrão · (com rascunho: Desfazer · Aplicar)
 *   Tipos  tabela (CoverageTable, gargalo primeiro) | detalhe da linha (CoverageDetail: funil, quem pede, perto da régua)
 *   Perfis matriz perfil × 6 peças com a régua e a pedra de cada um (CoverageProfiles)
 *
 * SIMULADOR (Eduardo, 2026-10-02): mexer em régua/pedra (de um perfil ou as padrões) muda os números da tela inteira na
 * hora, sem gravar; "Aplicar" grava no lugar de verdade (herói → relevance; arquétipo → archetypes.json; padrão →
 * relevance.interestMin / profileGemMode) e vale em todas as telas; "Desfazer" descarta. Os perfis do rascunho saem do
 * mesmo interest.buildProfiles (a nota por perfil não depende da régua, e o backend já manda os 4 modos de pedra).
 * Agrupamento e filtros são DESTA tela (não vazam).
 */
'use strict';
const { html, useState, useMemo, useCallback } = require('../../h.js');
const { Glyph, GearIcon, SetIcon, StatIcon, Dropdown, Button, Segmented, ArchetypeSymbol, Portrait, InterestCut, EmptyState } = require('../../components/index.js');
const { noAccount } = require('../shell/emptyStates.js');
const { useApp } = require('../../state/app.js');
const { ItemPopout } = require('../item/ItemPopout.js');
const { CoverageTable } = require('./CoverageTable.js');
const { CoverageDetail } = require('./CoverageDetail.js');
const { CoverageProfiles } = require('./CoverageProfiles.js');
const { setName, GEM_OPTS } = require('./coverageText.js');
const C = require('../../../lib/coverage.js');
const interest = require('../../../lib/interest.js');
const archetypes = require('../../../lib/archetypes.js');
const itemStats = require('../../../lib/itemStats.js');
const itemRatings = require('../../../lib/itemRatings.js');
const { SLOT_PT } = require('../top/GearCard.js');
const G = require('../gear/gearList.js');

const VIEWS = [{ value: 'tipos', label: 'Tipos', title: 'Gargalos por tipo de peça' }, { value: 'perfis', label: 'Perfis', title: 'Por arquétipo e herói' }];
const GROUPS = [
  { value: 'slot', label: 'Peça', title: 'Por tipo de peça' },
  { value: 'main', label: '+Principal', title: 'Peça e principais aceitos' },
  { value: 'full', label: '+Set', title: 'Peça, principais e sets aceitos' },
  { value: 'set', label: 'Set', title: 'Por set (peças exigidas)' },
];
const EMPTY = { slots: [], sets: [], mains: [], profile: null };
const NO_SIM = { a: {}, h: {}, g: {} };   // rascunho: { a: {id: {min?, gem?}}, h: {nome: …}, g: {min?, gem?} }; null = volta a herdar
const toggleIn = (arr, v) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
const anyIn = (list, sel) => (list || []).some((x) => sel.includes(x));
const pendingOf = (sim) => Object.keys(sim.a).length + Object.keys(sim.h).length + Object.keys(sim.g).length;

/* arquétipos e relevance do RASCUNHO (cópias; nada é gravado) */
function draftOf(rel, sim) {
  const r = Object.assign({}, rel, { heroes: Object.assign({}, rel.heroes || {}) });
  const put = (obj, k, v) => { if (v == null) delete obj[k]; else obj[k] = v; };
  if ('min' in sim.g) put(r, 'interestMin', sim.g.min);
  if ('gem' in sim.g) put(r, 'profileGemMode', sim.g.gem);
  Object.keys(sim.h).forEach((n) => {
    const e = Object.assign({}, r.heroes[n] || {});
    const p = Object.assign({}, e.profile || {});
    if ('min' in sim.h[n]) p.interestMin = sim.h[n].min;
    if ('gem' in sim.h[n]) p.gemMode = sim.h[n].gem;
    e.profile = p;
    r.heroes[n] = e;
  });
  const archs = archetypes.list().map((a) => {
    const s = sim.a[a.id];
    return s ? Object.assign({}, a, 'min' in s ? { interestMin: s.min } : {}, 'gem' in s ? { gemMode: s.gem } : {}) : a;
  });
  return { rel: r, archs };
}

function Tog({ on, title, onClick, children }) {
  return html`<button type="button" className=${'hf-tog eq-tog' + (on ? ' on' : '')}
    title=${title} aria-label=${title} aria-pressed=${!!on} onClick=${onClick}>${children}</button>`;
}

/* `initialGroup`/`initialKey`/`initialView`/`initialSim` só para teste/sonda */
function CoverageScreen({ initialGroup, initialKey, initialView, initialSim }) {
  const app = useApp();
  const [view, setView] = useState(initialView || 'tipos');
  const [group, setGroup] = useState(initialGroup || 'main');
  const [f, setF] = useState(EMPTY);
  const [sel, setSel] = useState(initialKey || null);
  const [open, setOpen] = useState(null);   // id da peça no popout
  const [sim, setSim] = useState(initialSim || NO_SIM);
  const set = (patch) => setF((s) => ({ ...s, ...patch }));
  const pending = pendingOf(sim);
  const items = useMemo(() => Object.values(app.account.itemsById || {}), [app.account.itemsById]);
  const profiles = useMemo(() => {
    if (!pending) return app.ratingProfiles;
    const d = draftOf(app.rel, sim);
    return interest.buildProfiles(d.archs, app.account.byName, d.rel);
  }, [app.ratingProfiles, app.rel, app.account.byName, sim, pending]);
  const ctx = useMemo(() => C.analyze(items, profiles), [items, profiles, app.ratingsVer]);
  const all = useMemo(() => C.rows(ctx, group), [ctx, group]);
  const target = useMemo(() => interest.profileFor(profiles, f.profile), [profiles, f.profile]);
  const hasMain = group === 'main' || group === 'full';
  const hasSet = group === 'full' || group === 'set';
  const rows = useMemo(() => all.filter((r) => (!f.slots.length || !r.slot || f.slots.includes(r.slot))
    && (!hasSet || !f.sets.length || anyIn(r.sets, f.sets))
    && (!hasMain || !f.mains.length || anyIn(r.mains, f.mains))
    && (!target || r.who.some((x) => x.p.id === target.id))), [all, f, target, hasMain, hasSet]);
  const opts = useMemo(() => ({
    sets: Array.from(new Set([].concat(...all.map((r) => r.sets || [])))).sort(),
    mains: G.SUB_TYPES.filter((t) => all.some((r) => (r.mains || []).includes(t))),
  }), [all]);
  // atendidos: alocação pela ordem dos heróis (lib/coverage.js allocate)
  const alloc = useMemo(() => C.allocate(ctx, app.ranked), [ctx, app.ranked]);
  const served = { n: alloc.served, want: alloc.total + ctx.unprofiled.length };
  const row = rows.find((r) => r.key === sel) || rows[0] || null;
  const codeOf = useCallback((name) => (name && app.byName[name] ? app.byName[name].code : null), [app.byName]);
  const pick = useCallback((r) => setSel(r.key), []);
  const filtered = f.slots.length || (hasSet && f.sets.length) || (hasMain && f.mains.length) || f.profile;

  // rascunho: `key` = 'a' | 'h' | 'g'; id = arquétipo / nome do herói (g: ignorado)
  const simSet = useCallback((key, id, field, v) => setSim((s) => {
    const n = { a: { ...s.a }, h: { ...s.h }, g: { ...s.g } };
    if (key === 'g') n.g = { ...n.g, [field]: v };
    else n[key][id] = { ...(n[key][id] || {}), [field]: v };
    return n;
  }), []);
  const onCut = useCallback((key, id, v) => simSet(key, id, 'min', v), [simSet]);
  const onGem = useCallback((key, id, v) => simSet(key, id, 'gem', v), [simSet]);
  const onCell = useCallback((p, slot) => {
    setF({ ...EMPTY, slots: [slot], profile: p.id });
    setSel(null);
    setView('tipos');
  }, []);
  const apply = () => {
    Object.keys(sim.h).forEach((n) => {
      if ('min' in sim.h[n]) app.setHeroInterest(n, sim.h[n].min);
      if ('gem' in sim.h[n]) app.setHeroGem(n, sim.h[n].gem);
    });
    if (Object.keys(sim.a).length) {
      archetypes.save(draftOf(app.rel, { a: sim.a, h: {}, g: {} }).archs);
      app.reloadArchetypes();
    }
    if ('min' in sim.g) app.setGlobalInterest(sim.g.min);
    if ('gem' in sim.g) app.setProfileGemMode(sim.g.gem);
    setSim(NO_SIM);
  };
  const gMin = 'min' in sim.g ? sim.g.min : (app.rel.interestMin != null ? app.rel.interestMin : null);
  const gGem = 'gem' in sim.g ? sim.g.gem : (app.rel.profileGemMode || null);

  const none = noAccount(app.account);
  if (none) return html`<div className="eq cv-screen">${none}</div>`;
  // ninguém pede peça (nenhum herói Favorito/Equipável com barras): a tela inteira vira o bloco "sem dados"
  if (!all.length) {
    return html`<div className="eq cv-screen"><${EmptyState} icon=${html`<${Glyph} name="people" size=${30} />`}
      title="Nenhum perfil pedindo peças" tip="Marque heróis como Favorito ou Equipável e dê barras no Otimizador deles"
      action=${html`<${Button} onClick=${() => app.setScreen('heroi')}>Heróis<//>`} /></div>`;
  }

  return html`<div className="eq cv-screen">
    <div className="eq-bar" role="search" aria-label="Cobertura: vista, agrupamento, filtros e régua">
      <div className="eq-row">
        <${Segmented} label="Vista" options=${VIEWS} value=${view} onChange=${setView} className="cv-seg" />
        ${view === 'tipos' ? html`<span className="contents">
          <span className="eq-group" role="group" aria-label="Agrupar">
            <span className="eq-lab" aria-hidden="true">Agrupar</span>
            <${Segmented} label="Agrupar" options=${GROUPS} value=${group} onChange=${setGroup} className="cv-seg" />
          </span>
          <span className="eq-group" role="group" aria-label="Tipo de peça">
            <span className="eq-lab" aria-hidden="true">Peça</span>
            ${C.SLOTS.map((s) => html`<${Tog} key=${s} title=${SLOT_PT[s]} on=${f.slots.includes(s)}
              onClick=${() => set({ slots: toggleIn(f.slots, s) })}><${GearIcon} slot=${s} size=${18} /><//>`)}
          </span>
          <span className="eq-group eq-dds">
            ${hasMain ? html`<span className="eq-dd"><${Dropdown} multiple=${true} label="Principal" placeholder="Principal"
              options=${opts.mains.map((t) => ({ value: t, label: G.NAME[t], icon: html`<${StatIcon} stat=${itemStats.info(t).icon} size=${13} />` }))}
              value=${f.mains} onChange=${(v) => set({ mains: v })} /></span>` : ''}
            ${hasSet ? html`<span className="eq-dd"><${Dropdown} multiple=${true} label="Set" placeholder="Set"
              options=${opts.sets.map((s) => ({ value: s, label: setName(s), icon: html`<${SetIcon} set=${s} size=${14} />` }))}
              value=${f.sets} onChange=${(v) => set({ sets: v })} /></span>` : ''}
            <span className="eq-dd eq-target"><${Dropdown} label="Perfil" placeholder="Perfil: todos" clearable=${true} search="buscar arquétipo ou herói"
              options=${interest.targets(profiles).map((t) => ({ value: t.key, label: t.via ? `${t.name} · ${t.via.name}` : t.name,
                icon: t.kind === 'a' ? html`<${ArchetypeSymbol} symbol=${t.symbol} size=${16} />` : html`<${Portrait} code=${codeOf(t.name)} size=${16} />` }))}
              value=${f.profile} onChange=${(v) => set({ profile: v === f.profile ? null : v })} /></span>
          </span>
          <span className="eq-count sub tnum" aria-live="polite">${rows.length === all.length ? `${all.length} tipos` : `${rows.length} de ${all.length} tipos`}</span>
          <${Button} variant="ghost" className="eq-clear" disabled=${!filtered} onClick=${() => setF(EMPTY)}>
            <${Glyph} name="close" size=${11} /> Limpar filtros<//>
        </span>` : ''}
        <span className="eq-tools">
          <span className="cv-served" title=${`Pela ordem dos heróis, cada um pega 1 peça válida por slot (a menos disputada); atendido = pegou nos 6${ctx.unprofiled.length ? ` · sem barras: ${ctx.unprofiled.join(', ')}` : ''}`}>
            <span className="eq-lab">Atendidos</span><b className="tnum">${served.n}</b><span className="it-free tnum">/ ${served.want}</span></span>
          <span className=${'eq-int' + ('min' in sim.g ? ' cv-pend' : '')} title="Régua padrão dos perfis">
            <${InterestCut} lead="Régua" label="Régua padrão" value=${gMin} inherited=${interest.DEFAULT_MIN} onChange=${(v) => onCut('g', null, v)} />
          </span>
          <span className=${'eq-dd eq-gem' + ('gem' in sim.g ? ' cv-pend' : '') + (gGem == null ? ' inherited' : '')} title=${itemRatings.GEM_MODE_TIP[gGem || interest.DEFAULT_PROFILE_GEM] || ''}>
            <${Dropdown} label="Pedra padrão dos perfis" options=${GEM_OPTS} value=${gGem} clearable=${true}
              placeholder=${itemRatings.GEM_MODE_LABEL[interest.DEFAULT_PROFILE_GEM]} onChange=${(v) => onGem('g', null, v)} /></span>
          ${pending ? html`<span className="contents">
            <${Button} variant="ghost" className="eq-clear" onClick=${() => setSim(NO_SIM)} title="Descarta a simulação">Desfazer<//>
            <${Button} variant="accent" className="eq-clear" onClick=${apply} title="Grava régua e pedra em todas as telas">
              Aplicar<span className="eq-batch-n cv-n-pend tnum">${pending}</span><//>
          </span>` : ''}
        </span>
      </div>
    </div>
    ${view === 'perfis'
      ? html`<div className="eq-list"><${CoverageProfiles} ctx=${ctx} alloc=${alloc} codeOf=${codeOf} sim=${sim} onCut=${onCut} onGem=${onGem} onCell=${onCell} /></div>`
      : html`<div className="eq-main cv-main">
          <div className="eq-list">
            <${CoverageTable} rows=${rows} pickedKey=${row ? row.key : null} onPick=${pick} codeOf=${codeOf}
              empty="Nenhum tipo com esses filtros" />
          </div>
          <${CoverageDetail} key=${'cvd:' + (row ? row.key : '-')} ctx=${ctx} row=${row} codeOf=${codeOf} full=${true}
            onHero=${app.openHeroOptimizer} onArch=${app.openArchetype} onItem=${setOpen} />
        </div>`}
    ${open ? html`<${ItemPopout} key=${'pop:' + open} itemId=${open} onClose=${() => setOpen(null)}
      gemMode=${app.heroGemMode((app.itemById(open) || {}).equippedByName)} />` : ''}
  </div>`;
}

module.exports = { CoverageScreen, draftOf };
