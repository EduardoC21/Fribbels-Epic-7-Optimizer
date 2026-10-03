/*
 * GearScreen — tela Equipamentos: o inventário inteiro da conta.
 *
 *   filtros (em cima, quebram linha na janela estreita)
 *   lista (ItemTable) | painel da peça selecionada (ItemDetail)
 *
 * 1 clique (ou setas) SELECIONA a peça. Quatro jeitos, pela janela (features.css .eq-main):
 *   LARGA (≥ 1860px, WIDE_MQ): o EDITOR da peça fica embutido no painel (ItemPopout inline, altura
 *     fixa) e, embaixo, Heróis | Arquétipos lado a lado até o fim da tela. As notas seguem o
 *     rascunho (editar e ver na hora). Trocar de peça com alteração pendente: o 1º clique pisca o
 *     Salvar e segura; um 2º clique em até 2 s descarta e troca.
 *   MÉDIA: a lista cresce; painel estreito com card · Heróis · Arquétipos empilhados. Duplo
 *     clique, Enter ou "Editar" abrem o popout.
 *   ESTREITA (< 1280): as três caixas embaixo da lista. ESTREITA E BAIXA: só a lista.
 * Os filtros ficam no estado do app (trocar de tela e voltar não perde). A vista em Cards saiu
 * (Eduardo, 2026-09-30: estética, não função).
 *
 * Filtro "Para" (`gearFilters.target`): só as peças que servem ao arquétipo/herói escolhido e
 * passam do corte dele; Rank e Pot. da lista passam a ser os dele.
 *
 * UP EM LOTE: botão "Up em lote" na barra de filtros (com a quantidade no lote) leva à grade de up
 * (UpBatch); as peças entram pela escuta do jogo. A coluna ☐ "Lote" e a faixa azul saíram (Eduardo,
 * 2026-10-01: não usava e engrossava a área de filtros). O lote fica no estado do app.
 */
'use strict';
const { html, useState, useMemo, useCallback, useEffect, useRef } = require('../../h.js');
const { useApp } = require('../../state/app.js');
const { ItemPopout } = require('../item/ItemPopout.js');
const { ItemTable } = require('./ItemTable.js');
const { GearFilters } = require('./GearFilters.js');
const { EmptyState } = require('../../components/index.js');
const { noAccount, inventoryIcon } = require('../shell/emptyStates.js');
const { ItemDetail } = require('./ItemDetail.js');
const G = require('./gearList.js');
const B = require('./batchState.js');
const { UpBatch } = require('./UpBatch.js');
const interest = require('../../../lib/interest.js');
const itemRank = require('../../../lib/itemRank.js');

const WIDE_MQ = '(min-width: 1860px)';   // mesmo corte do features.css (editor embutido cabe: 760px)
function useWide(initial) {
  const mq = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(WIDE_MQ) : null;
  const [wide, setWide] = useState(initial != null ? initial : !!(mq && mq.matches));
  useEffect(() => {
    if (!mq || initial != null) return undefined;
    const h = () => setWide(mq.matches);
    mq.addListener(h);                    // Electron 16: addEventListener no MediaQueryList também serve; addListener é o seguro
    return () => mq.removeListener(h);
  }, []);
  return wide;
}
const GUARD_MS = 2000;

