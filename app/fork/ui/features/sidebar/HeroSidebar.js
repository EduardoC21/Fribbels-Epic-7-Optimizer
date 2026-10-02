/*
 * HeroSidebar — a barra lateral: filtros + a lista que É o rank.
 *
 * Interações:
 *  - clique           → seleciona o herói
 *  - botão direito    → liga/desliga favorito (direto, sem pergunta)
 *  - arrastar         → muda a posição no rank (metade de cima da linha-alvo
 *                       coloca antes dela, metade de baixo coloca depois)
 *  - clicar no número → digita a posição no rank
 *  - teclado          → Tab entra na linha selecionada; ↑/↓/Home/End trocam o
 *                       herói; Enter/Espaço seleciona; tecla de menu = favorito
 */
'use strict';
const { html, useState, useMemo, useEffect, useRef } = require('../../h.js');
const { Scrollable, Button } = require('../../components/index.js');
const { useApp } = require('../../state/app.js');
const { HeroFilters } = require('./HeroFilters.js');
const { HeroRow } = require('./HeroRow.js');

// busca sem acento e sem caixa: "iseria" acha "Iséria"
const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

function applyFilters(names, app) {
  const f = app.filters;
  const q = norm(f.q.trim());
  return names.filter((n) => {
    const h = app.byName[n];
    if (!h) return false;
    if (q && !norm(n).includes(q)) return false;
    if (f.elements.length && !f.elements.includes(h.attribute)) return false;
    if (f.roles.length && !f.roles.includes(h.role)) return false;
    if (f.stars.length && !f.stars.includes(h.rarity)) return false;
    if (f.favorite && !app.isFavorite(n)) return false;
    if (f.equipavel && !app.isEquipavel(n)) return false;
    if (f.built && !app.isBuilt(n)) return false;
    if (f.archetype) {
      const p = app.profileOf(n);
      const arch = p && p.archetypeId;
      if (f.archetype === '__none__' ? !!arch : arch !== f.archetype) return false;
    }
    return true;
  });
}

/*
 * Matemática do rank em funções PURAS (testáveis sem gravar nada).
 * Todas devolvem a "âncora": o herói ANTES do qual `name` deve ser inserido
 * na ordem global (null = vai para o fim). É o que relevance.reorderBefore espera.
 */
// posição digitada = posição GLOBAL resultante
function anchorForPosition(ranked, name, pos) {
  const others = ranked.filter((n) => n !== name);
  const i = Math.max(0, Math.min(others.length, (parseInt(pos, 10) || 1) - 1));
  return i < others.length ? others[i] : null;
}
// soltou `drag` sobre `target`: metade de cima = antes dele, metade de baixo = depois
function anchorForDrop(ranked, drag, target, after) {
  const others = ranked.filter((n) => n !== drag);
  const idx = others.indexOf(target);
  if (idx < 0) return undefined;
  return after ? (others[idx + 1] || null) : target;
}
// simula o resultado (mesma regra de relevance.reorderBefore), para teste
function simulateMove(ranked, name, anchor) {
  const arr = ranked.filter((n) => n !== name);
  const to = anchor ? arr.indexOf(anchor) : arr.length;
  arr.splice(to < 0 ? arr.length : to, 0, name);
  return arr;
}

function HeroSidebar() {
  const app = useApp();
  const visible = useMemo(() => applyFilters(app.ranked, app), [app.ranked, app.filters, app.rel, app.byName]);
  const rankOf = useMemo(() => {
    const m = {};
    app.ranked.forEach((n, i) => { m[n] = i + 1; });
    return m;
  }, [app.ranked]);

  const [over, setOver] = useState(null);          // { name, after } — linha de encaixe desenhada

  // sem ninguém selecionado → seleciona o primeiro do rank
  useEffect(() => {
    if (!app.selected && app.ranked.length) app.select(app.ranked[0]);
  }, [app.ranked.length]);

  /*
   * Handlers ESTÁVEIS (criados uma vez; leem o estado atual por ref) e chamados
   * com o nome do herói: assim o HeroRow (memo) só re-renderiza quando as props
   * DELE mudam — digitar na busca não redesenha as centenas de linhas.
   */
  const now = useRef({});
  now.current = { app, visible };
  const dragRef = useRef(null);                    // nome sendo arrastado
  const overRef = useRef(null);
  const setOverBoth = (v) => { overRef.current = v; setOver(v); };
  const h = useMemo(() => ({
    select: (n) => now.current.app.select(n),
    context: (e, n) => { e.preventDefault(); now.current.app.toggleFavorite(n); },
    rank: (n, pos) => now.current.app.moveBefore(n, anchorForPosition(now.current.app.ranked, n, pos)),
    /* setas/Home/End: a seleção acompanha o foco (listbox de seleção única) */
    navigate: (e, n) => {
      const vis = now.current.visible;
      const i = vis.indexOf(n);
      const to = { ArrowDown: i + 1, ArrowUp: i - 1, Home: 0, End: vis.length - 1 }[e.key];
      if (to == null || to < 0 || to >= vis.length || to === i) return;
      e.preventDefault();
      const rows = e.currentTarget.parentElement.querySelectorAll('.hr');
      now.current.app.select(vis[to]);
      if (rows[to]) rows[to].focus();
    },
    dragStart: (e, n) => { dragRef.current = n; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', n); },
    dragOver: (e, n) => {
      const drag = dragRef.current;
      if (!drag || drag === n) return;
      e.preventDefault();
      const r = e.currentTarget.getBoundingClientRect();
      const after = e.clientY > r.top + r.height / 2;
      const cur = overRef.current;
      if (!cur || cur.name !== n || cur.after !== after) setOverBoth({ name: n, after });
    },
    dragLeave: (e, n) => { if (overRef.current && overRef.current.name === n) setOverBoth(null); },
    drop: (e, n) => {
      e.preventDefault();
      const drag = dragRef.current;
      if (drag && drag !== n) {
        const ranked = now.current.app.ranked;
        const anchor = anchorForDrop(ranked, drag, n, overRef.current ? overRef.current.after : false);
        if (anchor !== undefined) now.current.app.moveBefore(drag, anchor);
      }
      setOverBoth(null); dragRef.current = null;
    },
    dragEnd: () => { setOverBoth(null); dragRef.current = null; },
  }), []);

  const tabStop = visible.includes(app.selected) ? app.selected : visible[0];
  return html`<aside className="sb">
    <${HeroFilters} filters=${app.filters} onChange=${app.setFilters}
      total=${app.ranked.length} shown=${visible.length} />

    <${Scrollable} className="sb-list" role="listbox" label="Heróis">
      ${visible.length === 0 ? html`<div className="sb-empty sub">
        Nenhum herói com esses filtros.
        <${Button} variant="ghost" onClick=${app.resetFilters}>Limpar filtros<//>
      </div>` : ''}
      ${visible.map((n) => html`<${HeroRow} key=${n} hero=${app.byName[n]} rank=${rankOf[n]}
          selected=${app.selected === n} focusable=${tabStop === n}
          favorite=${app.isFavorite(n)} equipavel=${app.isEquipavel(n)}
          sets=${app.setsByName[n]}
          dragOver=${over && over.name === n ? (over.after ? 'after' : 'before') : null}
          on=${h} />`)}
    <//>

  </aside>`;
}

module.exports = { HeroSidebar, applyFilters, anchorForPosition, anchorForDrop, simulateMove };
