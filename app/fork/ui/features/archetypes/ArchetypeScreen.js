/*
 * ArchetypeScreen — a tela Arquétipos (nível 1 da navegação, ao lado de Herói):
 *   barra lateral  [Novo arquétipo] + a lista (símbolo · nome · barras fortes · sets · nº de heróis)
 *   área central   o editor do arquétipo escolhido (ArchetypeEditor)
 *
 * Os arquétipos são GLOBAIS (lib/archetypes.js, Documents/…/archetypes.json). A
 * lista vive no estado desta tela e é gravada inteira ~0,6 s depois da última
 * mudança (criar e apagar gravam na hora; sair da tela grava o que ficou pendente).
 * Quem usa cada arquétipo vem do relevance.json (profile.archetypeId do herói).
 *
 * Teclado da lista (igual à de heróis): UMA parada de Tab na linha escolhida,
 * ↑ ↓ Home End trocam, Enter/Espaço escolhem.
 */
'use strict';
const { html, useState, useEffect, useRef, useMemo } = require('../../h.js');
const { Scrollable, Button, Glyph, SetIcon, StatIcon, ArchetypeSymbol } = require('../../components/index.js');
const { useApp } = require('../../state/app.js');
const { ConfirmDialog } = require('../principal/BuildDialogs.js');
const { ArchetypeEditor } = require('./ArchetypeEditor.js');
const archetypes = require('../../../lib/archetypes.js');
const interest = require('../../../lib/interest.js');
const OP = require('../../../lib/optimizerProfile.js');
const statInfo = require('../../../lib/statInfo.js');

const SAVE_MS = 600;
// símbolo de exemplo do estado vazio (neutro: o accent é só ação/seleção/foco)
const EXAMPLE = { bg: 'var(--surface-2)', fg: 'var(--text)', main: 'mage', subs: ['spd', 'cr', 'cd'] };
const ICON = {};
statInfo.GAME.forEach((e) => { ICON[e.k] = e; });

/* o que a linha resume: stats de barra 3 e depois 2 (até 4) e o 1º set de cada slot */
function rowSummary(a) {
  const strong = statInfo.GAME.map((e) => e.k).filter((k) => a.stats[k].priority >= 2)
    .sort((x, y) => a.stats[y].priority - a.stats[x].priority).slice(0, 4);
  const sets = a.sets.map((s) => s[0]).filter(Boolean);
  return { strong, sets };
}

function ArchetypeRow({ a, users, selected, focusable, onSelect, onKey }) {
  const { strong, sets } = rowSummary(a);
  const name = a.name || 'Sem nome';
  return html`<div className=${'hr ab-row' + (selected ? ' sel' : '')} role="option" aria-selected=${!!selected}
    aria-label=${`${name}${users ? `, ${users} ${users === 1 ? 'herói' : 'heróis'}` : ''}`}
    tabIndex=${focusable ? 0 : -1} onClick=${() => onSelect(a.id)} onKeyDown=${(e) => onKey(e, a.id)}>
    <${ArchetypeSymbol} symbol=${a.symbol} size=${36} />
    <span className="hr-info">
      <span className=${'hr-name ellipsis' + (a.name ? '' : ' muted')} title=${name}>${name}</span>
      <span className="hr-meta">
        ${strong.length ? strong.map((k) => html`<${StatIcon} key=${k} stat=${ICON[k].icon} size=${14}
          title=${`${ICON[k].label}: prioridade ${a.stats[k].priority}`} />`)
          : html`<span className="ab-row-none">sem barras</span>`}
      </span>
    </span>
    <span className="hr-right">
      <span className="hr-flags ab-row-users" title=${`${users} ${users === 1 ? 'herói' : 'heróis'}`}>
        ${users ? html`<span className="contents"><${Glyph} name="people" size=${13} /><b className="tnum">${users}</b></span>` : null}
      </span>
      <span className="hr-sets">${sets.map((s, i) => html`<${SetIcon} key=${i} set=${s} size=${15} />`)}</span>
    </span>
  </div>`;
}

