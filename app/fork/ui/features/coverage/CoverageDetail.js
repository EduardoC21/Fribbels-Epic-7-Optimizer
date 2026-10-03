/*
 * CoverageDetail — o detalhe de UMA linha da Cobertura:
 *
 *   TIPO  ícones · texto
 *         Demanda   Oferta   Cobertura          (grade 3 × 2, rótulo em cima, valor embaixo: tudo alinhado)
 *         Melhor    Média    % slot
 *   FUNIL Peças +15 → <set da linha | Set aceito> → Principal aceito → Passa na régua (a maior queda em vermelho)
 *   QUEM PEDE / PERTO DA RÉGUA   só na tela central (`full`); no bloco de um perfil seria sempre ele mesmo
 *
 * Só leitura do contexto (lib/coverage.js). `onHero(nome)`, `onArch(id)`, `onItem(id)` abrem. Sem linha: as caixas
 * ficam com o cabeçalho, em branco (a tela não pula).
 */
'use strict';
const { html } = require('../../h.js');
const { Box, Delta, QualityBar, RankBadge, ArchetypeSymbol, Portrait, GearIcon, SetIcon, StatIcon } = require('../../components/index.js');
const C = require('../../../lib/coverage.js');
const itemRank = require('../../../lib/itemRank.js');
const itemStats = require('../../../lib/itemStats.js');
const itemRatings = require('../../../lib/itemRatings.js');
const { pctTxt, rowText, RowIcons, setName } = require('./coverageText.js');
const { Grade } = require('./CoverageTable.js');

const STAGE = {
  plus15: { label: 'Peças +15', tip: 'Todas as +15 da conta neste slot' },
  set: { label: 'Set aceito', tip: 'Falta o set' },
  main: { label: 'Principal aceito', tip: 'Falta o principal' },
  cut: { label: 'Passa na régua', tip: 'Substatus abaixo da régua' },
};
const NEAR_MAX = 12;

function Num({ cap, title, children }) {
  return html`<div className="cvd-num" title=${title}><span className="eqd-cap">${cap}</span><span className="cvd-v">${children}</span></div>`;
}

/* a maior queda proporcional entre etapas (onde a conta perde mais peças) */
function dropAt(st) {
  let at = -1;
  let worst = 1;
  for (let i = 1; i < st.length; i++) {
    if (!st[i - 1].n) continue;
    const r = st[i].n / st[i - 1].n;
    if (r < worst) { worst = r; at = i; }
  }
  return at;
}

function Funnel({ stages, row }) {
  const top = stages[0].n || 1;
  const drop = dropAt(stages);
  const label = (s) => (s.id === 'set' && row.set ? setName(row.set) : STAGE[s.id].label);
  return html`<div className="cv-funnel" role="list" aria-label="Funil">
    ${stages.map((s, i) => html`<div key=${s.id} role="listitem" className=${'cv-stage' + (i === drop ? ' drop' : '')}
      title=${i === drop ? `Maior queda: ${STAGE[s.id].tip.toLowerCase()}` : s.id === 'plus15' ? STAGE.plus15.tip : undefined}>
      <span className="cv-stage-l">${s.id === 'set' && row.set ? html`<${SetIcon} set=${row.set} size=${14} />` : ''}${label(s)}</span>
      <span className="cv-stage-bar"><span style=${{ width: `${Math.round((s.n / top) * 100)}%` }}></span></span>
      <${Delta} v=${s.n}><b className="tnum">${s.n}</b><//>
    </div>`)}
  </div>`;
}

function WhoLine({ x, codeOf, onHero, onArch }) {
  const p = x.p;
  const isA = p.kind === 'a';
  const open = () => (isA ? onArch && onArch(p.id) : onHero && onHero(p.name));
  const heroes = isA ? x.names.join(', ') : '';
  return html`<button type="button" className="cv-line act" onClick=${open}
    title=${isA ? `${p.name}${heroes ? ': ' + heroes : ''}` : `Abrir o Otimizador de ${p.name}`}>
    ${isA ? html`<${ArchetypeSymbol} symbol=${p.symbol} size=${20} />` : html`<${Portrait} code=${codeOf(p.name)} size=${20} />`}
    <span className="cv-name ellipsis">${p.name}${isA ? html`<span className="cv-extra tnum"> · ${x.w}</span>` : ''}</span>
    <span className="cv-cut" title=${p.ownMin ? 'Régua própria' : 'Régua herdada'}>
      <${RankBadge} rank=${itemRank.rankFor(p.min)} /><span className="tnum">≥${p.min}</span></span>
    <span className=${'cv-gem' + (p.ownGem ? '' : ' inh')} title=${p.ownGem ? 'Pedra própria' : 'Pedra herdada'}>${itemRatings.GEM_MODE_LABEL[p.gem]}</span>
    <${Delta} v=${x.supply}><b className="cv-n tnum" title="Oferta para ele">${x.supply}</b><//>
  </button>`;
}

