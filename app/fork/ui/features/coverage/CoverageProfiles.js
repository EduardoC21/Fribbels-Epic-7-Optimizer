/*
 * CoverageProfiles — aba PERFIS da Cobertura: a matriz perfil × 6 peças + a régua e a pedra de cada perfil.
 *
 *   Perfil (símbolo/retrato · nome) | Atendidos (k/N, alocação) | Arma … Bota (válidas; fundo = válidas ÷ heróis) | Régua | Pedra
 *
 * Régua e pedra aqui são do SIMULADOR (a tela grava só no Aplicar): própria ou herdada (apagada, como no Otimizador);
 * a célula/controle alterado ganha a marca de pendente (Amarelo Atenção). Clicar numa célula abre a aba Tipos já
 * filtrada naquele perfil e slot. Ordem: quem tem a pior peça primeiro; perfis sem Fav/Eq (só sobra) no fim.
 */
'use strict';
const { html } = require('../../h.js');
const { Box, Scrollable, Delta, Dropdown, InterestCut, ArchetypeSymbol, Portrait, GearIcon } = require('../../components/index.js');
const theme = require('../../theme.js');
const C = require('../../../lib/coverage.js');
const itemRatings = require('../../../lib/itemRatings.js');
const { SLOT_PT } = require('../top/GearCard.js');
const { GEM_OPTS } = require('./coverageText.js');

const COLS = `minmax(200px, 1fr) 72px repeat(${C.SLOTS.length}, 58px) 176px 140px`;
const ATT_TIP = 'Pela ordem dos heróis, cada um pega 1 peça válida por slot (a menos disputada); atendido = pegou nos 6';
const TPL = { gridTemplateColumns: COLS };

const worst = (x) => (x.w ? Math.min(...C.SLOTS.map((s) => x.slots[s].valid / x.w)) : Infinity);
function order(list) {
  return list.slice().sort((a, b) => (worst(a) - worst(b)) || (b.w - a.w) || a.p.name.localeCompare(b.p.name, 'pt-BR'));
}

function Cell({ x, slot, onCell }) {
  const c = x.slots[slot];
  const ratio = x.w ? c.valid / x.w : null;
  const bg = ratio == null ? null : theme.heatColor(Math.min(ratio, 1), 0, 1);
  const tip = `${SLOT_PT[slot]}: ${c.valid} válidas${x.w ? ` · ${x.w} ${x.w === 1 ? 'herói' : 'heróis'}` : ''}`;
  return html`<button type="button" className="bt-c cvp-cell tnum" style=${bg ? { background: bg } : undefined}
    title=${tip} aria-label=${`${x.p.name}, ${tip}`}
    onClick=${() => onCell(x.p, slot)}><${Delta} v=${c.valid}>${c.valid}<//></button>`;
}

function ProfileRow({ x, at, codeOf, sim, onCut, onGem, onCell }) {
  const p = x.p;
  const isA = p.kind === 'a';
  const key = isA ? 'a' : 'h';
  const id = isA ? p.id.slice(2) : p.name;
  const s = (sim[key] || {})[id] || {};
  const ownMin = 'min' in s ? s.min : (p.ownMin ? p.min : null);
  const ownGem = 'gem' in s ? s.gem : (p.ownGem ? p.gem : null);
  return html`<div role="row" className="bt-row cvp-row" style=${TPL}>
    <span className="bt-f l first cvp-who" title=${isA ? `${p.name}: ${x.names.join(', ') || '—'}` : p.name}>
      ${isA ? html`<${ArchetypeSymbol} symbol=${p.symbol} size=${22} />` : html`<${Portrait} code=${codeOf(p.name)} size=${22} />`}
      <span className="ellipsis">${p.name}</span>
    </span>
    <span className=${'bt-f tnum cvp-att' + (x.w ? (at && at.served === at.total ? ' ok' : '') : ' it-free')} title=${ATT_TIP}>
      ${x.w && at ? html`<span className="contents"><${Delta} v=${at.served}><b>${at.served}</b><//><span className="it-free">/${at.total}</span></span>` : '—'}</span>
    ${C.SLOTS.map((sl) => html`<${Cell} key=${sl} x=${x} slot=${sl} onCell=${onCell} />`)}
    <span className=${'bt-f cvp-cut' + ('min' in s ? ' pend' : '')}>
      <${InterestCut} label=${`Régua de ${p.name}`} value=${ownMin} inherited=${p.inhMin} onChange=${(v) => onCut(key, id, v)} />
    </span>
    <span className=${'bt-f cvp-gem eq-dd' + ('gem' in s ? ' pend' : '') + (ownGem == null ? ' inherited' : '')}
      title=${ownGem == null ? 'Pedra herdada' : itemRatings.GEM_MODE_TIP[ownGem]}>
      <${Dropdown} label=${`Pedra de ${p.name}`} options=${GEM_OPTS} value=${ownGem} clearable=${true}
        placeholder=${itemRatings.GEM_MODE_LABEL[p.inhGem]} onChange=${(v) => onGem(key, id, v)} />
    </span>
  </div>`;
}

function CoverageProfiles({ ctx, alloc, codeOf, sim, onCut, onGem, onCell }) {
  const rows = order(C.profiles(ctx).filter((x) => x.p.kind === 'a' || x.w));   // herói fora de Fav/Eq não pede
  return html`<${Box} flush=${true} className="bt-box it-box cv-box">
    <${Scrollable} className="bt-scroll it-scroll">
      <div className="bt cv cvp" role="table" aria-label="Cobertura por perfil">
        <div className="bt-row bt-head" role="row" style=${TPL}>
          <span className="bt-h l" role="columnheader">Perfil</span>
          <span className="bt-h" role="columnheader" title=${ATT_TIP}>Atendidos</span>
          ${C.SLOTS.map((s) => html`<span key=${s} className="bt-h" role="columnheader" title=${`${SLOT_PT[s]}: válidas`}><${GearIcon} slot=${s} size=${16} /></span>`)}
          <span className="bt-h l" role="columnheader">Régua</span>
          <span className="bt-h l" role="columnheader">Pedra</span>
        </div>
        ${rows.map((x) => html`<${ProfileRow} key=${x.p.id} x=${x} at=${alloc.byProfile[x.p.id]} codeOf=${codeOf} sim=${sim} onCut=${onCut} onGem=${onGem} onCell=${onCell} />`)}
        ${ctx.unprofiled.map((n) => html`<div key=${'u:' + n} role="row" className="bt-row cvp-row" style=${TPL}>
          <span className="bt-f l first cvp-who"><${Portrait} code=${codeOf(n)} size=${22} /><span className="ellipsis">${n}</span></span>
          <span className="bt-f it-free" title="Sem prioridade no Otimizador">—</span>
        </div>`)}
      </div>
    <//>
  <//>`;
}

module.exports = { CoverageProfiles };