function ArchetypeScreen() {
  const app = useApp();
  const [list, setList] = useState(() => archetypes.list());
  const [selId, setSelId] = useState(() => (app.archFocus && list.some((a) => a.id === app.archFocus) ? app.archFocus : list[0] ? list[0].id : null));
  const [fresh, setFresh] = useState(null);         // id recém-criado: o editor foca o nome
  const [asking, setAsking] = useState(false);      // confirmação de apagar
  const [error, setError] = useState(null);

  /* gravação: a lista inteira, com debounce; ao sair da tela grava o pendente */
  const latest = useRef(list);
  const saved = useRef(list);   // a lista como está no arquivo (base do "o que mudou" para os gêmeos)
  const timer = useRef(null);
  // edição do Otimizador do arquétipo → os heróis GÊMEOS dele (atribuídos e idênticos antes da edição) mudam igual;
  // variantes (atribuídos e diferentes) ficam como estão
  const followTwins = (before, after) => {
    const changes = [];
    after.forEach((a) => {
      const b = before.find((x) => x.id === a.id);
      if (!b || (JSON.stringify([b.sets, b.mains, b.stats]) === JSON.stringify([a.sets, a.mains, a.stats]))) return;
      app.ranked.forEach((n) => {
        const own = app.profileOf(n) || {};
        if (own.archetypeId !== a.id) return;
        const h = app.accountHero(n);
        const prof = h && h.optimizationRequest ? OP.fromRequest(h.optimizationRequest) : null;
        if (prof && interest.isTwinOf(b, prof, own, app.rel)) changes.push({ name: n, profile: OP.applyArchetypeChange(prof, b, a) });
      });
    });
    return changes;
  };
  const write = () => {
    timer.current = null;
    try {
      archetypes.save(latest.current);
      setError(null);
      const changes = followTwins(saved.current, latest.current);
      saved.current = latest.current;
      if (changes.length) app.followArchetype(changes); else app.reloadArchetypes();   // arquivo + gêmeos no mesmo render
    } catch (e) { setError(`Não foi possível gravar os arquétipos: ${e.message}`); }
  };
  // fechar a janela não desmonta o React: o pendente é gravado no beforeunload também
  useEffect(() => {
    const flush = () => { if (timer.current) { clearTimeout(timer.current); timer.current = null; try { archetypes.save(latest.current); } catch (e) { /* janela fechando */ } } };
    window.addEventListener('beforeunload', flush);
    return () => { window.removeEventListener('beforeunload', flush); flush(); };
  }, []);
  // a tela fica montada ao trocar de tela: ao sair grava o pendente; ao voltar relê o arquivo (a Cobertura pode ter gravado)
  useEffect(() => {
    if (app.screen !== 'arquetipos') { if (timer.current) { clearTimeout(timer.current); write(); } return; }
    if (!timer.current) { const l = archetypes.list(); latest.current = l; saved.current = l; setList(l); }
  }, [app.screen]);
  const commit = (next, now) => {
    latest.current = next;
    setList(next);
    clearTimeout(timer.current);
    if (now) write(); else timer.current = setTimeout(write, SAVE_MS);
  };

  // quem usa cada arquétipo, na ordem do rank de heróis
  const usersOf = useMemo(() => {
    const m = {};
    app.ranked.forEach((n) => {
      const id = (app.profileOf(n) || {}).archetypeId;
      if (id) (m[id] = m[id] || []).push(n);
    });
    return m;
  }, [app.rel, app.ranked]);

  const sel = list.find((a) => a.id === selId) || null;

  const create = () => {
    const a = archetypes.create();
    commit(list.concat(a), true);
    setSelId(a.id);
    setFresh(a.id);
  };
  const edit = (a) => commit(list.map((x) => (x.id === a.id ? a : x)));
  const remove = () => {
    const i = list.findIndex((a) => a.id === selId);
    const next = list.filter((a) => a.id !== selId);
    commit(next, true);
    app.clearArchetype(selId);
    setSelId(next.length ? next[Math.min(i, next.length - 1)].id : null);
  };

  const onKey = (e, id) => {
    if (e.target !== e.currentTarget) return;
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelId(id); return; }
    const i = list.findIndex((a) => a.id === id);
    const to = { ArrowDown: i + 1, ArrowUp: i - 1, Home: 0, End: list.length - 1 }[e.key];
    if (to == null || to < 0 || to >= list.length || to === i) return;
    e.preventDefault();
    setSelId(list[to].id);
    const rows = e.currentTarget.parentElement.querySelectorAll('.ab-row');
    if (rows[to]) rows[to].focus();
  };

  const selUsers = sel ? usersOf[sel.id] || [] : [];
  // gêmeos = idênticos (perfil do arquétipo); variantes = atribuídos e diferentes (perfil próprio), na ordem do rank
  const twinSet = new Set(((sel && app.ratingProfiles.find((p) => p.id === 'a:' + sel.id)) || {}).heroes || []);
  const twins = app.ranked.filter((h) => twinSet.has(h));
  const variants = selUsers.filter((h) => !twinSet.has(h));
  const n = selUsers.length;
  return html`<div className="hero-screen">
    <aside className="sb">
      <div className="hf">
        <div className="hf-title">
          <b>Arquétipos</b>
          <span className="sub tnum">${list.length}</span>
        </div>
        <${Button} variant="accent" className="ab-new" onClick=${create}>
          <span className="contents"><${Glyph} name="plus" size=${14} /> Novo arquétipo</span><//>
      </div>
      <${Scrollable} className="sb-list" role="listbox" label="Arquétipos">
        ${list.map((a) => html`<${ArchetypeRow} key=${a.id} a=${a} users=${(usersOf[a.id] || []).length}
          selected=${a.id === selId} focusable=${a.id === (sel ? selId : list[0].id)}
          onSelect=${setSelId} onKey=${onKey} />`)}
      <//>
    </aside>

    <${Scrollable} className="hero-main">
      ${error ? html`<div className="ab-error" role="alert">${error}</div>` : null}
      ${sel ? html`<${ArchetypeEditor} key=${sel.id} arch=${sel} fresh=${fresh === sel.id}
          twins=${twins} variants=${variants} byName=${app.byName} onChange=${edit}
          onAskDelete=${() => setAsking(true)} onOpenHero=${app.openHeroOptimizer} globalMin=${app.interestGlobal} globalGem=${app.profileGemMode} />`
        : html`<div className="ab-empty">
          <${ArchetypeSymbol} size=${96} symbol=${EXAMPLE} />
          <h2>Nenhum arquétipo ainda</h2>
          <${Button} variant="accent" onClick=${create}>
            <span className="contents"><${Glyph} name="plus" size=${14} /> Criar o primeiro arquétipo</span><//>
        </div>`}
    <//>

    ${asking && sel ? html`<${ConfirmDialog} title="Apagar arquétipo"
      text=${`Apagar “${sel.name || 'sem nome'}”?` + (n ? ` ${n === 1 ? '1 herói usa' : `${n} heróis usam`} este arquétipo e ${n === 1 ? 'fica' : 'ficam'} sem arquétipo; a configuração do otimizador não muda.` : '')}
      confirmLabel="Apagar" onConfirm=${remove} onClose=${() => setAsking(false)} />` : null}
  </div>`;
}

module.exports = { ArchetypeScreen, rowSummary };
