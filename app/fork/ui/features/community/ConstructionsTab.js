/*
 * ConstructionsTab — a aba Construções: filtros + a lista das builds públicas
 * (as da conta — equipada, salvas — ficam só na Principal).
 *   filtros: Arquétipo · Set 1 · Set 2 · Set 3
 *   lista: ocupa o resto da tela; "Marcar" leva a build para a Principal e para
 *          a caixa de recomendações do Otimizador; clicar na linha mostra no topo.
 * Dois cliques num arquétipo da aba Estatísticas abrem esta aba já filtrada
 * (app.openConstructions → app.consPreset).
 */
'use strict';
const { html, useState, useMemo, useEffect } = require('../../h.js');
const { Button, Dropdown, SetIcon, Glyph } = require('../../components/index.js');
const { BuildTable } = require('../builds/BuildTable.js');
const buildRows = require('../builds/buildRows.js');
const { pickHandler } = require('../builds/pick.js');
const { useCommunity, missing, downloadWarn } = require('./useCommunity.js');
const F = require('./filters.js');

const SET_OPTS = F.setOptions().map((o) => Object.assign({}, o, { icon: html`<${SetIcon} set=${o.value} size=${15} />` }));

function Filters({ f, onChange, archeOpts, shown, total }) {
  const set = (patch) => onChange(Object.assign({}, f, patch));
  const pick1 = (k) => (v) => set({ [k]: v === f[k] ? null : v });
  const any = f.arche || f.set1 || f.set2 || f.set3;
  return html`<div className="cm-filters">
    <${Dropdown} placeholder="Arquétipo" options=${archeOpts} value=${f.arche} onChange=${pick1('arche')} />
    <${Dropdown} placeholder="Set 1" options=${SET_OPTS} value=${f.set1} onChange=${pick1('set1')} />
    <${Dropdown} placeholder="Set 2" options=${SET_OPTS} value=${f.set2} onChange=${pick1('set2')} />
    <${Dropdown} placeholder="Set 3" options=${SET_OPTS} value=${f.set3} onChange=${pick1('set3')} />
    ${any ? html`<${Button} variant="ghost" onClick=${() => onChange(F.EMPTY)}>
      <${Glyph} name="close" size=${12} /> Limpar<//>` : ''}
    <span className="sub cm-hint">
      ${shown === total ? `${total} builds` : `${shown} de ${total} builds`}
    </span>
  </div>`;
}

function ConstructionsTab({ hero }) {
  const c = useCommunity(hero);
  const { app, summary, official, computed } = c;
  const preset = app.consPreset && app.consPreset.heroName === hero.name ? app.consPreset.arche : null;
  const [f, setF] = useState(() => Object.assign({}, F.EMPTY, { arche: preset }));
  // veio de "2 cliques" na aba Estatísticas: aplica e consome o pedido
  useEffect(() => {
    if (preset !== null && app.consPreset) { setF(Object.assign({}, F.EMPTY, { arche: preset })); app.clearConsPreset(); }
  }, [preset]);

  const all = useMemo(() => buildRows.publicRows(app.accountHero(hero.name), hero.name, app.account.itemsById, summary, official, computed),
    [hero.name, app.account.itemsById, summary, official, computed]);
  const archeOpts = useMemo(() => F.archeOptions(all), [all]);
  const rows = useMemo(() => F.applyFilters(all, f), [all, f]);

  // estáveis para o BuildTable (memo) não redesenhar à toa
  const mark = useMemo(() => ({
    isMarked: (r) => app.isMarked(hero.name, r.markKey),
    onToggle: (r) => app.toggleMark(hero.name, r),
  }), [hero.name, app.marks]);
  const onPick = useMemo(() => pickHandler(app, hero), [hero.name]);

  const miss = missing(c, hero);
  if (miss) return miss;

  return html`<section className="cn">
    ${downloadWarn(c)}
    <${Filters} f=${f} onChange=${setF} archeOpts=${archeOpts} shown=${rows.length} total=${all.length} />
    ${computed && computed.error ? html`<div className="cm-warn">Colunas calculadas (CP, danos, S1–S3, BS) indisponíveis: ${computed.error}</div>` : ''}
    <${BuildTable} rows=${rows} mark=${mark} showOrigin=${false} empty="Nenhuma build com esses filtros."
      onPick=${onPick} pickedKey=${app.target && app.target.row.key} />
  </section>`;
}

module.exports = { ConstructionsTab };
