/*
 * UpBatch — o up em lote: até 16 peças lado a lado, em paralelo com o jogo.
 * No jogo a peça sobe +3 e um substatus ganha um roll; aqui é UM clique no valor
 * que caiu, e a peça vai para o próximo +3.
 *
 *   barra: Up em lote · N peças · [← Lista] ········ [erro] · Descartar · Salvar (n)
 *   grade de cards (4 por linha no monitor largo):
 *
 *   [peça][set] 85  +6 → +9                    [dono] [↶] [×]
 *   MAIN ATK%                                   60% (→ 65% no +15)
 *   SPD   8  ›    [2][3][4][5]
 *   CC    4% ›    [3][4][5]
 *   ATK%  7%      [4][6][8]         (faixa longa: mín · méd · máx)
 *   HP    170     [157][…][202]
 *   B 62% · Tanque, Arbiter…         (potencial do RASCUNHO + interessados; lista inteira no hover)
 *
 * No nível que traz substatus NOVO (Heroica +12, Rara +9…) as linhas existentes não
 * têm botão: a linha vazia pede o atributo e mostra a faixa dele.
 * ↶ desfaz o último up daquela peça; × tira do lote (perde os ups não gravados dela).
 * Salvar grava todas as pendentes numa só ida à fila (uma recarga da conta no fim).
 * Nos níveis do meio o main NÃO muda (o clássico só tem a tabela do +15).
 */
'use strict';
const { html, useState, useEffect, useRef } = require('../../h.js');
const { Button, IconButton, Glyph, GearIcon, SetIcon, StatIcon, Portrait, Dropdown, RankBadge, HoverCard, Delta } = require('../../components/index.js');
const { InterestCard, InterestSplit } = require('./InterestCard.js');
const { useApp } = require('../../state/app.js');
const IE = require('../../../lib/itemEdit.js');
const itemStats = require('../../../lib/itemStats.js');
const { Ups, SLOT_PT, RARITY } = require('../top/GearCard.js');
const B = require('./batchState.js');
const itemRank = require('../../../lib/itemRank.js');
const interest = require('../../../lib/interest.js');
const upCurve = require('./upCurve.js');
const mainCurve = require('../../../lib/mainCurve.js');

function statOpt(t) {
  return { value: t, label: itemStats.label(t), icon: html`<${StatIcon} stat=${itemStats.info(t).icon} size=${13} />` };
}

function Rolls({ type, range, onUp, what, effectOf }) {
  if (!range) return html`<span className="ub-none muted" title="Faixa desconhecida">—</span>`;
  return html`<span className="ub-vals" title=${`Um roll: ${itemStats.fmt(type, range.min)} a ${itemStats.fmt(type, range.max)}`}>
    ${IE.upValues(range).map((v) => { const fx = effectOf ? effectOf(v) : null; return html`<button type="button" key=${v} className=${'ip-upv ub-v tnum' + ((v === range.rare || v === range.rareLow) ? ' rare' : '') + (fx ? ' ' + fx.cls : '')}
      title=${fx ? fx.title : (v === range.rare || v === range.rareLow) ? (v === range.rare ? 'Roll raro (acima da faixa)' : 'Roll raro (abaixo da faixa)') : undefined}
      aria-label=${`${what}: ${itemStats.label(type)} +${itemStats.fmt(type, v)}${(v === range.rare || v === range.rareLow) ? ' (raro)' : ''}`}
      onClick=${() => onUp(v)}>${itemStats.fmt(type, v)}</button>`; })}
  </span>`;
}

/*
 * Cor de cada botão de roll = o efeito daquele valor no potencial, para o MELHOR interessado (ou para a peça, sem
 * interessado): verde sobe, vermelho derruba; hover diz o rank que fica. Notas dos rascunhos vêm do backend.
 */
