/*
 * HeroRow — uma linha da barra lateral. A lista É o rank, então a linha tem:
 *   [arrastar] [posição editável] [retrato] [nome / elemento·classe·estrelas] [flags / sets]
 *
 * Canto superior direito: flags do usuário (★ favorito, ⚙ equipável) no accent.
 * Canto inferior direito: sets equipados, do que tem MAIS peças para o que tem
 * menos (o de 4 à esquerda do de 2) — é por eles que se vê quem está equipado.
 * Não há "bolinha de status": os sets já dizem isso.
 */
'use strict';
const { React, html, useState, useRef, useEffect } = require('../../h.js');
const { Glyph, Portrait, ElementIcon, ClassIcon, Stars, SetIcon } = require('../../components/index.js');

function RankCell({ rank, focusable, onCommit }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const input = useRef(null);
  useEffect(() => { if (editing && input.current) input.current.select(); }, [editing]);

  if (!editing) {
    return html`<button type="button" className="hr-rank tnum" title="Digitar a posição"
      aria-label=${`Posição ${rank} no rank — editar`} tabIndex=${focusable ? 0 : -1}
      onClick=${(e) => { e.stopPropagation(); setDraft(String(rank)); setEditing(true); }}>${rank}</button>`;
  }
  const done = (commit) => {
    setEditing(false);
    const n = parseInt(draft, 10);
    if (commit && isFinite(n) && n !== rank) onCommit(n);
  };
  return html`<input ref=${input} className="hr-rank-input tnum" aria-label="Posição no rank" value=${draft}
    onClick=${(e) => e.stopPropagation()}
    onChange=${(e) => setDraft(e.target.value.replace(/[^0-9]/g, ''))}
    onBlur=${() => done(true)}
    onKeyDown=${(e) => { if (e.key === 'Enter') done(true); if (e.key === 'Escape') done(false); }} />`;
}

function HeroRowView({ hero, rank, selected, focusable, favorite, equipavel, sets, dragOver, on }) {
  // dragOver: 'before' | 'after' | null — mostra a linha de encaixe do lado certo
  // `on`: handlers estáveis da barra lateral, chamados com o nome do herói
  const n = hero.name;
  const cls = ['hr', selected ? 'sel' : '', dragOver ? `drop-${dragOver}` : ''].filter(Boolean).join(' ');
  // teclado: só a linha em si (não o campo de posição que mora dentro dela)
  const onKeyDown = (e) => {
    if (e.target !== e.currentTarget) return;
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); on.select(n); return; }
    on.navigate(e, n);
  };
  return html`<div className=${cls} draggable=${true} role="option" aria-selected=${!!selected}
    aria-label=${`${rank}. ${n}${favorite ? ', favorito' : ''}`}
    tabIndex=${focusable ? 0 : -1} onKeyDown=${onKeyDown}
    onClick=${() => on.select(n)} onContextMenu=${(e) => on.context(e, n)}
    onDragStart=${(e) => on.dragStart(e, n)} onDragOver=${(e) => on.dragOver(e, n)}
    onDragLeave=${(e) => on.dragLeave(e, n)} onDrop=${(e) => on.drop(e, n)} onDragEnd=${on.dragEnd}>

    <span className="hr-handle" title="Arraste para reordenar">
      <${Glyph} name="drag" size=${13} />
    </span>
    <${RankCell} rank=${rank} focusable=${focusable} onCommit=${(pos) => on.rank(n, pos)} />
    <${Portrait} code=${hero.code} size=${36} />

    <span className="hr-info">
      <span className="hr-name ellipsis" title=${hero.name}>${hero.name}</span>
      <span className="hr-meta">
        <${ElementIcon} element=${hero.attribute} size=${14} />
        <${ClassIcon} role=${hero.role} size=${14} />
        <${Stars} count=${hero.rarity} size=${8} />
      </span>
    </span>

    <span className="hr-right">
      <span className="hr-flags">
        ${favorite ? html`<span title="Favorito"><${Glyph} name="star" size=${13} /></span>` : ''}
        ${equipavel ? html`<span title="Equipável"><${Glyph} name="gear" size=${13} /></span>` : ''}
      </span>
      <span className="hr-sets">
        ${(sets || []).map((s, i) => html`<span key=${i} className="hr-set" title=${`${s.set.replace(/Set$/, '')} · ${s.count} peças`}>
          <${SetIcon} set=${s.set} size=${15} /><b className="tnum">${s.count}</b>
        </span>`)}
      </span>
    </span>
  </div>`;
}

/* memo: a lista tem centenas de linhas; só redesenha a linha cujas props mudaram */
const HeroRow = React.memo(HeroRowView);

module.exports = { HeroRow };