/* `initialMode`/`initialSel`/`initialWide` só para teste/sonda (mesmo papel dos initial* do AppProvider) */
function GearScreen({ initialMode, initialSel, initialWide }) {
  const app = useApp();
  const [open, setOpen] = useState(null);   // id da peça no popout
  const [sel, setSel] = useState(initialSel || null);     // id da peça selecionada (painel)
  const [mode, setMode] = useState(initialMode || 'list');   // 'list' | 'batch'
  const all = useMemo(() => Object.values(app.account.itemsById || {}), [app.account.itemsById]);
  const opts = useMemo(() => G.options(all, app.heroesById), [all, app.heroesById]);
  const targets = useMemo(() => interest.targets(app.ratingProfiles), [app.ratingProfiles]);
  const f = app.gearFilters;
  // alvo que sumiu (arquétipo apagado, herói sem barras) não filtra nada
  const tProfile = useMemo(() => interest.profileFor(app.ratingProfiles, f.target), [app.ratingProfiles, f.target]);
  const items = useMemo(() => {
    const base = G.applyFilters(all, f);
    if (!tProfile) return base;
    return base.filter((it) => {
      if (!interest.fits(it, tProfile)) return false;
      const pct = itemRank.potentialOf(it, tProfile.id);
      return pct != null && pct >= tProfile.min;
    });
  }, [all, f, tProfile, app.ratingsVer]);
  const codeOf = useCallback((name) => (name && app.byName[name] ? app.byName[name].code : null), [app.byName]);
  const wide = useWide(initialWide);
  const [live, setLive] = useState(null);             // rascunho do editor embutido (notas ao vivo)
  const guard = useRef(null);                         // { dirty, nudge } do editor embutido
  const lastGuard = useRef(0);
  // ponytail: estreitar a janela com edição pendente no embutido perde o rascunho (troca para o popout)
  const pick = useCallback((it) => {
    const g = guard.current;
    if (wide && g && g.dirty && it.id !== sel) {
      if (Date.now() - lastGuard.current > GUARD_MS) { lastGuard.current = Date.now(); g.nudge(); return; }
    }
    lastGuard.current = 0;
    setSel(it.id);
  }, [wide, sel]);
  const edit = useCallback((it) => { pick(it); if (!wide) setOpen(it.id); }, [pick, wide]);
  const batch = app.gearBatch;
  const pend = B.pending(batch).length;
  const selItem = sel ? app.itemById(sel) : null;
  // notas das caixas: as do rascunho assim que o backend responde; até lá, as do gravado
  const notesItem = selItem && live && live.id === selItem.id && itemRank.potentialOf(live) != null ? live : selItem;

  const none = noAccount(app.account);
  if (none) return html`<div className="eq">${none}</div>`;
  if (!all.length) {
    return html`<div className="eq"><${EmptyState} icon=${inventoryIcon()} title="Inventário vazio"
      tip="Sincronize a conta com o jogo (Ouvir o jogo)" /></div>`;
  }

  if (mode === 'batch') return html`<div className="eq"><${UpBatch} onBack=${() => setMode('list')} /></div>`;

  return html`<div className="eq">
    <${GearFilters} filters=${f} onChange=${app.setGearFilters} opts=${opts}
      total=${all.length} shown=${items.length}
      interest=${{ limit: app.interestLimit, onLimit: app.setInterestLimit,
        gemMode: app.gemMode, onGemMode: app.setGemMode, targets, codeOf }}
      batch=${{ count: batch.ids.length, pending: pend, onOpen: () => setMode('batch') }} />
    <div className="eq-main">
      <div className="eq-list">
        <${ItemTable} items=${items} onPick=${pick} onOpen=${edit} pickedId=${sel} codeOf=${codeOf}
          profiles=${app.ratingProfiles} profileId=${tProfile ? tProfile.id : null} ver=${app.ratingsVer}
          empty="Nenhuma peça com esses filtros" />
      </div>
      ${wide
        ? html`<div className="eqw">
            ${selItem
              ? html`<${ItemPopout} key=${'ed:' + selItem.id} inline=${true} itemId=${selItem.id} guard=${guard} onDraft=${setLive}
                  onClose=${() => setSel(null)} />`
              : html`<div className="eqw-empty"></div>`}
            <${ItemDetail} key=${'det:' + (notesItem ? notesItem.id : '-')} wide=${true} item=${notesItem} profiles=${app.ratingProfiles} target=${tProfile ? f.target : null} codeOf=${codeOf}
              onHero=${app.openHeroOptimizer} onArch=${app.openArchetype} />
          </div>`
        : html`<${ItemDetail} key=${'det:' + (selItem ? selItem.id : '-')} item=${selItem} profiles=${app.ratingProfiles} target=${tProfile ? f.target : null} codeOf=${codeOf}
            onEdit=${() => selItem && setOpen(selItem.id)} onHero=${app.openHeroOptimizer} onArch=${app.openArchetype} />`}
    </div>
    ${open && !wide ? html`<${ItemPopout} key=${'pop:' + open} itemId=${open} onClose=${() => setOpen(null)} />` : ''}
  </div>`;
}

module.exports = { GearScreen };
