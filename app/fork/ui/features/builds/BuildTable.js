/*
 * BuildTable — a lista de builds com HEATMAP contínuo por coluna.
 *
 *   [Marcar] | [Fonte] | Sets | Arq | ATK DEF HP SPD CC CD EFF RES | CP | calculados | S1-S3 | GS BS
 *   (sem coluna de nome: o nome da build fica no tooltip da linha; "em uso"
 *   aparece como destaque na Fonte)
 * - `showOrigin` (padrão true): a coluna Fonte some onde todas as linhas têm a
 *   mesma origem (aba Construções).
 *
 * - Cor de cada célula = posição do valor entre o min e o max DAQUELA coluna,
 *   considerando só as linhas passadas (as visíveis). Coluna sem variação fica
 *   sem cor: não há disparidade a mostrar.
 * - Células contíguas (sem vão) para o heatmap ler como faixa.
 * - Clique no cabeçalho ordena: maior primeiro → menor primeiro → natural.
 * - Tela estreita: rola na horizontal e Fonte/Sets/Arq ficam presas à esquerda.
 *
 * - `mark` (opcional) = { isMarked(row), onToggle(row) }: coluna "Marcar" no início,
 *   só nas builds públicas (pros/comunidade) — as suas já estão na Principal.
 * - Lista longa: rola por dentro com o cabeçalho preso no topo.
 * - LISTA VIRTUAL acima de 150 linhas (components/useVirtualRows.js) (a aba Construções pode ter 3.000):
 *   só as linhas visíveis (+ folga) viram DOM; acima e abaixo fica um espaço da
 *   mesma altura, então a barra de rolagem e o cabeçalho preso continuam iguais.
 *   Por isso a linha tem altura FIXA (ROW_H, igual ao CSS .bt-row.v).
 * - `onPick(row)` (opcional): a linha vira clicável — é assim que se escolhe a
 *   build-alvo do topo. `pickedKey` destaca a escolhida.
 *   Teclado: a tabela é UMA parada de Tab (a linha ativa); ↑/↓/PgUp/PgDn/Home/End
 *   andam entre as linhas (rolando a lista virtual até a linha existir no DOM) e
 *   Enter/Espaço escolhem.
 * - `onRowMenu(row, evento)` (opcional): clique direito na linha (ou a tecla de
 *   menu / Shift+F10 com a linha focada) — quem chama decide se abre um menu.
 *
 * Componente de apresentação: recebe as linhas prontas (ver buildRows.js).
 */
'use strict';
const { React, html, useState, useMemo } = require('../../h.js');
const { Box, Scrollable, Glyph, SetIcon, GearIcon, Checkbox, useVirtualRows } = require('../../components/index.js');
const theme = require('../../theme.js');
const fmt = require('../../format.js');
const R = require('./buildRows.js');

function OriginIcon({ origin }) {
  const title = (R.ORIGIN[origin] || {}).label || origin;
  const icon = origin === 'equipped' ? html`<${GearIcon} slot="Armor" size=${16} title=${title} />`
    : html`<${Glyph} name=${{ saved: 'save', community: 'people', pro: 'crown' }[origin] || 'save'} size=${14} title=${title} />`;
  return html`<span className=${'bt-origin o-' + origin} title=${title}>${icon}</span>`;
}

function Sets({ icons }) {
  const list = icons || [];
  const title = list.map((s) => `${s.set.replace(/Set$/, '')} ×${s.count}`).join(' + ') || 'sem set completo';
  return html`<span className="bt-sets" title=${title}>
    ${list.length ? list.map((s, i) => html`<${SetIcon} key=${i} set=${s.set} size=${16} title=${title} />`)
      : html`<span className="muted">${fmt.DASH}</span>`}
  </span>`;
}

function cellText(col, v) {
  if (v == null || !isFinite(Number(v))) return fmt.DASH;
  return col.pct ? fmt.pct(v) : fmt.compact(v);
}

const ROW_H = 31;          // 30px de célula + 1px de divisória (CSS .bt-row.v)

