/*
 * InterestCard — quem quer esta peça (só quem passa do CORTE; regra e limite em lib/interest.js split):
 *
 *   Peça  SS 83%                          score 99
 *   ARQUÉTIPOS · 1
 *   [símbolo] Tanque                  S 74%   ≥60
 *   FAVORITOS · 1
 *   [retrato] Arbiter Vildred         A 66%   ≥60
 *   EQUIPÁVEIS · 1
 *   [retrato] Emilia · Tanque         S 74%   ≥60   (mesmas barras do arquétipo)
 *   OUTROS · 1                                        (completam o limite de heróis)
 *
 * Subdivisão sem ninguém não aparece; nada em lista nenhuma = em branco.
 * Cada linha: rank e % da peça PARA ele (barras dele) e o corte dele (≥N).
 *   InterestCard  — o cartão flutuante (hover da bolinha na tabela)
 *   InterestList  — uma das listas, reusada no painel da peça (com clique: onPick(linha))
 *   HeroLists     — Favoritos · Equipáveis · Outros, cada uma com o seu subtítulo (painel e cartão)
 *   InterestSplit — o corpo do cartão sem o cabeçalho da peça (usado também no painel do up em lote)
 * `trendOf(x)` (opcional) → número: ▲/▼ do último up para aquele perfil (up em lote).
 */
'use strict';
const { html } = require('../../h.js');
const { RankBadge, ArchetypeSymbol, Portrait, Delta } = require('../../components/index.js');
const itemRank = require('../../../lib/itemRank.js');
const interest = require('../../../lib/interest.js');

function Line({ x, kind, codeOf, onPick, on, trendOf }) {
  const p = x.p;
  const name = kind === 'a' ? p.name : x.name;
  const via = kind === 'h' && x.via ? x.via.name : null;
  const cls = 'ic-row' + (x.ok ? '' : ' below') + (onPick ? ' act' : '') + (on ? ' on' : '') + (trendOf ? ' tr' : '');
  const t = trendOf ? trendOf(x) : null;
  const body = html`<span className="contents">
    ${kind === 'a' ? html`<${ArchetypeSymbol} symbol=${p.symbol} size=${20} />` : html`<${Portrait} code=${codeOf(name)} size=${20} />`}
    <span className="ic-name ellipsis">${name}${via ? html`<span className="ic-extra"> · ${via}</span>` : ''}</span>
    <${Delta} v=${x.pct}><${RankBadge} rank=${itemRank.rankFor(x.pct)} /><//>
    <${Delta} v=${x.pct}><b className="ic-pct tnum">${itemRank.pctInt(x.pct)}%</b><//>
    ${trendOf ? html`<span className=${'ub-trend' + (t == null ? '' : t > 0 ? ' up' : ' down')}>${t == null ? '' : t > 0 ? '▲' : '▼'}</span>` : ''}
    <span className="ic-min tnum" title=${p.ownMin ? 'Régua própria' : 'Régua herdada'}>≥${p.min}</span>
  </span>`;
  const tip = via ? `${name}: mesmas barras do arquétipo ${via}` : undefined;
  if (!onPick) return html`<div className=${cls} title=${tip}>${body}</div>`;
  return html`<button type="button" className=${cls} title=${tip || (kind === 'a' ? `Abrir o arquétipo ${name}` : `Abrir o Otimizador de ${name}`)}
    onClick=${() => onPick(x)}>${body}</button>`;
}

const NONE = html`<div className="ic-none" aria-label="ninguém"></div>`;

/* `rows` = split(...).arch | .fav | .eq | .outros (já só quem passa do corte, do maior para o menor) */
function InterestList({ kind, rows, codeOf, onPick, activeKey, trendOf }) {
  const keyOf = (x) => (kind === 'a' ? x.p.id : 'h:' + x.name);
  return html`<div className="ic-list">
    ${rows.length ? rows.map((x) => html`<${Line} key=${keyOf(x)} x=${x} kind=${kind} codeOf=${codeOf} onPick=${onPick} on=${activeKey === keyOf(x)} trendOf=${trendOf} />`) : NONE}
  </div>`;
}

/* Favoritos · Equipáveis · Outros; subdivisão vazia some */
function HeroLists({ s, codeOf, onPick, activeKey, trendOf }) {
  const secs = [['Favoritos', s.fav], ['Equipáveis', s.eq], ['Outros', s.outros]].filter(([, rows]) => rows.length);
  if (!secs.length) return NONE;
  return html`<span className="contents">
    ${secs.map(([title, rows]) => html`<span className="contents" key=${title}>
      <div className="ic-sec">${title} · ${rows.length}</div>
      <${InterestList} kind="h" rows=${rows} codeOf=${codeOf} onPick=${onPick} activeKey=${activeKey} trendOf=${trendOf} />
    </span>`)}
  </span>`;
}

function InterestCard({ item, profiles, codeOf }) {
  const pot = itemRank.potentialOf(item);
  const score = itemRank.scoreOf(item);
  return html`<div className="ic">
    <div className="ic-head">
      <span className="ic-cap">Peça</span>
      ${pot == null ? html`<span className="muted">—</span>`
        : html`<span className="contents"><${RankBadge} rank=${itemRank.rankFor(pot)} /><b className="tnum">${itemRank.pctInt(pot)}%</b></span>`}
      <span className="spacer"></span>
      <span className="ic-cap">score ${score == null ? '—' : score}</span>
    </div>
    <${InterestSplit} item=${item} profiles=${profiles} codeOf=${codeOf} />
  </div>`;
}

function InterestSplit({ item, profiles, codeOf, trendOf }) {
  const s = interest.split(item, profiles);
  return html`<span className="contents">
    ${s.arch.length ? html`<span className="contents"><div className="ic-sec">Arquétipos · ${s.arch.length}</div>
      <${InterestList} kind="a" rows=${s.arch} codeOf=${codeOf} trendOf=${trendOf} /></span>` : ''}
    ${s.heroes.length ? html`<${HeroLists} s=${s} codeOf=${codeOf} trendOf=${trendOf} />` : ''}
    ${!s.arch.length && !s.heroes.length ? NONE : ''}
  </span>`;
}

module.exports = { InterestCard, InterestSplit, InterestList, HeroLists };