function NearLine({ n, codeOf, onItem }) {
  const it = n.item;
  const main = it.main || {};
  const isA = n.p.kind === 'a';
  return html`<button type="button" className="cv-line cv-near act" onClick=${() => onItem && onItem(it.id)}
    title=${`${setName(it.set)} · ${itemStats.label(main.type)} ${itemStats.fmt(main.type, main.value)} · ${itemRank.pctInt(n.pct)}% para ${n.p.name} (régua ${n.min})${it.equippedByName ? ' · ' + it.equippedByName : ''}`}>
    <${GearIcon} slot=${it.gear} size=${18} />
    <${SetIcon} set=${it.set} size=${15} />
    <span className="cv-mainstat"><${StatIcon} stat=${itemStats.info(main.type).icon} size=${12} /><span className="tnum">${itemStats.fmt(main.type, main.value)}</span></span>
    <span className="cv-name">${isA ? html`<${ArchetypeSymbol} symbol=${n.p.symbol} size=${16} />` : html`<${Portrait} code=${codeOf(n.p.name)} size=${16} />`}</span>
    <${RankBadge} rank=${itemRank.rankFor(n.pct)} />
    <span className="cv-gap tnum">${itemRank.pctInt(n.pct)}% <span className="it-free">/ ${n.min}</span></span>
  </button>`;
}

const NONE = '';

function CoverageDetail({ ctx, row, codeOf, onHero, onArch, onItem, full }) {
  const stages = row ? C.funnel(ctx, row) : null;
  const near = row && full ? C.near(ctx, row, NEAR_MAX) : [];
  const who = row ? row.who.slice().sort((a, b) => b.w - a.w || a.p.name.localeCompare(b.p.name, 'pt-BR')) : [];
  return html`<aside className=${'eqd cvd' + (full ? '' : ' compact')} aria-label="Tipo escolhido">
    <${Box} className="eqd-box cvd-type">
      <div className="eqd-head cvd-head">${row
        ? html`<span className="contents"><${RowIcons} r=${row} /><span className="cvd-title ellipsis" title=${rowText(row)}>${rowText(row)}</span></span>`
        : html`<span className="label">Tipo</span>`}</div>
      <div className="cvd-nums">
        <${Num} cap="Demanda" title="Heróis Favoritos/Equipáveis que pedem">${row ? html`<${Delta} v=${row.demand}><b className="tnum">${row.demand}</b><//>` : ''}<//>
        <${Num} cap="Oferta" title="Peças +15 que passam na régua">${row ? html`<${Delta} v=${row.supply}><b className="tnum">${row.supply}</b><//>` : ''}<//>
        <${Num} cap="Cobertura" title="Oferta ÷ demanda">${row && row.cover != null
          ? html`<span className="contents"><${QualityBar} ratio=${row.cover} /><${Delta} v=${row.cover}><b className="tnum">${pctTxt(row.cover)}</b><//></span>` : ''}<//>
        <${Num} cap="Melhor" title="A melhor peça da oferta">${row ? html`<${Grade} v=${row.best} />` : ''}<//>
        <${Num} cap="Média" title="Média das peças da oferta">${row ? html`<${Grade} v=${row.avg} />` : ''}<//>
        <${Num} cap="% slot" title=${row ? `Oferta ÷ ${row.pool} peças +15` : undefined}>${row ? html`<b className="tnum">${pctTxt(row.slotShare)}</b>` : ''}<//>
      </div>
      <div className="eqd-head"><span className="label">Funil</span></div>
      ${row ? html`<${Funnel} stages=${stages} row=${row} />` : NONE}
    <//>
    ${full ? html`<span className="contents">
      <${Box} className="eqd-box cvd-who">
        <div className="eqd-head"><span className="label">Quem pede · ${who.length}</span></div>
        <div className="eqd-list">${who.length ? who.map((x) => html`<${WhoLine} key=${x.p.id} x=${x} codeOf=${codeOf} onHero=${onHero} onArch=${onArch} />`) : NONE}</div>
      <//>
      <${Box} className="eqd-box cvd-near">
        <div className="eqd-head"><span className="label">Perto da régua · ${near.length}</span></div>
        <div className="eqd-list">${near.length
          ? near.map((n) => html`<${NearLine} key=${n.item.id} n=${n} codeOf=${codeOf} onItem=${onItem} />`)
          : ''}</div>
      <//>
    </span>` : ''}
  </aside>`;
}

module.exports = { CoverageDetail };