function useRollEffects(draft, profiles, on) {
  const app = useApp();
  const best = on ? interest.interested(draft, profiles)[0] || null : null;
  const pid = best ? best.p.id : undefined;
  const cands = [];
  if (on && IE.nextUpLevel(draft) != null && !IE.upAddsSub(draft)) {
    (draft.substats || []).forEach((s, i) => {
      const r = s && s.type ? IE.upRange(draft, s.type) : null;
      if (r) IE.upValues(r).forEach((v) => { try { cands.push({ i, v, d: { ...IE.applyUp(draft, i, v), id: null } }); } catch (e) { /* */ } });   // sem id: hipótese não vira a "última nota" da peça (itemRatings.lastById)
    });
  }
  const key = on ? JSON.stringify([draft.id, draft.enhance, draft.substats]) : '';
  useEffect(() => { if (cands.length) app.rateDrafts(cands.map((c) => c.d)); }, [key]);
  return (i) => (v) => {
    const c = cands.find((x) => x.i === i && x.v === v);
    const base = itemRank.potentialOf(draft, pid);
    const after = c ? itemRank.potentialOf(c.d, pid) : null;
    if (base == null || after == null) return null;
    const who = best ? best.p.name : 'Peça';
    return { cls: after > base + 0.05 ? 'gain' : after < base - 0.05 ? 'loss' : 'flat',
      title: `${who}: ${itemRank.rankFor(after)} ${itemRank.pctInt(after)}% (hoje ${itemRank.rankFor(base)} ${itemRank.pctInt(base)}%)` };
  };
}

function UpCard({ stored, entry, ownerCode, err, onUp, onUndo, onRemove, profiles, codeOf, detail }) {
  const draft = entry ? entry.draft : stored;
  const [newType, setNewType] = useState(null);
  const next = IE.nextUpLevel(draft);
  const addsSub = next != null && IE.upAddsSub(draft);
  const ups = itemStats.upgradeCounts(draft);
  const subs = (draft.substats || []).filter((s) => s && s.type);
  const newRow = addsSub ? subs.length : -1;
  const curve = mainCurve.get(draft);
  const m15 = next === 15 ? (curve ? curve[15] : IE.mainAt15(draft)) : null;
  const done = next == null;
  const n = entry ? entry.hist.length : 0;
  const what = `${SLOT_PT[draft.gear] || draft.gear} ${String(draft.set || '').replace(/Set$/, '')}`;
  const main = draft.main || {};
  const fxOf = useRollEffects(draft, profiles, !!detail);

  const up = (i, v, t) => { onUp(i, v, t); setNewType(null); };

  return html`<section className=${'ub-card' + (done ? ' done' : '') + (n ? ' dirty' : '') + (err ? ' err' : '')}
    style=${{ borderColor: `var(--${RARITY[draft.rank] || 'normal'})` }} aria-label=${what}>
    <header className="ub-head">
      <${GearIcon} slot=${draft.gear} size=${22} />
      <${SetIcon} set=${draft.set} size=${16} />
      <span className="ub-lvl tnum" style=${{ color: `var(--${RARITY[draft.rank] || 'normal'})` }} title="Nível">${draft.level}</span>
      <span className="ub-enh tnum" title=${n ? `${n} up(s) não gravado(s)` : undefined}>
        +${draft.enhance}${done ? '' : html`<span className="ub-next"> → +${next}</span>`}
      </span>
      <span className="spacer"></span>
      ${draft.equippedByName ? html`<${Portrait} code=${ownerCode} size=${22} title=${draft.equippedByName} />` : ''}
      <${IconButton} label="Desfazer o último up desta peça" disabled=${!n} onClick=${onUndo}><${Glyph} name="arrow-left" size=${13} /><//>
      <${IconButton} label=${n ? 'Tirar do lote (perde os ups não gravados desta peça)' : 'Tirar do lote'} onClick=${onRemove}><${Glyph} name="close" size=${13} /><//>
    </header>

    <div className="ub-main">
      <${StatIcon} stat=${itemStats.info(main.type).icon} size=${14} />
      <span className="ub-mn">${itemStats.label(main.type)}</span>
      <span className="spacer"></span>
      <b className="tnum">${itemStats.fmt(main.type, main.value)}</b>
      ${m15 != null ? html`<span className="ub-m15 tnum" title="Main no +15"> → ${itemStats.fmt(main.type, m15)}</span>` : ''}
    </div>

    <div className="ub-rows">
      ${Array.from({ length: IE.MAX_SUBS }, (_, i) => {
        const s = subs[i];
        if (s) {
          return html`<div key=${i} className="ub-row">
            <span className="ub-sn"><${StatIcon} stat=${itemStats.info(s.type).icon} size=${12} />${itemStats.label(s.type)}</span>
            <span className="ub-sv tnum">${itemStats.fmt(s.type, s.value)}</span>
            <${Ups} n=${ups[i]} />
            ${done || addsSub ? html`<span></span>`
              : html`<${Rolls} type=${s.type} range=${IE.upRange(draft, s.type)} what=${what} onUp=${(v) => up(i, v)} effectOf=${detail ? fxOf(i) : null} />`}
          </div>`;
        }
        if (i === newRow) {
          return html`<div key=${i} className="ub-row new">
            <span className="ub-sn"><${Dropdown} placeholder="novo" label=${`${what}: substatus novo no +${next}`}
              options=${IE.freeSubTypes(draft, i).map(statOpt)} value=${newType} onChange=${setNewType} /></span>
            <span></span><span></span>
            ${newType ? html`<${Rolls} type=${newType} range=${IE.upRange(draft, newType)} what=${what} onUp=${(v) => up(i, v, newType)} />` : html`<span></span>`}
          </div>`;
        }
        return html`<div key=${i} className="ub-row"><span className="muted">—</span></div>`;
      })}
    </div>

    ${err ? html`<footer className="ub-foot"><span className="ub-err" role="alert" title=${err}>${err}</span></footer>` : ''}
  </section>`;
}

