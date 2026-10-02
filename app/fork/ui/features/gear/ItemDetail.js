/*
 * ItemDetail — painel da peça SELECIONADA na tela Equipamentos (1 clique na linha):
 *
 *   PEÇA                                    [Editar]
 *   [GearCard da peça]
 *   Score 99 · SS 83% (e, com filtro "Para", o rank/% para ele)
 *   HERÓIS INTERESSADOS · 2        → Favoritos em cima, Equipáveis embaixo; clique abre o Otimizador do herói
 *   ARQUÉTIPOS INTERESSADOS · 1    → clique abre o arquétipo na tela Arquétipos
 *
 * Mesmo conteúdo do cartão da bolinha (InterestList), clicável. Editar (ou duplo
 * clique na linha / Enter) abre o popout. Sem peça: o espaço fica reservado (a tela não pula).
 * `wide` (janela larga): só as duas caixas, lado a lado — o card e as notas ficam no editor
 * embutido logo acima (ItemPopout inline), e `item` pode ser o RASCUNHO dele (notas ao vivo).
 */
'use strict';
const { html } = require('../../h.js');
const { Box, Button, Glyph, GameGlyph, RankBadge, Delta } = require('../../components/index.js');
const itemRank = require('../../../lib/itemRank.js');
const interest = require('../../../lib/interest.js');
const { GearCard } = require('../top/GearCard.js');
const { InterestList, HeroLists } = require('./InterestCard.js');

function Note({ label, pct }) {
  return html`<span className="eqd-note">
    <span className="eqd-cap">${label}</span>
    ${pct == null ? html`<span className="it-free">—</span>`
      : html`<${Delta} v=${pct}><${RankBadge} rank=${itemRank.rankFor(pct)} /><b className="tnum">${itemRank.pctInt(pct)}%</b><//>`}
  </span>`;
}

function ItemDetail({ item, profiles, target, codeOf, onEdit, onHero, onArch, wide }) {
  if (!item) {
    return html`<aside className=${'eqd empty' + (wide ? ' wide' : '')} aria-label="Peça escolhida">
    </aside>`;
  }
  const s = interest.split(item, profiles);
  const n = (rows) => rows.filter((x) => x.ok).length;
  const score = itemRank.scoreOf(item);
  const proj = itemRank.scoreReforgedOf(item);
  const tp = target ? interest.profileFor(profiles, target) : null;
  const tName = target ? (target.slice(0, 2) === 'h:' ? target.slice(2) : tp && tp.name) : null;
  return html`<aside className=${'eqd' + (wide ? ' wide' : '')} aria-label=${wide ? 'Quem se interessa pela peça' : 'Peça escolhida'}>
    ${wide ? '' : html`<${Box} className="eqd-box eqd-piece">
      <div className="eqd-head">
        <span className="label">Peça</span>
        <span className="spacer"></span>
        <${Button} onClick=${onEdit} title="Ou duplo clique / Enter na linha">
          <${Glyph} name="edit" size=${12} /> Editar<//>
      </div>
      <div className="eqd-card">
        <${GearCard} slot=${item.gear} item=${item} ownerCode=${codeOf(item.equippedByName)} />
      </div>
      <div className="eqd-notes">
        <span className="eqd-note" title=${proj != null ? 'Hoje · reforjada' : undefined}><span className="eqd-cap">Score</span><${Delta} v=${score}><b className="tnum">${score == null ? '—' : score}</b><//>${proj != null ? html`<span className="it-proj"><${GameGlyph} name="reforge" size=${11} />${proj}</span>` : ''}</span>
        <${Note} label="Peça" pct=${itemRank.potentialOf(item)} />
        ${tp ? html`<${Note} label=${tName} pct=${itemRank.potentialOf(item, tp.id)} />` : ''}
      </div>
    <//>`}
    <${Box} className="eqd-box eqd-heroes">
      <div className="eqd-head"><span className="label">Heróis interessados · ${n(s.heroes)}</span></div>
      <div className="eqd-list">
        <${HeroLists} s=${s} codeOf=${codeOf} onPick=${(x) => onHero(x.name)} activeKey=${target} />
      </div>
    <//>
    <${Box} className="eqd-box eqd-arch">
      <div className="eqd-head"><span className="label">Arquétipos interessados · ${n(s.arch)}</span></div>
      <div className="eqd-list">
        <${InterestList} kind="a" rows=${s.arch} codeOf=${codeOf} onPick=${(x) => onArch(x.p.id)}
          activeKey=${target} />
      </div>
    <//>
  </aside>`;
}

module.exports = { ItemDetail };
