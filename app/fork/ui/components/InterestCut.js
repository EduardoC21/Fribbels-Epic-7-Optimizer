/*
 * InterestCut — o corte de interesse (% de potencial) em DOIS controles ligados:
 *
 *   [ A ≥82 ▾ ] [ 82 ] %
 *
 * Escolher um rank põe no número o piso EXATO daquele rank (rankByPotential); digitar um número
 * mostra no rank o MENOR rank que ainda aparece como interessado com esse corte (84 → A: peças A
 * de 84–86% passam). Vazio (null) = herda o corte de cima (`inherited`): o rank e o número mostram
 * o herdado apagado, como placeholder; o × do rank volta para o herdado. Os cortes vêm de lib/itemRank
 * (fonte única). Os dois controles têm 30px (altura do dropdown); dentro de `.op-grow` o rank estica.
 */
'use strict';
const { html } = require('../h.js');
const { Dropdown } = require('./Dropdown.js');
const { NumberField } = require('./NumberField.js');
const { RankBadge } = require('./RankBadge.js');
const itemRank = require('../../lib/itemRank.js');

function InterestCut({ value, onChange, inherited, label, lead, disabled }) {
  const cuts = itemRank.cuts();
  const eff = value != null ? value : inherited;
  const opts = cuts.map(([min, rank]) => ({ value: rank, label: `≥${min}`, icon: html`<${RankBadge} rank=${rank} />` }));
  const rank = eff == null ? null : itemRank.rankFor(eff);
  const pick = (r) => {
    if (r == null) { onChange(null); return; }   // × = volta a herdar
    const c = cuts.find(([, x]) => x === r);
    if (c) onChange(c[0]);
  };
  return html`<span className=${'ui-icut' + (value == null ? ' inherited' : '')}>
    ${lead ? html`<span className="eq-int-lab">${lead}</span>` : ''}
    <span className="ui-icut-rank" title="Rank mínimo">
      <${Dropdown} label=${`${label}: rank mínimo`} options=${opts} value=${value == null ? null : rank}
        placeholder=${rank ? html`<${RankBadge} rank=${rank} title="Herdado" />` : '—'}
        clearable=${true} disabled=${disabled} onChange=${pick} />
    </span>
    <${NumberField} className="eq-int-num" label=${`${label}, em % de potencial`} value=${value} min=${0} max=${150}
      placeholder=${inherited == null ? '' : String(inherited)} disabled=${disabled} onChange=${onChange} /><span className="sub">%</span>
  </span>`;
}

module.exports = { InterestCut };