/*
 * minicurva do potencial por nível (+0…+15): pontos = os níveis que a peça já passou.
 * Altura na escala dos PRÓPRIOS pontos (faixa mínima SPAN pontos, centrada) — a variação aparece; uma peça que oscila
 * muito ganha faixa maior sozinha. Linha de referência = A (82), só quando cai dentro da faixa.
 */
const SPAN = 8;
function Spark({ pts, w, h }) {
  const W = w || 96; const H = h || 22;
  const ok = pts.filter((p) => p.pot != null);
  if (ok.length < 2) return html`<span className="ub-spark empty" style=${{ width: W + 'px' }}></span>`;
  let lo = Math.min(...ok.map((p) => p.pot)); let hi = Math.max(...ok.map((p) => p.pot));
  if (hi - lo < SPAN) { const m = (hi + lo) / 2; lo = m - SPAN / 2; hi = m + SPAN / 2; }
  const x = (e) => 2 + (e / 15) * (W - 4);
  const y = (v) => H - 2 - ((v - lo) / (hi - lo || 1)) * (H - 4);
  const d = ok.map((p) => `${x(p.enhance).toFixed(1)},${y(p.pot).toFixed(1)}`).join(' ');
  const last = ok[ok.length - 1];
  return html`<svg className="ub-spark" width=${W} height=${H} viewBox=${`0 0 ${W} ${H}`} aria-hidden="true">
    ${82 >= lo && 82 <= hi ? html`<line x1="2" x2=${W - 2} y1=${y(82)} y2=${y(82)} className="ub-spark-ref" />` : ''}
    <polyline points=${d} fill="none" className="ub-spark-line" />
    <circle cx=${x(last.enhance)} cy=${y(last.pot)} r="2.4" className="ub-spark-dot" />
  </svg>`;
}

/* nota da peça (ou de um perfil) em cada nível já passado */
function curveOf(stored, entry, pid) {
  return upCurve.steps(stored, entry).map((s) => ({ enhance: s.enhance, item: s.item, pot: itemRank.potentialOf(s.item, pid) }));
}

const trend = (pts) => {
  const ok = pts.filter((p) => p.pot != null);
  if (ok.length < 2) return null;
  const d = ok[ok.length - 1].pot - ok[ok.length - 2].pot;
  return Math.abs(d) < 0.5 ? null : d;
};

