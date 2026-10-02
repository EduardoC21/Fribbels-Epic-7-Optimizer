/*
 * ItemTable — o inventário em TABELA, uma linha por peça:
 *
 *   Peça | Set | Nív (cor da raridade) | + | Main | ATK% … RES | Score | Rank | Pot. | Int. | Dono | 🔒
 *
 * Notas (lib/itemRank.js, do backend): Score = Pontos de Equipamento do jogo; Rank D→SSS+ e
 * Pot. = potencial % — da PEÇA, ou do perfil escolhido no filtro "Para" (`profileId`);
 * Int. = bolinha com quantos interessados passam do corte; no hover, o cartão com as duas
 * listas (InterestCard: arquétipos e heróis, rank e % para cada um).
 *
 * - Substatus com HEATMAP contínuo por coluna (min→max das linhas passadas),
 *   igual à lista de builds; célula vazia = a peça não tem aquele substatus.
 *   ◆ = substatus modificado (gema).
 * - Clique no cabeçalho ordena (Nív, +, substatus, Score, Rank, Pot., Int.): maior → menor → natural (mais nova primeiro, pelo id do jogo).
 * - `profiles` = app.ratingProfiles; `ver` = app.ratingsVer (a nota chegou: redesenha a tabela memo).
 * - Lista virtual + teclado (components/useVirtualRows.js): clique/Espaço/setas = onPick(item)
 *   (seleciona); com `onOpen`, duplo clique e Enter = onOpen(item) (abre o popout). Sem
 *   `onOpen`, Enter também é onPick (diálogo de espaço vazio).
 * - `pickedId` destaca uma linha (a selecionada).
 *
 * Reaproveita o visual da lista de builds (classes .bt-*).
 */
'use strict';
const { React, html, useState, useMemo } = require('../../h.js');
const { Box, Scrollable, Delta, Glyph, GameGlyph, SetIcon, GearIcon, StatIcon, Portrait, RankBadge, HoverCard, useVirtualRows } = require('../../components/index.js');
const theme = require('../../theme.js');
const fmt = require('../../format.js');
const itemStats = require('../../../lib/itemStats.js');
const itemRank = require('../../../lib/itemRank.js');
const interest = require('../../../lib/interest.js');
const { SLOT_PT, RARITY } = require('../top/GearCard.js');
const G = require('./gearList.js');
const { InterestCard } = require('./InterestCard.js');

const ROW_H = 31;   // 30px de célula + 1px de divisória (CSS .bt-row.v)
const RARITY_PT = { Epic: 'Épica', Heroic: 'Heroica', Rare: 'Rara', Good: 'Boa', Normal: 'Normal' };
// atributos com largura FIXA (cabe "2,835" semicondensado); Dono com teto — a sobra da tela vai para o painel
// da peça (features.css `--eq-table` = a soma destas colunas + barra de rolagem: mudou aqui, muda lá)
// --it-sub / --it-owner vêm da tela (features.css .eq-main: a lista cresce na janela média); fora dela, o padrão
const COLS = `32px 28px 34px 34px 96px repeat(${G.SUB_COLUMNS.length}, var(--it-sub, 40px)) 60px 42px 44px 38px var(--it-owner, minmax(96px, 150px)) 26px`;
const TPL = { gridTemplateColumns: COLS };

function SortHead({ k, label, title, sort, setSort, className }) {
  const on = sort && sort.k === k;
  return html`<button type="button" role="columnheader"
    className=${'bt-h bt-sort' + (on ? ' on' : '') + (className ? ' ' + className : '')}
    title=${title}
    aria-sort=${on ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
    onClick=${() => setSort((s) => G.nextSort(s, k))}>
    ${label}${on ? html`<${Glyph} name=${sort.dir === 'asc' ? 'chevron-up' : 'chevron-down'} size=${10} />` : ''}
  </button>`;
}

