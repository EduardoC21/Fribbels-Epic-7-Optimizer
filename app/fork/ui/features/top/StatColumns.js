/*
 * StatColumns — colunas 2 e 3 do topo.
 *
 * GameStats  : o que o JOGO mostra, no MESMO formato da tela do herói no jogo:
 *                Ataque        3.937  ▲ 2.633
 *              valor total + (em destaque) o quanto veio de fora da base —
 *              equipamento, sets, imprint, artefato e EE. Base = total − ▲.
 *              CP fica na linha dos sets (é stat de jogo).
 *              Ordem: ATK, DEF, HP, SPD, CC, CD, EFF, RES, ataque em dupla.
 * DerivedStats: o que o FRIBBELS calcula, com a nomenclatura oficial de
 *              lib/statInfo.js (FRIBBELS) — nunca escrever o nome à mão aqui.
 * As linhas se espalham pela altura inteira da caixa (sem vazio embaixo).
 *
 * Sem build completa (fora da conta, sem equipamento ou com menos de 6 peças —
 * o backend só calcula com as 6 e manda zero): mostra SÓ a base (nível 60, 6★,
 * desperto, do herodata), sem ▲. A ausência do ▲ é o que diz "isto é a base".
 * A calculada mostra o que o backend manda (zeros) ou "—" fora da conta.
 * Valor que muda (imprint, artefato, EE, peça) pisca subiu/desceu (components/Delta.js); o HeroTop
 * monta as colunas de novo ao trocar de herói/build, então trocar de herói não pisca.
 */
'use strict';
const { html } = require('../../h.js');
const { Box, StatIcon, Glyph, SetIcon, Delta } = require('../../components/index.js');
const statInfo = require('../../../lib/statInfo.js');
const targetBuild = require('../../../lib/targetBuild.js');
const buildsList = require('../../../lib/buildsList.js');
const { isComplete } = require('../builds/buildRows.js');
const fmt = require('../../format.js');

function Row({ icon, label, value, gain, title, n }) {
  return html`<div className="sc-row" title=${title}>
    ${icon ? html`<span className="sc-ico">${icon}</span>` : ''}
    <span className="sc-nm ellipsis">${label}</span>
    <${Delta} v=${n} className="sc-val tnum">${value}<//>
    ${gain !== undefined ? html`<span className="sc-gain tnum">${gain
      ? html`<span className="contents"><${Glyph} name="gain" size=${8} />${gain}</span>` : ''}</span>` : ''}
  </div>`;
}

/* por que não há build para mostrar (texto do cabeçalho quando é só a base) */
function baseReason(acc) {
  if (!acc) return 'fora da conta';
  const n = Object.keys(acc.equipment || {}).filter((s) => acc.equipment[s]).length;
  return n ? `${n} de 6 peças` : 'sem equipamento';
}

function GameStats({ hero, acc }) {
  const base = targetBuild.baseStats(hero.name) || {};
  const full = isComplete(acc);        // só com as 6 peças o backend calcula
  const src = full ? acc : base;
  // o backend devolve dac=0 nos heróis da conta; o valor real (3%) vem do herodata
  const dac = (acc && acc.dac) || base.dac;
  const sets = acc ? buildsList.equipmentSetIcons(acc.equipment) : [];
  const f = (e, v) => fmt[e.pct ? 'pct' : 'int'](v);

  return html`<${Box} className="sc">
    <div className="sc-head">
      <span className="sc-cp tnum">
        <span className="sub">CP</span> <${Delta} v=${src.cp}>${fmt.int(src.cp)}<//>
      </span>
      ${full ? '' : html`<span className="sc-base" title="Sem as 6 peças: base do herói (60, 6★, desperto)">
        base · ${baseReason(acc)}</span>`}
      <span className="sc-sets">
        ${sets.map((s, i) => html`<span key=${i} className="sc-set" title=${`${s.set.replace(/Set$/, '')} · ${s.count} peças`}>
          <${SetIcon} set=${s.set} size=${16} /><b className="tnum">${s.count}</b></span>`)}
      </span>
    </div>
    <div className="sc-list">
      ${statInfo.GAME.map((e) => {
        const gain = full && base[e.k] != null ? Math.round(acc[e.k] - base[e.k]) : 0;
        return html`<${Row} key=${e.k}
          title=${full ? `Base ${f(e, base[e.k])} + ${f(e, gain)}` : undefined}
          icon=${html`<${StatIcon} stat=${e.icon} size=${14} />`}
          label=${e.label} value=${f(e, src[e.k])} n=${src[e.k]}
          gain=${full ? (gain > 0 ? f(e, gain) : '') : undefined} />`;
      })}
      <${Row}
        icon=${html`<${Glyph} name="dual" size=${14} />`}
        label="Ataque em dupla" value=${fmt.pct(dac)} gain=${full ? '' : undefined} />
    </div>
  <//>`;
}

function DerivedStats({ acc }) {
  return html`<${Box} className="sc">
    <div className="sc-list">
      ${statInfo.FRIBBELS.map((e) => html`<${Row} key=${e.k}
        title=${e.tip}
        label=${e.label} value=${acc ? fmt.int(acc[e.k]) : fmt.DASH} n=${acc ? acc[e.k] : null} />`)}
    </div>
  <//>`;
}

module.exports = { GameStats, DerivedStats, Row };