/*
 * Escala das vagas: o conteúdo acompanha o tamanho da vaga (monitor largo = vaga grande = tudo maior).
 * Mede a ÁREA (largura da grade, altura do corpo — nenhuma das duas depende do conteúdo, sem laço).
 * k = 1 na vaga de 210 × 115 (ou menor; o conteúdo ocupa ~80% dela); teto 2.
 */
function useTileScale() {
  const grid = useRef(null);
  const [dim, setDim] = useState({ k: 1, w: 210 });
  useEffect(() => {
    const g = grid.current;
    if (!g || typeof ResizeObserver === 'undefined') return undefined;
    const GAP = 8;
    const measure = () => {
      const w = (g.clientWidth - 3 * GAP) / 4;
      const h = ((g.parentElement || g).clientHeight - 3 * GAP) / 4;
      const k = Math.max(1, Math.min(2, w / 210, h / 115));
      setDim((d) => (Math.abs(d.k - k) < 0.02 && Math.abs(d.w - w) < 2 ? d : { k, w }));
    };
    const ro = new ResizeObserver(measure);
    ro.observe(g); if (g.parentElement) ro.observe(g.parentElement);
    measure();
    return () => ro.disconnect();
  }, []);
  return [grid, dim];
}

/* valor com que cada substatus NASCEU (+0, ou o nível em que entrou) — base do "(+X)" da vaga, como no jogo */
function initialOf(steps) {
  const first = {};
  steps.forEach((st) => (st.item.substats || []).forEach((x) => { if (x && x.type && first[x.type] == null) first[x.type] = Number(x.value) || 0; }));
  return first;
}

/* linha que mudou de um rascunho para o outro (substatus novo ou valor diferente); -1 = nenhuma */
function changedLine(prev, cur) {
  const p = (prev || []).filter((x) => x && x.type);
  return (cur || []).filter((x) => x && x.type).findIndex((x) => {
    const o = p.find((y) => y.type === x.type);
    return !o || Number(o.value) !== Number(x.value);
  });
}

/*
 * Uma vaga da grade 4×4 (as MESMAS vagas da tela de lote do jogo). Layout aprovado pelo Eduardo (2026-10-02, "A + rank do C"):
 *
 *   [ícone 85 +3]   ♥ 19%                  [ sugestão ]
 *        B         ✶ 13% ›  (+7%)           ╱‾ curva
 *       78%        » 4  ·                   74% → B 78% ▲
 *      [35]        ◐ 5% ·                               (1)
 *
 * Esquerda com largura FIXA (o "100%" não empurra os substatus). A linha que acabou de subir acende (--up-flash) e apaga.
 * Tudo em --ub-k (useTileScale); os tamanhos-base são os do esboço ÷ 1,75 (vaga de 1920×1080 ≈ k 1,75), com piso.
 */
