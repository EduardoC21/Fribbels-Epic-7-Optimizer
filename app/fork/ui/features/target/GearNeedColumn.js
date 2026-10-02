/*
 * GearNeedColumn — coluna 4 do topo com uma build-alvo: o que o GEAR precisa
 * entregar para o herói chegar nela (no lugar dos 6 equipamentos).
 *
 *   [Colar: CD%] [Anel: ATK%] [Bota: SPD]   mains recomendados; a COR diz se o
 *                                            item equipado hoje já tem esse main
 *   substatus | progresso | Build | Meu | Δ
 *
 * Alvo  = o que falta vir de SUBSTATUS depois dos mains (fixos + recomendados).
 *         O "quanto o gear precisa" vem do BACKEND (/fork/gearNeeded); a divisão
 *         entre mains e substatus é planejamento (lib/targetBuild.plan).
 * Atual = a soma dos substatus do gear equipado hoje (mesma unidade: ATK/DEF/HP
 *         em % da base, o resto em pontos).
 * Barra = Atual ÷ Alvo, no gradiente de qualidade; stat não exigido fica neutro.
 */
'use strict';
const { html } = require('../../h.js');
const { Box, StatIcon, QualityBar } = require('../../components/index.js');
const targetBuild = require('../../../lib/targetBuild.js');
const itemStats = require('../../../lib/itemStats.js');
const fmt = require('../../format.js');

const SLOT_PT = { Necklace: 'Colar', Ring: 'Anel', Boots: 'Bota' };
const SUB_LABEL = { atk: 'ATK%', def: 'DEF%', hp: 'HP%', spd: 'SPD', cr: 'CC%', cd: 'CD%', eff: 'EFF%', res: 'RES%' };

function MainBox({ slot, main, current }) {
  const info = itemStats.info(main);
  const state = !current ? '' : (current === main ? ' ok' : ' no');
  const title = !current ? `${SLOT_PT[slot]}: sem peça equipada para comparar`
    : (current === main ? `${SLOT_PT[slot]} equipado já tem ${itemStats.label(main)}`
      : `${SLOT_PT[slot]} equipado tem ${itemStats.label(current)} — o recomendado é ${itemStats.label(main)}`);
  return html`<div className=${'gn-main' + state} title=${title}>
    <span className="gn-main-top">${info.icon ? html`<${StatIcon} stat=${info.icon} size=${14} />` : ''}${itemStats.label(main)}</span>
    <span className="gn-main-slot">${SLOT_PT[slot]}</span>
  </div>`;
}

function GearNeedColumn({ plan, equipment, loading, error }) {
  if (error) return html`<${Box} className="gn gn-msg sub">Não foi possível calcular: ${error}<//>`;
  if (!plan) return html`<${Box} className="gn gn-msg sub">${loading ? 'Calculando no backend…' : ''}<//>`;
  const eq = equipment || {};
  return html`<${Box} className=${'gn' + (loading ? ' is-loading' : '')}>
    <div className="gn-mains">
      ${targetBuild.VARIABLE_SLOTS.map((slot) => html`<${MainBox} key=${slot} slot=${slot}
        main=${plan.mains[slot]} current=${eq[slot] && eq[slot].main && eq[slot].main.type} />`)}
    </div>
    <div className="gn-tr gn-th">
      <span>Substatus</span><span>Progresso</span>
      <span className="r" title="Substatus da build">Build</span>
      <span className="r" title="Substatus do seu gear">Meu</span>
      <span className="r" title="Meu − Build">Δ</span>
    </div>
    <div className="gn-list">
      ${targetBuild.KEYS.map((k) => {
        const need = plan.afterMains[k] || 0;
        const have = plan.current[k] || 0;
        const d = Math.round((have - need) * 10) / 10;
        return html`<div key=${k} className="gn-tr"
          title=${need > 0 ? `${SUB_LABEL[k]}: build ${fmt.dec1(need)} · seu ${fmt.dec1(have)}` : `${SUB_LABEL[k]}: build não usa`}>
          <span className="gn-stat"><${StatIcon} stat=${targetBuild.KEY_ICON[k]} size=${13} />${SUB_LABEL[k]}</span>
          <${QualityBar} neutral=${need <= 0} ratio=${need > 0 ? have / need : 0} />
          <span className=${'r tnum' + (need > 0 ? '' : ' muted')}>${need > 0 ? fmt.dec1(need) : fmt.DASH}</span>
          <span className="r tnum">${fmt.dec1(have)}</span>
          <span className=${'r tnum ' + (need > 0 ? (d >= 0 ? 'gpos' : 'gneg') : 'muted')}>
            ${need > 0 ? `${d > 0 ? '+' : ''}${fmt.dec1(d)}` : fmt.DASH}</span>
        </div>`;
      })}
    </div>
  <//>`;
}

module.exports = { GearNeedColumn };