function BuildTableView({ rows, columns, empty, mark, onPick, pickedKey, showOrigin, onRowMenu }) {
  const origin = showOrigin !== false;
  const cols = columns || R.COLUMNS;
  const [sort, setSort] = useState(null);
  const shown = useMemo(() => R.sortRows(rows || [], sort), [rows, sort]);
  const rg = useMemo(() => R.ranges(rows || [], cols), [rows, cols]);
  // lista virtual acima de 150 linhas + teclado (ver components/useVirtualRows.js)
  const { scrollRef, measure, virtual, from, to, slice, stopKey, onRowKey } = useVirtualRows({ rows: shown, rowH: ROW_H, onPick, pickedKey });
  // colunas presas à esquerda, na ordem: [Marcar] [Fonte] Sets Arq — `left` de cada uma = soma das anteriores
  const fixed = [mark && ['mark', 56], origin && ['origin', 48], ['sets', 62], ['arq', 118]].filter(Boolean);
  const stick = {};
  fixed.reduce((left, [id, w], i) => { stick[id] = { style: { left }, cls: 'st' + (i === 0 ? ' first' : '') + (id === 'arq' ? ' last' : '') }; return left + w; }, 0);
  const tpl = { gridTemplateColumns: `${fixed.map(([, w]) => w + 'px').join(' ')} repeat(${cols.length}, minmax(48px, 1fr))` };

  if (!rows || !rows.length) return html`<${Box} pad=${true} className="bt-empty"><span title=${empty || 'Nenhuma build'} aria-label=${empty || 'Nenhuma build'}></span><//>`;

  return html`<${Box} flush=${true} className="bt-box">
    <${Scrollable} className="bt-scroll" innerRef=${scrollRef} onScroll=${virtual ? measure : undefined}>
      <div className=${'bt' + (virtual ? ' virtual' : '')} role="table">
        <div className="bt-row bt-head" role="row" style=${tpl}>
          ${mark ? html`<span className=${'bt-h ' + stick.mark.cls} style=${stick.mark.style} role="columnheader">Marcar</span>` : ''}
          ${origin ? html`<span className=${'bt-h ' + stick.origin.cls} style=${stick.origin.style} role="columnheader">Fonte</span>` : ''}
          <span className=${'bt-h ' + stick.sets.cls} style=${stick.sets.style} role="columnheader">Sets</span>
          <span className=${'bt-h ' + stick.arq.cls} style=${stick.arq.style} role="columnheader">Arq.</span>
          ${cols.map((c) => {
            const on = sort && sort.k === c.k;
            return html`<button type="button" key=${c.k} role="columnheader"
              className=${'bt-h bt-sort' + (on ? ' on' : '')}
              title=${c.label}
              aria-sort=${on ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
              onClick=${() => setSort((s) => R.nextSort(s, c.k))}>
              ${c.code}${on ? html`<${Glyph} name=${sort.dir === 'asc' ? 'chevron-up' : 'chevron-down'} size=${10} />` : ''}
            </button>`;
          })}
        </div>

        ${virtual && from > 0 ? html`<div className="bt-pad" style=${{ height: from * ROW_H }} aria-hidden="true"></div>` : ''}
        ${slice.map((r) => html`<div key=${r.key} data-key=${r.key} role="row" style=${tpl}
          className=${'bt-row o-' + r.origin + (virtual ? ' v' : '') + (onPick ? ' pickable' : '') + (pickedKey && pickedKey === r.key ? ' picked' : '')}
          title=${[r.name, r.inUse ? 'Equipada' : '', r.note].filter(Boolean).join(' · ')}
          tabIndex=${onPick ? (r.key === stopKey ? 0 : -1) : undefined}
          onKeyDown=${onPick ? (e) => onRowKey(e, r) : undefined}
          onClick=${onPick ? () => onPick(r) : undefined}
          onContextMenu=${onRowMenu ? (e) => onRowMenu(r, e) : undefined}>
          ${mark ? html`<span className=${'bt-f ' + stick.mark.cls} style=${stick.mark.style}>${r.markKey
            ? html`<${Checkbox} checked=${mark.isMarked(r)} onChange=${() => mark.onToggle(r)}
                label=${mark.isMarked(r) ? 'Desmarcar (sai da aba Principal)' : 'Marcar para comparar na aba Principal'} />`
            : ''}</span>` : ''}
          ${origin ? html`<span className=${'bt-f ' + stick.origin.cls + (r.inUse ? ' in-use' : '')} style=${stick.origin.style}><${OriginIcon} origin=${r.origin} /></span>` : ''}
          <span className=${'bt-f ' + stick.sets.cls} style=${stick.sets.style}><${Sets} icons=${r.setIcons} /></span>
          <span className=${'bt-f ' + stick.arq.cls} style=${stick.arq.style}
            title=${r.arche ? `${r.arche.name} · afinidade ${r.arche.score}%`
              : 'Perfil de stats não bate com nenhum arquétipo'}>
            ${r.arche ? html`<span className="ellipsis">${r.arche.name}</span>` : html`<span className="muted">${fmt.DASH}</span>`}
          </span>
          ${cols.map((c) => {
            const v = r.stats ? r.stats[c.k] : null;
            const bg = v == null ? null : theme.heatColor(Number(v), rg[c.k].min, rg[c.k].max);
            return html`<span key=${c.k} className="bt-c tnum" style=${bg ? { background: bg } : undefined}
              title=${`${c.label}: ${c.pct ? fmt.pct(v) : fmt.int(v)}`}>${cellText(c, v)}</span>`;
          })}
        </div>`)}
        ${virtual && to < shown.length ? html`<div className="bt-pad" style=${{ height: (shown.length - to) * ROW_H }} aria-hidden="true"></div>` : ''}
      </div>
    <//>
  <//>`;
}

/* memo: as abas re-renderizam a cada mudança do estado do app; a tabela (até
   3.000 linhas, virtual) só redesenha quando as props DELA mudam. Quem chama
   passa rows/mark/onPick memoizados. */
const BuildTable = React.memo(BuildTableView);

module.exports = { BuildTable };