function Tile({ idx, stored, entry, selected, profiles, codeOf, dim, onSelect, onMove }) {
  const [over, setOver] = useState(false);
  const [flash, setFlash] = useState(null);
  const prev = useRef(null);
  const draft = stored ? (entry ? entry.draft : stored) : null;
  useEffect(() => {
    const was = prev.current;
    prev.current = draft ? { id: draft.id, enh: Number(draft.enhance) || 0, subs: draft.substats } : null;
    if (!draft || !was || was.id !== draft.id || (Number(draft.enhance) || 0) <= was.enh) return;
    const i = changedLine(was.subs, draft.substats);
    if (i >= 0) setFlash({ i, n: Date.now() });
  }, [draft && draft.id, draft && draft.enhance, draft && JSON.stringify(draft.substats)]);
  const drop = {
    onDragOver: (e) => { e.preventDefault(); setOver(true); },
    onDragLeave: () => setOver(false),
    onDrop: (e) => { e.preventDefault(); setOver(false); const from = Number(e.dataTransfer.getData('text/plain')); if (!isNaN(from)) onMove(from, idx); },
  };
  if (!stored) {
    return html`<div className=${'ub-slot empty' + (over ? ' over' : '')} ...${drop} aria-label=${`Vaga ${idx + 1} vazia`}><span className="tnum">${idx + 1}</span></div>`;
  }
  const steps = upCurve.steps(stored, entry);
  const pts = steps.map((st) => ({ enhance: st.enhance, item: st.item, pot: itemRank.potentialOf(st.item) }));
  const pot = itemRank.potentialOf(draft);
  const ok = pts.filter((p) => p.pot != null);
  const before = ok.length > 1 ? ok[ok.length - 2].pot : null;
  const score = itemRank.scoreOf(draft);
  // ganho "(+X)": desde o +0 pelo op do jogo; peça editada à mão (op não bate) = só os ups dados no lote
  const first = initialOf(upCurve.opMatches(stored) ? steps : [{ item: stored }]);
  const nWho = interest.interested(draft, profiles).length;
  const pend = entry && entry.hist.length;
  const k = dim.k;
  const px = (n, min) => Math.max(min || 0, Math.round(n * k));
  const ups = itemStats.upgradeCounts(draft);
  const subs = (draft.substats || []).filter((x) => x && x.type);
  const main = draft.main || {};
  const rar = `var(--${RARITY[draft.rank] || 'normal'})`;
  const sideW = px(62, 60);
  return html`<button type="button" className=${'ub-slot' + (selected ? ' on' : '') + (over ? ' over' : '') + (pend ? ' dirty' : '')}
    draggable="true" onDragStart=${(e) => { e.dataTransfer.setData('text/plain', String(idx)); e.dataTransfer.effectAllowed = 'move'; }}
    ...${drop} onClick=${onSelect} aria-pressed=${!!selected}
    onKeyDown=${(e) => {
      // teclado no lugar do arrastar: Alt + setas leva a peça para a vaga vizinha (grade 4×4)
      const d = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -4, ArrowDown: 4 }[e.key];
      if (!e.altKey || d == null) return;
      const to = idx + d;
      if (to < 0 || to > 15 || (Math.abs(d) === 1 && Math.floor(to / 4) !== Math.floor(idx / 4))) return;
      e.preventDefault(); onMove(idx, to);
    }}
    aria-label=${`Vaga ${idx + 1}: ${SLOT_PT[draft.gear] || draft.gear} +${draft.enhance}${pot != null ? `, ${itemRank.rankFor(pot)} ${itemRank.pctInt(pot)}%` : ''}, ${nWho} interessados`}
    style=${{ borderColor: selected ? undefined : rar, gridTemplateColumns: `${px(44, 52)}px minmax(0, 1fr) ${sideW}px` }}>
    <span className="ub-s-l">
      <span className="ub-s-ico" style=${{ borderColor: rar, width: px(33, 36) + 'px', height: px(33, 36) + 'px' }}>
        <${GearIcon} slot=${draft.gear} size=${px(17, 18)} />
        <span className="ub-s-lvl tnum" style=${{ color: rar }}>${draft.level}</span>
        <span className="ub-s-plus tnum">+${draft.enhance}</span>
        <span className="ub-s-set"><${SetIcon} set=${draft.set} size=${px(8, 11)} /></span>
      </span>
      ${pot != null
        ? html`<span className="contents"><${Delta} v=${pot}><${RankBadge} rank=${itemRank.rankFor(pot)} className="ub-s-rk" /><//>
            <${Delta} v=${pot}><b className="ub-s-pct tnum">${itemRank.pctInt(pot)}%</b><//></span>`
        : html`<span className="ub-s-rk muted">—</span>`}
      <span className="ub-s-score tnum" title="Pontos de Equipamento">${score == null ? '—' : html`<${Delta} v=${score}>${score}<//>`}</span>
    </span>
    <span className="ub-s-m">
      <span className="ub-s-ln main" title=${itemStats.label(main.type)}>
        <${StatIcon} stat=${itemStats.info(main.type).icon} size=${px(9, 12)} /><b className="tnum">${itemStats.fmt(main.type, main.value)}</b>
      </span>
      ${Array.from({ length: IE.MAX_SUBS }, (_, i) => {
        const x = subs[i];
        if (!x) return html`<span key=${'e' + i} className="ub-s-ln"><span></span><span className="muted">—</span></span>`;
        const g = Math.round(((Number(x.value) || 0) - (first[x.type] != null ? first[x.type] : Number(x.value) || 0)) * 10) / 10;
        const lit = flash && flash.i === i;
        return html`<span key=${lit ? 'f' + flash.n : 'l' + i} className=${'ub-s-ln' + (lit ? ' lit' : '')}>
          <${StatIcon} stat=${itemStats.info(x.type).icon} size=${px(8, 11)} />
          <b className="tnum">${itemStats.fmt(x.type, x.value)}</b>
          <${Ups} n=${ups[i]} />
          ${g > 0 ? html`<span className="ub-s-gain tnum">(+${itemStats.fmt(x.type, g)})</span>` : html`<span></span>`}
        </span>`;
      })}
    </span>
    <span className="ub-s-r">
      <span className="ub-s-sug" title="Sugestão">—</span>
      <${Spark} pts=${pts} w=${sideW} h=${px(33, 26)} />
      <span className="ub-s-delta tnum">
        ${before == null || pot == null ? '' : Math.abs(pot - before) < 0.5 ? html`<span className="muted">=</span>`
          : html`<span className="contents"><span className="muted">${itemRank.rankFor(before) !== itemRank.rankFor(pot) ? itemRank.rankFor(before) + ' ' : ''}${itemRank.pctInt(before)}%</span>
              <${Glyph} name="arrow-right" size=${px(6, 10)} />
              <${RankBadge} rank=${itemRank.rankFor(pot)} /><span>${itemRank.pctInt(pot)}%</span>
              <span className=${'ub-trend ' + (pot > before ? 'up' : 'down')}>${pot > before ? '▲' : '▼'}</span></span>`}
      </span>
    </span>
    <span className="ub-s-who">
      <${HoverCard} content=${() => html`<${InterestCard} item=${draft} profiles=${profiles} codeOf=${codeOf} />`}>
        <${Delta} v=${nWho}><span className=${'it-nok ub-s-nok tnum' + (nWho ? '' : ' zero')} aria-hidden="true">${nWho}</span><//>
      <//>
    </span>
  </button>`;
}

/* painel da peça selecionada: rolls (com o efeito de cada valor), potencial por nível e cada interessado */
function Detail({ stored, entry, err, profiles, codeOf, ownerCode, onUp, onUndo, onRemove }) {
  const draft = entry ? entry.draft : stored;
  const pts = curveOf(stored, entry);
  const trendOf = (x) => trend(curveOf(stored, entry, x.p.id));
  return html`<aside className="ub-detail" aria-label="Peça selecionada">
    <${UpCard} stored=${stored} entry=${entry} ownerCode=${ownerCode} err=${err} profiles=${profiles} codeOf=${codeOf}
      onUp=${onUp} onUndo=${onUndo} onRemove=${onRemove} detail=${true} />
    <section className="ub-box">
      <h3 className="ub-h">Potencial por nível</h3>
      <${Spark} pts=${pts} w=${340} h=${40} />
      <div className="ub-levels" style=${{ gridTemplateColumns: `repeat(${pts.length}, minmax(0, 1fr))` }}>
        ${pts.map((p, i) => html`<span key=${i} className="ub-lv">
          <span className="muted tnum">+${p.enhance}</span>
          ${p.pot != null ? html`<span className="ub-lv-r"><${RankBadge} rank=${itemRank.rankFor(p.pot)} /><span className="tnum">${itemRank.pctInt(p.pot)}%</span></span>` : html`<span className="muted">—</span>`}
        </span>`)}
      </div>

    </section>
    <section className="ub-box">
      <h3 className="ub-h">Para quem serve</h3>
      <div className="ic"><${InterestSplit} item=${draft} profiles=${profiles} codeOf=${codeOf} trendOf=${trendOf} /></div>
    </section>
  </aside>`;
}

function UpBatch({ onBack }) {
  const app = useApp();
  const st = app.gearBatch;
  const set = app.setGearBatch;
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState(null);
  const slots = B.slotsOf(st);
  const [sel, setSel] = useState(() => slots.findIndex(Boolean));
  const pend = B.pending(st);
  const [gridRef, dim] = useTileScale();
  const codeOf = (name) => (name && app.byName[name] ? app.byName[name].code : null);
  const stored = (id) => (id ? app.itemById(id) : null);
  // notas de tudo que a tela mostra: rascunhos e cada nível da curva (peça e perfis vêm juntos do backend)
  useEffect(() => {
    const list = [];
    slots.forEach((id) => { const it = stored(id); if (it) upCurve.steps(it, st.drafts[id]).forEach((s) => list.push(s.item)); });
    app.rateDrafts(list);
  }, [st, app.account]);
  // peça nova que a escuta pôs no lote e nada selecionado: seleciona a primeira
  useEffect(() => { if (!slots[sel]) { const f = slots.findIndex(Boolean); if (f >= 0) setSel(f); } }, [st]);
  const selItem = stored(slots[sel]);

  function act(fn, id) {
    try { set(fn); setSaved(false); setErr(null); setErrors((e) => { const c = { ...e }; delete c[id]; return c; }); }
    catch (e) { setErrors((x) => ({ ...x, [id]: e.message })); }
  }
  const onUp = (it, i, v, t) => {
    try { const next = B.up(app.gearBatch, it, i, v, t); act(() => next, it.id); }
    catch (e) { setErrors((x) => ({ ...x, [it.id]: e.message })); }
  };

  async function save() {
    setBusy(true); setErr(null);
    try {
      const snap = st;
      const r = await app.runItemJob((api) => B.saveAll(api, snap, app.account.itemsById, app.heroesById));
      set((s) => B.clearSaved(s, r.ok));
      setErrors(r.errors);
      setSaved(!Object.keys(r.errors).length);
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  }

  const count = slots.filter((id) => stored(id)).length;
  return html`<div className="ub">
    <div className="ub-bar">
      <${Button} onClick=${onBack} title=${pend.length ? 'Os ups não gravados continuam aqui' : undefined}>
        <${Glyph} name="arrow-left" size=${12} /> Lista
      <//>
      <b className="ub-title">Up em lote</b>
      <span className="sub tnum">${count} de ${B.MAX}</span>

      <span className="spacer"></span>
      <span className="ub-err" role="alert">${err || ''}</span>
      <${Button} disabled=${busy || !pend.length} onClick=${() => { set((s) => ({ ...s, drafts: {} })); setErrors({}); }}
        title="Joga fora os ups não gravados">Descartar<//>
      <${Button} variant="accent" disabled=${busy || !pend.length} onClick=${save}>
        ${busy ? 'Gravando…' : pend.length ? `Salvar (${pend.length})` : saved ? 'Salvo' : 'Salvar'}
      <//>
    </div>
    <div className="ub-body">
      <div className="ub-grid4" ref=${gridRef} role="group" aria-label="Vagas do lote" style=${{ '--ub-k': dim.k }}>
        ${slots.map((id, i) => {
          const it = stored(id);
          return html`<${Tile} key=${i} idx=${i} stored=${it} entry=${id ? st.drafts[id] : null} selected=${i === sel && !!it}
            profiles=${app.ratingProfiles} codeOf=${codeOf} dim=${dim}
            onSelect=${() => setSel(i)}
            onMove=${(from, to) => { set((s) => B.move(s, from, to)); if (from === sel) setSel(to); else if (to === sel) setSel(from); }} />`;
        })}
      </div>
      ${selItem ? html`<${Detail} key=${selItem.id} stored=${selItem} entry=${st.drafts[selItem.id]} err=${errors[selItem.id]}
          profiles=${app.ratingProfiles} codeOf=${codeOf} ownerCode=${codeOf(selItem.equippedByName)}
          onUp=${(i, v, t) => onUp(selItem, i, v, t)}
          onUndo=${() => act((s) => B.undo(s, selItem.id), selItem.id)}
          onRemove=${() => act((s) => B.toggle(s, selItem), selItem.id)} />`
        : html`<aside className="ub-detail empty" title=${count ? 'Nenhuma vaga escolhida' : 'Lote vazio'}></aside>`}
    </div>
  </div>`;
}

module.exports = { UpBatch, UpCard };
