/*
 * CoverageTable — as linhas da Cobertura (lib/coverage.js rows), GARGALO primeiro (a ordem vem da lib):
 *
 *   Tipo (ícones + texto) | Demanda | Oferta | Cobertura (barra tenho÷preciso + %) | Melhor | Média | % slot | Quem pede
 *
 * Melhor/Média = rank + % da melhor peça da oferta e a média delas (a maior nota de cada peça entre quem pede).
 * `dispute` ({slot: n}, bloco de UM perfil — arquétipo/herói): a última coluna vira DISPUTA (outros heróis Fav/Eq
 * que querem as mesmas peças válidas daquele slot) no lugar de "Quem pede".
 * Mesmo visual e teclado das tabelas longas (classes .bt-*, useVirtualRows): clique/setas escolhem a linha
 * (o detalhe ao lado). Números com Delta (pisca quando a conta muda). Sem linhas: o cabeçalho fica, corpo em branco.
 */
'use strict';
const { React, html } = require('../../h.js');
const { Box, Scrollable, Delta, QualityBar, RankBadge, ArchetypeSymbol, Portrait, useVirtualRows } = require('../../components/index.js');
const itemRank = require('../../../lib/itemRank.js');
const { pctTxt, rowText, RowIcons } = require('./coverageText.js');

const ROW_H = 31;
const COLS = 'minmax(180px, 1fr) 60px 56px 100px 68px 68px 52px minmax(70px, 180px)';
const TPL = { gridTemplateColumns: COLS };
const WHO_MAX = 4;
const DISPUTE_TIP = 'Outros heróis Favoritos/Equipáveis que aceitam as mesmas peças válidas';

function Who({ who, codeOf }) {
  const shown = who.slice(0, WHO_MAX);
  const names = who.map((x) => (x.p.kind === 'a' ? `${x.p.name} (${x.names.join(', ') || '—'})` : x.p.name)).join(' · ');
  return html`<span className="cv-who" title=${names}>
    ${shown.map((x) => (x.p.kind === 'a'
      ? html`<${ArchetypeSymbol} key=${x.p.id} symbol=${x.p.symbol} size=${18} />`
      : html`<${Portrait} key=${x.p.id} code=${codeOf(x.p.name)} size=${18} />`))}
    ${who.length > WHO_MAX ? html`<span className="cv-more tnum">+${who.length - WHO_MAX}</span>` : ''}
  </span>`;
}

/* rank + % (Melhor/Média) */
function Grade({ v }) {
  if (v == null) return html`<span className="it-free">—</span>`;
  return html`<${Delta} v=${v}><span className="cv-grade"><${RankBadge} rank=${itemRank.rankFor(v)} /><span className="tnum">${itemRank.pctInt(v)}%</span></span><//>`;
}

function Row({ r, picked, tabIndex, onPick, onKey, codeOf, dispute }) {
  const text = rowText(r);
  return html`<div data-key=${r.key} role="row" style=${TPL} tabIndex=${tabIndex} aria-selected=${!!picked}
    className=${'bt-row cv-row v pickable' + (picked ? ' picked' : '')} onClick=${() => onPick(r)} onKeyDown=${onKey}>
    <span className="bt-f l first cv-type" title=${text}><${RowIcons} r=${r} /><span className="ellipsis">${text}</span></span>
    <span className="bt-f tnum"><${Delta} v=${r.demand}>${r.demand}<//></span>
    <span className="bt-f tnum cv-strong"><${Delta} v=${r.supply}>${r.supply}<//></span>
    <span className="bt-f cv-cover">
      ${r.cover == null ? html`<span className="it-free">—</span>` : html`<span className="contents">
        <${QualityBar} ratio=${r.cover} />
        <${Delta} v=${r.cover}><span className="tnum">${pctTxt(r.cover)}</span><//></span>`}
    </span>
    <span className="bt-f"><${Grade} v=${r.best} /></span>
    <span className="bt-f"><${Grade} v=${r.avg} /></span>
    <span className="bt-f tnum">${pctTxt(r.slotShare)}</span>
    ${dispute
    ? html`<span className=${'bt-f tnum' + (r.slot && dispute[r.slot] ? '' : ' it-free')}>
        ${r.slot ? html`<${Delta} v=${dispute[r.slot]}>${dispute[r.slot]}<//>` : '—'}</span>`
    : html`<span className="bt-f l"><${Who} who=${r.who} codeOf=${codeOf} /></span>`}
  </div>`;
}

function CoverageTableView({ rows, pickedKey, onPick, codeOf, empty, dispute }) {
  const v = useVirtualRows({ rows, rowH: ROW_H, keyOf: (r) => r.key, onPick, pickedKey, min: 120, onMove: onPick });
  return html`<${Box} flush=${true} className="bt-box it-box cv-box">
    <${Scrollable} className="bt-scroll it-scroll" innerRef=${v.scrollRef} onScroll=${v.virtual ? v.measure : undefined}>
      <div className=${'bt cv' + (v.virtual ? ' virtual' : '')} role="table" aria-label="Cobertura" aria-rowcount=${rows.length}>
        <div className="bt-row bt-head" role="row" style=${TPL}>
          <span className="bt-h l" role="columnheader">Tipo</span>
          <span className="bt-h" role="columnheader" title="Heróis Favoritos/Equipáveis que pedem (set: peças exigidas)">Demanda</span>
          <span className="bt-h" role="columnheader" title="Peças +15 que passam na régua de quem pede">Oferta</span>
          <span className="bt-h" role="columnheader" title="Oferta ÷ demanda">Cobertura</span>
          <span className="bt-h" role="columnheader" title="A melhor peça da oferta">Melhor</span>
          <span className="bt-h" role="columnheader" title="Média das peças da oferta">Média</span>
          <span className="bt-h" role="columnheader" title="Oferta ÷ peças +15 do slot">% slot</span>
          ${dispute ? html`<span className="bt-h" role="columnheader" title=${DISPUTE_TIP}>Disputa</span>`
            : html`<span className="bt-h l" role="columnheader">Quem pede</span>`}
        </div>
        ${!rows.length ? html`<div className="cv-none" title=${empty} aria-label=${empty}></div>` : ''}
        ${v.virtual && v.from > 0 ? html`<div className="bt-pad" style=${{ height: v.from * ROW_H }} aria-hidden="true"></div>` : ''}
        ${v.slice.map((r) => html`<${Row} key=${r.key} r=${r} picked=${pickedKey === r.key} tabIndex=${r.key === v.stopKey ? 0 : -1}
          onPick=${onPick} onKey=${(e) => v.onRowKey(e, r)} codeOf=${codeOf} dispute=${dispute} />`)}
        ${v.virtual && v.to < rows.length ? html`<div className="bt-pad" style=${{ height: (rows.length - v.to) * ROW_H }} aria-hidden="true"></div>` : ''}
      </div>
    <//>
  <//>`;
}

const CoverageTable = React.memo(CoverageTableView);

module.exports = { CoverageTable, Grade };
