/*
 * boxes.js — as 4 caixas do topo da aba Comunidade:
 *   Construções  arquétipos das builds (clicar filtra as outras caixas)
 *   RTA          combos de set do RTA oficial: uso e vitória
 *   Estatísticas mediana + faixa (p25–p75) de cada stat
 *   Artefatos    os mais usados
 * Estatísticas e Artefatos seguem a construção selecionada (ou a base inteira).
 */
'use strict';
const { html } = require('../../h.js');
const { Box, Scrollable, SetIcon, StatIcon } = require('../../components/index.js');
const heroBonus = require('../../../lib/heroBonus.js');
const officialStats = require('../../../lib/officialStats.js');
const fmt = require('../../format.js');
const F = require('./filters.js');
const { ArtImg } = require('../top/ArtifactPicker.js');

function SetRow({ icons }) {
  const title = (icons || []).map((s) => `${s.set.replace(/Set$/, '')} ×${s.count}`).join(' + ') || 'sets variados';
  return html`<span className="cm-sets" title=${title}>
    ${(icons || []).length ? icons.map((s, i) => html`<${SetIcon} key=${i} set=${s.set} size=${16} title=${title} />`)
      : html`<span className="muted">sets variados</span>`}
  </span>`;
}

/* a média dos atributos que o arquétipo pretende, numa linha */
function intendedLine(g) {
  return (g.intended || []).map((e) => `${e.label} ${e.value == null || !isFinite(e.value) ? fmt.DASH : (e.pct ? fmt.pct(e.value) : fmt.compact(e.value))}`).join(' · ');
}

/*
 * Construções = arquétipos (F.archetypeGroups). Sem sets: nome, % no total e a
 * média dos atributos que o arquétipo pretende.
 *   1 clique  → as outras caixas passam a mostrar só esse arquétipo
 *   2 cliques → abre a aba Construções já filtrada nele
 * "Todas" volta ao conjunto inteiro.
 */
function Constructions({ groups, selected, onSelect, onOpen }) {
  return html`<${Box} className="cm-box">
    <div className="cm-hd"><span className="label">Construções</span><span className="sub">% das builds · 2 cliques abre a lista</span></div>
    <${Scrollable} className="cm-scroll">
      <div className="cm-cons">
        <button type="button" className=${'cm-con all' + (selected == null ? ' on' : '')} onClick=${() => onSelect(null)}>
          <span className="cm-con-top"><span className="ellipsis">Todas</span><b className="cm-pct tnum">100%</b></span>
        </button>
        ${groups.length ? groups.map((g) => html`<button type="button" key=${g.id}
          className=${'cm-con' + (selected === g.id ? ' on' : '')}
          title=${`${g.name}: ${g.count} builds · 2 cliques abre a lista`}
          onClick=${() => onSelect(g.id)} onDoubleClick=${() => onOpen(g.id)}>
          <span className="cm-con-top">
            <span className="ellipsis">${g.name}</span>
            <b className="cm-pct tnum">${fmt.dec1(g.share)}%</b>
          </span>
          <span className="cm-con-ks tnum">${intendedLine(g)}</span>
        </button>`) : ''}
      </div>
    <//>
  <//>`;
}

function Rta({ official, error, tier, loading }) {
  const tierLabel = (officialStats.TIERS.find((t) => t.code === tier) || {}).label || tier;
  // TODOS os combos: são exatamente os que o filtro da importação aceita
  // (communityBuilds.selectRows) — cortar em 6 escondia combos válidos da lista
  const rows = official && official.equip
    ? official.equip.slice().sort((a, b) => (b.usage || 0) - (a.usage || 0)) : [];
  return html`<${Box} className="cm-box">
    <div className="cm-hd">
      <span className="label">RTA</span>
      <span className="sub" title=${official ? `Tiers: ${(official.tiers || [official.grade]).join(', ')}` : ''}>
        ${official ? `${tierLabel}+ · amostra ${fmt.int(official.sampleSize)} · vitória ${fmt.dec1(official.winRate)}%` : ''}
      </span>
    </div>
    ${rows.length ? html`<div className="cm-tbl">
      <div className="cm-tr cm-th"><span>Sets</span><span className="r">Uso</span><span className="r">Vitória</span></div>
      ${rows.map((e, i) => html`<div key=${i} className="cm-tr">
        <${SetRow} icons=${F.officialSetIcons(e.sets)} />
        <span className="r tnum">${fmt.dec1(e.usage)}%</span>
        <span className=${'r tnum ' + ((e.winRate || 0) >= 50 ? 'win' : 'loss')}>${fmt.dec1(e.winRate)}%</span>
      </div>`)}
    </div>` : html`<span className="sub cm-none">${loading ? 'Lendo o RTA…' : (error ? `RTA oficial indisponível: ${error}` : `Sem dados do RTA (${tierLabel} pra cima) — use "RTA: Baixar".`)}</span>`}
  <//>`;
}

function Stats({ stats, scope }) {
  const rows = F.statRows(stats);
  const f = (r, v) => (v == null ? fmt.DASH : (r.pct ? fmt.pct(v) : fmt.compact(v)));
  return html`<${Box} className="cm-box">
    <div className="cm-hd"><span className="label">Estatísticas</span><span className="sub ellipsis">${scope}</span></div>
    <div className="cm-tbl">
      <div className="cm-tr cm-th st"><span>Stat</span><span className="r">Mediana</span><span className="r">Faixa</span></div>
      ${rows.map((r) => html`<div key=${r.k} className="cm-tr st" title=${`${r.label}: metade entre ${f(r, r.lo)} e ${f(r, r.hi)}`}>
        <span className="cm-stat"><${StatIcon} stat=${r.icon} size=${13} /><span className="ellipsis">${r.label}</span></span>
        <b className="r tnum">${f(r, r.median)}</b>
        <span className="r tnum sub">${f(r, r.lo)}–${f(r, r.hi)}</span>
      </div>`)}
    </div>
  <//>`;
}

/* Artefatos — os mais usados nas builds baixadas (segue o arquétipo selecionado) */
function Artifacts({ list, scope }) {
  const rows = (list || []).slice(0, 6);
  return html`<${Box} className="cm-box">
    <div className="cm-hd"><span className="label">Artefatos</span><span className="sub ellipsis">${scope}</span></div>
    ${rows.length ? html`<div className="cm-tbl">
      ${rows.map((a) => {
        const name = heroBonus.artifactByCode(a.code) || a.code;
        return html`<div key=${a.code} className="cm-tr art" title=${name}>
          <span className="cm-art"><${ArtImg} name=${name} code=${a.code} size=${24} /><span className="ellipsis">${name}</span></span>
          <b className="r tnum">${a.pct}%</b>
        </div>`;
      })}
    </div>` : ''}
  <//>`;
}

module.exports = { Constructions, Rta, Stats, Artifacts, SetRow, intendedLine };