function Row({ it, rg, ownerCode, picked, tabIndex, onPick, onOpen, onKey, tpl, profiles, profileId, codeOf }) {
  const main = it.main || {};
  const rar = RARITY[it.rank] || 'normal';
  const score = itemRank.scoreOf(it);
  const proj = itemRank.scoreReforgedOf(it);
  const pot = itemRank.potentialOf(it, profileId);
  const rated = itemRank.potentialOf(it) != null;
  const nOk = rated ? interest.countOk(interest.split(it, profiles)) : null;
  const potTip = pot == null ? 'Sem nota ainda'
    : `Potencial ${itemRank.pctInt(pot)}%${profileId ? ' para o escolhido em "Para"' : ''}`;
  return html`<div data-key=${it.id} role="row" style=${tpl} tabIndex=${tabIndex} aria-selected=${!!picked}
    className=${'bt-row it-row v pickable' + (picked ? ' picked' : '')}
    onClick=${() => onPick(it)} onDoubleClick=${onOpen ? () => onOpen(it) : undefined} onKeyDown=${onKey}>
    <span className="bt-f first" title=${`${SLOT_PT[it.gear] || it.gear} · ${RARITY_PT[it.rank] || it.rank}`}><${GearIcon} slot=${it.gear} size=${20} /></span>
    <span className="bt-f"><${SetIcon} set=${it.set} size=${17} title=${String(it.set || '').replace(/Set$/, '')} /></span>
    <span className="bt-f it-lvl tnum" style=${{ color: `var(--${rar})` }} title=${`Nível ${it.level} · ${RARITY_PT[it.rank] || it.rank}`}>${it.level}</span>
    <span className="bt-f it-enh tnum">+${it.enhance}</span>
    <span className="bt-f l it-main" title=${`Principal: ${G.NAME[main.type] || main.type} ${itemStats.fmt(main.type, main.value)}`}>
      <${StatIcon} stat=${itemStats.info(main.type).icon} size=${13} />
      <span className="it-mn">${itemStats.label(main.type)}</span>
      <span className="it-mv tnum">${itemStats.fmt(main.type, main.value)}</span>
    </span>
    ${G.SUB_COLUMNS.map((c) => {
      const s = (it.substats || []).find((x) => x.type === c.k);
      if (!s) return html`<span key=${c.k} className="bt-c it-none"></span>`;
      const bg = theme.heatColor(Number(s.value), rg[c.k].min, rg[c.k].max);
      return html`<span key=${c.k} className="bt-c tnum" style=${bg ? { background: bg } : undefined}
        title=${`${c.label}: ${itemStats.fmt(c.k, s.value)}${s.modified ? ' (modificado)' : ''}`}>
        ${itemStats.fmt(c.k, s.value)}${s.modified ? html`<${GameGlyph} name="modified" size=${9} className="it-mod" />` : ''}
      </span>`;
    })}
    <span className="bt-f it-score tnum" title=${proj != null ? `Pontos de Equipamento: ${score} · reforjada ${proj}` : 'Pontos de Equipamento'}>
      ${score == null ? fmt.DASH : html`<${Delta} v=${score}>${score}<//>`}${proj != null ? html`<span className="it-proj"><${GameGlyph} name="reforge" size=${10} />${proj}</span>` : ''}
    </span>
    <span className="bt-f it-rank" title=${potTip}>${pot == null ? html`<span className="it-free">${fmt.DASH}</span>` : html`<${Delta} v=${pot}><${RankBadge} rank=${itemRank.rankFor(pot)} /><//>`}</span>
    <span className="bt-f it-pot tnum" title=${potTip}>${pot == null ? html`<span className="it-free">${fmt.DASH}</span>` : html`<${Delta} v=${pot}>${itemRank.pctInt(pot)}%<//>`}</span>
    <span className="bt-f it-int">
      ${nOk == null ? html`<span className="it-free">${fmt.DASH}</span>`
        : html`<${HoverCard} content=${() => html`<${InterestCard} item=${it} profiles=${profiles} codeOf=${codeOf || (() => null)} />`}>
            <${Delta} v=${nOk}><span className=${'it-nok tnum' + (nOk ? '' : ' zero')} aria-label=${`${nOk} interessados`}>${nOk}</span><//>
          <//>`}
    </span>
    <span className="bt-f l it-owner" title=${it.equippedByName || 'Sem herói'}>
      ${it.equippedByName
        ? html`<span className="contents"><${Portrait} code=${ownerCode} size=${20} /><span className="ellipsis">${it.equippedByName}</span></span>`
        : html`<span className="it-free">${fmt.DASH}</span>`}
    </span>
    <span className="bt-f">${it.locked ? html`<${Glyph} name="lock" size=${12} title="Travada" />` : ''}</span>
  </div>`;
}

function ItemTableView({ items, onPick, onOpen, pickedId, empty, codeOf, className, profiles, profileId, ver }) {
  const tpl = TPL;
  const [sort, setSort] = useState(null);
  const shown = useMemo(() => G.sortItems(items || [], sort, {
    pot: (it) => itemRank.potentialOf(it, profileId),
    int: (it) => (itemRank.potentialOf(it) == null ? null : interest.countOk(interest.split(it, profiles))),
  }), [items, sort, ver, profiles, profileId]);
  const rg = useMemo(() => G.ranges(items), [items]);
  const v = useVirtualRows({ rows: shown, rowH: ROW_H, keyOf: (it) => it.id, onPick, pickedKey: pickedId, min: 120,
    onMove: onOpen ? onPick : undefined, onEnter: onOpen });

  if (!shown.length) return html`<${Box} pad=${true} className="bt-empty"><span title=${empty || 'Nenhuma peça'} aria-label=${empty || 'Nenhuma peça'}></span><//>`;

  const head = { sort, setSort };
  return html`<${Box} flush=${true} className=${'bt-box it-box' + (className ? ' ' + className : '')}>
    <${Scrollable} className="bt-scroll it-scroll" innerRef=${v.scrollRef} onScroll=${v.virtual ? v.measure : undefined}>
      <div className=${'bt it' + (v.virtual ? ' virtual' : '')} role="table" aria-label="Peças" aria-rowcount=${shown.length}>
        <div className="bt-row bt-head" role="row" style=${tpl}>
          <span className="bt-h" role="columnheader">Peça</span>
          <span className="bt-h" role="columnheader">Set</span>
          <${SortHead} k="level" label="Nív" title="Nível" ...${head} />
          <${SortHead} k="enhance" label="+" title="Aprimoramento" ...${head} />
          <span className="bt-h l" role="columnheader">Principal</span>
          ${G.SUB_COLUMNS.map((c) => html`<${SortHead} key=${c.k} k=${c.k} label=${c.code} title=${c.label} ...${head} />`)}
          <${SortHead} k="score" label="Score" title="Pontos de Equipamento" ...${head} />
          <${SortHead} k="rank" label="Rank" title=${profileId ? 'Rank para o escolhido em "Para"' : 'Rank da peça'} ...${head} />
          <${SortHead} k="pot" label="Pot." title=${profileId ? 'Potencial para o escolhido em "Para"' : 'Potencial da peça'} ...${head} />
          <${SortHead} k="int" label="Int." title="Interessados" ...${head} />
          <span className="bt-h l" role="columnheader">Dono</span>
          <span className="bt-h" role="columnheader" aria-label="Travada"><${Glyph} name="lock" size=${11} /></span>
        </div>
        ${v.virtual && v.from > 0 ? html`<div className="bt-pad" style=${{ height: v.from * ROW_H }} aria-hidden="true"></div>` : ''}
        ${v.slice.map((it) => html`<${Row} key=${it.id} it=${it} rg=${rg} ownerCode=${codeOf ? codeOf(it.equippedByName) : null}
          picked=${pickedId === it.id} tabIndex=${it.id === v.stopKey ? 0 : -1}
          onPick=${onPick} onOpen=${onOpen} onKey=${(e) => v.onRowKey(e, it)} tpl=${tpl} profiles=${profiles} profileId=${profileId} codeOf=${codeOf} />`)}
        ${v.virtual && v.to < shown.length ? html`<div className="bt-pad" style=${{ height: (shown.length - v.to) * ROW_H }} aria-hidden="true"></div>` : ''}
      </div>
    <//>
  <//>`;
}

const ItemTable = React.memo(ItemTableView);

module.exports = { ItemTable, RARITY_PT, ROW_H };
