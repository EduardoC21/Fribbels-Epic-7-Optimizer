/*
 * app.js — janela "Comunidade" (fork). React (require, sem build) + htm.
 * Abas: "Heróis" (relevantes + comunidade/oficial + arquétipo & ajuste fino) e
 * "Arquétipos" (criar/editar presets de personagem).
 */
'use strict';
const React = require('react');
const ReactDOM = require('react-dom');
const html = require('./vendor/htm.js').bind(React.createElement);
const { useState, useMemo, useEffect } = React;

const heroList = require('./lib/heroList.js');
const relevance = require('./lib/relevance.js');
const community = require('./lib/communityBuilds.js');
const official = require('./lib/officialStats.js');
const arche = require('./lib/archetypes.js');
const gameData = require('./lib/gameData.js');
const assets = require('./lib/assets.js');
const backend = require('./lib/backend.js');
const statInfo = require('./lib/statInfo.js');
const itemStats = require('./lib/itemStats.js');
const heroBonus = require('./lib/heroBonus.js');
const buildsList = require('./lib/buildsList.js');
const gameConstants = require('./lib/gameConstants.js');
const targetBuild = require('./lib/targetBuild.js');
const archeDetect = require('./lib/archeDetect.js');

const ALL_SETS = gameData.setNames(); // fonte viva (constants.js) — blindado p/ set novo
const setShort = (s) => s.replace(/Set$/, '');
const uniq = (arr) => [...new Set(arr)].filter(Boolean).sort();
const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
// ordem do jogo (mais intuitiva que alfabética)
const ELEMENT_ORDER = ['fire', 'ice', 'wind', 'light', 'dark'];        // Fogo, Água, Terra, Luz, Trevas
const CLASS_ORDER = ['warrior', 'knight', 'assassin', 'ranger', 'mage', 'manauser']; // Guerreiro, Cavaleiro, Ladrão, Arqueiro, Mago, Tecelalmas
const ordered = (present, order) => order.filter((x) => present.includes(x)).concat(present.filter((x) => !order.includes(x)));
const range = (s) => (s ? `${s.p25}–${s.p75}` : '—');
const deep = (o) => JSON.parse(JSON.stringify(o));

// garante os 8 stats no perfil (com priority/target)
function normalizeStats(stats) {
  const out = {};
  for (const k of arche.STAT_KEYS) {
    const s = (stats && stats[k]) || {};
    out[k] = { priority: s.priority || 0, target: s.target == null ? null : s.target };
  }
  return out;
}

// -------------------- barra de stat (prioridade 0-10 + alvo) --------------------
function StatBar({ sk, v, onChange }) {
  const [tmin, tmax, tstep] = arche.TARGET_RANGE[sk];
  const set = (patch) => onChange({ ...v, ...patch });
  return html`<div className=${'statbar' + (v.priority ? '' : ' prio-0')}>
    <span className="lbl">${arche.STAT_LABELS[sk]}</span>
    <input type="range" min="0" max="10" step="1" value=${v.priority}
      onInput=${(e) => set({ priority: parseInt(e.target.value, 10) })} />
    <input type="number" min="0" max="10" step="1" value=${v.priority}
      onChange=${(e) => set({ priority: Math.max(0, Math.min(10, parseInt(e.target.value, 10) || 0)) })} />
    <input type="range" min=${tmin} max=${tmax} step=${tstep} value=${v.target == null ? tmin : v.target}
      onInput=${(e) => set({ target: parseInt(e.target.value, 10) || null })} />
    <input type="number" min=${tmin} max=${tmax} step=${tstep} placeholder="alvo"
      value=${v.target == null ? '' : v.target}
      onChange=${(e) => set({ target: e.target.value === '' ? null : (parseInt(e.target.value, 10)) })} />
  </div>`;
}
function StatBarsHeader() {
  return html`<div className="statbar noborder">
    <span className="cap">stat</span><span className="cap">prioridade (0–10)</span><span className="cap"></span>
    <span className="cap">alvo (valor)</span><span className="cap"></span>
  </div>`;
}
function StatBars({ stats, onChange }) {
  const s = normalizeStats(stats);
  return html`<div>
    <${StatBarsHeader} />
    ${arche.STAT_KEYS.map((k) => html`<${StatBar} key=${k} sk=${k} v=${s[k]}
      onChange=${(nv) => onChange({ ...s, [k]: nv })} />`)}
  </div>`;
}
// sets se escolhem pelo ÍCONE do jogo (é assim que se reconhece um set), com o
// nome ao lado; o número de peças exigido vem do upstream, não é chutado aqui.
function SetChips({ selected, onToggle }) {
  const sel = new Set(selected || []);
  return html`<div className="setchips">
    ${ALL_SETS.map((s) => html`<span key=${s} className=${'setchip' + (sel.has(s) ? ' on' : '')}
      title=${`${setShort(s)} — ${gameConstants.piecesRequired(s)} peças`}
      onClick=${() => onToggle(s)}><img src=${assets.setIcon(s)} alt="" />${setShort(s)}</span>`)}
  </div>`;
}

// -------------------- comunidade / oficial (já existentes) --------------------
function StatGrid({ stats }) {
  return html`<div className="statgrid">
    ${community.STAT_FIELDS.map(([f, label]) => html`<div className="stat" key=${f}>
      <div className="k">${label}</div>
      <div className="v">${range(stats[f])}<span className="muted-inline"> · máx ${stats[f] ? stats[f].max : '—'}</span></div>
    </div>`)}
  </div>`;
}
function OfficialCard({ off }) {
  if (!off) return null;
  if (off.__error) return html`<div className="card"><h2>RTA oficial</h2><span className="err">${off.__error}</span></div>`;
  const byWin = [...(off.equip || [])].sort((a, b) => b.winRate - a.winRate);
  return html`<div className="card">
    <h2>RTA oficial — ${off.grade} <span className="sub">(win rate real)</span></h2>
    <div className="sub">amostra: ${off.sampleSize || '?'} · WR do herói: ${off.winRate}% · rank ${off.rank}</div>
    <table className="rta-table">
      <thead><tr><th>set</th><th>uso %</th><th>win rate %</th></tr></thead>
      <tbody>${byWin.slice(0, 8).map((e, i) => html`<tr key=${i}>
        <td>${e.combo}</td><td>${e.usage}</td>
        <td className="wr-strong" style=${{ color: e.winRate >= 52 ? '#8fd06f' : e.winRate >= 49 ? '#e2e2e2' : '#e0a0a0' }}>${e.winRate}</td>
      </tr>`)}</tbody>
    </table>
  </div>`;
}

// -------------------- dois blocos de stats lado a lado (estilo painel do jogo) --------------------
// ---- 3 caixas quadradas (Imprint / Artefato / EE) à esquerda dos stats ----
function ArtImg({ code, name, cls }) {
  const primary = heroBonus.artifactIcon(code);
  const fb = heroBonus.artifactIconFallback(name);
  if (!primary && !fb) return null;
  return html`<img className=${cls} src=${primary || fb} alt="" loading="lazy"
    onError=${(e) => {
      if (!e.target.dataset.fb && fb && e.target.src !== fb) { e.target.dataset.fb = '1'; e.target.src = fb; }
      else { e.target.style.display = 'none'; }
    }} />`;
}

/*
 * Stepper — UM componente só para os três bônus (imprint, artefato e EE), como o
 * Eduardo pediu: mesmo padrão nos três, setas próprias (nada de spinner do Windows)
 * e passos DISCRETOS (o EE anda de 1 em 1, nunca em valor quebrado).
 * `items` é a lista de valores possíveis; navegamos pelo índice.
 */
function Stepper({ items, index, disabled, onChange, render, title }) {
  const i = Math.max(0, Math.min(items.length - 1, index));
  const go = (d) => (e) => {
    e.stopPropagation();
    const n = Math.max(0, Math.min(items.length - 1, i + d));
    if (n !== i) onChange(items[n], n);
  };
  return html`<div className="stepper" title=${title} onClick=${(e) => e.stopPropagation()}>
    <button className="steparrow" disabled=${disabled || i <= 0} onClick=${go(-1)}>◀</button>
    <span className="stepval">${render(items[i], i)}</span>
    <button className="steparrow" disabled=${disabled || i >= items.length - 1} onClick=${go(1)}>▶</button>
  </div>`;
}

/*
 * As 3 caixinhas. Em build da conta elas GRAVAM (onSave). Em build da comunidade/pro
 * entram em modo `locked`: começam no MÁXIMO (que é o que o cálculo assume) e o que
 * você mexer é apenas SIMULAÇÃO — recalcula o painel da direita e não toca na conta.
 */
function BonusSquares({ heroName, accountHero, onSave, onPickArtifact, saving, simulated }) {
  const art = heroBonus.artifact(accountHero);
  const eeI = heroBonus.ee(heroName, accountHero);
  const impI = heroBonus.imprint(heroName, accountHero);

  // imprint: nenhum + os graus do herói, do menor pro maior
  const impGrades = impI ? Object.keys(impI.grades).sort((a, b) => impI.grades[a] - impI.grades[b]) : [];
  const impItems = [null].concat(impGrades);
  const impIndex = impI && impI.grade ? impItems.indexOf(impI.grade) : 0;

  // artefato: 0..30
  const lvlItems = Array.from({ length: heroBonus.ARTIFACT_MAX_LEVEL + 1 }, (_, n) => n);
  const lvlIndex = art ? Math.max(0, Math.min(30, Math.round(art.level || 0))) : 0;

  // EE: nenhum + inteiros de base até o máximo
  const eeItems = eeI
    ? [null].concat(Array.from({ length: Math.round(eeI.max) - Math.round(eeI.base) + 1 }, (_, n) => Math.round(eeI.base) + n))
    : [null];
  const eeIndex = eeI && eeI.value != null ? Math.max(0, eeItems.indexOf(Math.round(eeI.value))) : 0;

  return html`<div className=${'bonuscol' + (simulated ? ' simulated' : '')}>
    <div className="bsq">
      <div className="bsqhdr">Imprint${simulated ? html`<span className="simtag" title="Simulação — não grava na sua conta">sim</span>` : ''}</div>
      <div className="bsqart">
        ${impI && impI.grade ? html`<span className=${'impbadge g-' + impI.grade.toLowerCase()}>${impI.grade}</span>`
          : html`<span className="bsqnone">—</span>`}
      </div>
      ${impI ? html`<${Stepper} items=${impItems} index=${impIndex} disabled=${saving}
        title="Grau do imprint"
        onChange=${(g) => onSave({ imprintValue: g == null ? null : impI.grades[g] })}
        render=${(g) => (g == null ? 'sem imprint' : `${g} · ${heroBonus.fmt(impI.pct, impI.grades[g])}`)} />`
        : html`<div className="bsqval"><span className="off">—</span></div>`}
    </div>

    <div className="bsq">
      <div className="bsqhdr">Artefato
        <button className="bsqarrow" title="Trocar artefato" disabled=${saving}
          onClick=${(e) => { e.stopPropagation(); onPickArtifact(); }}>⇄</button>
      </div>
      <div className="bsqart">
        ${art ? html`<${ArtImg} code=${art.code} name=${art.name} cls="bsqimg" />` : html`<span className="bsqnone">—</span>`}
      </div>
      ${art ? html`<span className="bcontents">
        <span className="bsqname" title=${art.name}>${art.name}</span>
        <${Stepper} items=${lvlItems} index=${lvlIndex} disabled=${saving}
          title="Nível do artefato (0 a 30)"
          onChange=${(lv) => onSave({ artifactName: art.name, artifactLevel: lv })}
          render=${(lv) => `+${lv}`} />
        <span className="bsqstats">
          ${art.attack ? html`<span className="bsqstat"><img className="bsi" src=${assets.statIcon('atk')} alt="" />${heroBonus.fmt(false, art.attack)}</span>` : ''}
          ${art.health ? html`<span className="bsqstat"><img className="bsi" src=${assets.statIcon('hp')} alt="" />${heroBonus.fmt(false, art.health)}</span>` : ''}
          ${art.defense ? html`<span className="bsqstat"><img className="bsi" src=${assets.statIcon('def')} alt="" />${heroBonus.fmt(false, art.defense)}</span>` : ''}
        </span></span>` : html`<div className="bsqval"><span className="off">sem artefato</span></div>`}
    </div>

    <div className="bsq">
      <div className="bsqhdr">EE</div>
      <div className="bsqart">
        ${eeI ? html`<span className="bsqstat big">
          ${eeI.info.icon ? html`<img className="bsi" src=${assets.statIcon(eeI.info.icon)} alt="" />` : ''}
          ${eeI.info.short}</span>` : html`<span className="bsqnone">—</span>`}
      </div>
      ${eeI ? html`<${Stepper} items=${eeItems} index=${eeIndex} disabled=${saving}
        title=${`Bônus do EE (${Math.round(eeI.base)} a ${Math.round(eeI.max)})`}
        onChange=${(v) => onSave({ eeValue: v })}
        render=${(v) => (v == null ? 'nenhum' : heroBonus.fmt(eeI.pct, v))} />`
        : html`<div className="bsqval"><span className="off">não tem</span></div>`}
    </div>
  </div>`;
}

// ---- lista de builds (equipada + salvas + comunidade + pros) ----
const isPct = (k) => buildsList.PCT_COLS.has(k);
const fmtCell = (k, v) => (v == null || isNaN(v) ? '\u2014' : (isPct(k) ? Math.round(v) + '%' : Math.round(v).toLocaleString('pt-BR')));

// gradiente de intensidade igual ao do otimizador: vermelho (pior) -> neutro -> verde (melhor)
function intensityColor(t) {
  const lo = [90, 26, 6], mid = [45, 50, 59], hi = [56, 130, 31];
  const mix = (x, y, u) => Math.round(x + (y - x) * u);
  const c = t < 0.5
    ? lo.map((x, i) => mix(x, mid[i], t / 0.5))
    : mid.map((x, i) => mix(x, hi[i], (t - 0.5) / 0.5));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}
// min/max por coluna sobre as linhas exibidas (base do gradiente)
function columnStats(rows) {
  const agg = {};
  for (const [k] of buildsList.COLUMNS) {
    const vals = rows.map((r) => r.stats && r.stats[k]).filter((v) => v != null && !isNaN(v));
    if (vals.length > 1) agg[k] = { min: Math.min(...vals), max: Math.max(...vals) };
  }
  return agg;
}

// ícones dos sets (usa os assets, nunca o nome cru)
function SetIcons({ icons }) {
  if (!icons || !icons.length) return null;
  return html`<span className="bseticons">
    ${icons.map((s, i) => html`<span className="bseti" key=${i} title=${`${s.set.replace(/Set$/, '')} (${s.count})`}>
      <img src=${assets.setIcon(s.set)} alt="" />${s.count ? html`<b>${s.count}</b>` : ''}</span>`)}
  </span>`;
}

function BuildRow({ row, selected, agg, onSelect }) {
  const o = buildsList.ORIGINS[row.origin];
  return html`<div className=${'brow2' + (selected ? ' on' : '')} onClick=${() => onSelect(row)} title=${row.note}>
    <span className=${'oico ' + o.cls} title=${o.label}>${o.icon}</span>
    <span className="bsets"><${SetIcons} icons=${row.setIcons} /></span>
    <span className="bcell pctcol" title="Uso na comunidade / RTA">${row.share != null ? row.share + '%' : (row.usage != null ? row.usage + '%' : '\u2014')}</span>
    <span className="bcell pctcol wr" title="Win rate real (RTA oficial)">${row.winRate != null ? row.winRate + '%' : '\u2014'}</span>
    <span className="bcell arqcol"
      title=${row.arq ? `${row.arq.name} - ${row.arq.score}% de semelhanca com o perfil deste arquetipo` : "Nenhum arquetipo reconhecido nestas estatisticas"}>
      ${row.arq ? row.arq.name : "—"}</span>
    ${buildsList.COLUMNS.map(([k]) => {
      const v = row.stats ? row.stats[k] : null;
      const a = agg[k];
      const style = (a && v != null && a.max > a.min)
        ? { backgroundColor: intensityColor((v - a.min) / (a.max - a.min)) } : undefined;
      return html`<span className="bcell" key=${k} style=${style}>${fmtCell(k, v)}</span>`;
    })}
  </div>`;
}

function BuildsList({ rows: rawRows, selectedKey, onSelect, filters, onToggleFilter, archetypes, arqFilter, onArqFilter }) {
  const keys = Object.keys(buildsList.ORIGINS);
  const [sort, setSort] = useState({ key: null, dir: -1 });
  const [setFilter, setSetFilter] = useState('');

  const baseAgg = columnStats(rawRows.filter((r) => r.stats));
  // arquétipo detectado pelas ESTATÍSTICAS (sets não definem arquétipo)
  const rows = useMemo(() => rawRows.map((r) => Object.assign({}, r, {
    arq: archeDetect.detect(r.stats, archetypes, baseAgg),
  })), [rawRows, archetypes]);

  const counts = {}; keys.forEach((k) => { counts[k] = rows.filter((r) => r.origin === k).length; });
  const arqNames = [...new Set(rows.map((r) => r.arq && r.arq.name).filter(Boolean))].sort();
  // sets presentes nas builds, para filtrar pelos ASSETS
  const setNames = [...new Set(rows.flatMap((r) => (r.setIcons || []).map((s) => s.set)))].sort();

  const passArq = (r) => !arqFilter || (arqFilter === 'none' ? !r.arq : (r.arq && r.arq.name === arqFilter));
  const passSet = (r) => !setFilter || (r.setIcons || []).some((s) => s.set === setFilter);

  const equipped = rows.find((r) => r.origin === 'equipped');
  let rest = rows.filter((r) => r.origin !== 'equipped' && filters[r.origin] && passArq(r) && passSet(r));

  // ordenação: clique no cabeçalho alterna maior→menor, menor→maior, sem ordem
  if (sort.key) {
    const val = (r) => {
      if (sort.key === 'usage') return r.usage;
      if (sort.key === 'winRate') return r.winRate;
      if (sort.key === 'arq') return r.arq ? r.arq.name : null;
      return r.stats ? r.stats[sort.key] : null;
    };
    rest = [...rest].sort((a, b) => {
      const av = val(a); const bv = val(b);
      if (av == null && bv == null) return 0;
      if (av == null) return 1;           // sem valor sempre no fim
      if (bv == null) return -1;
      if (typeof av === 'string') return av.localeCompare(bv) * sort.dir * -1;
      return (av - bv) * sort.dir;
    });
  }
  const agg = baseAgg;

  const toggleSort = (k) => setSort((s) => (s.key !== k
    ? { key: k, dir: -1 }
    : (s.dir === -1 ? { key: k, dir: 1 } : { key: null, dir: -1 })));
  const arrow = (k) => (sort.key === k ? (sort.dir === -1 ? ' ▼' : ' ▲') : '');
  const hcell = (k, lbl, extra) => html`<span className=${'bcell sortable' + (extra || '') + (sort.key === k ? ' sorted' : '')}
    key=${k} onClick=${() => toggleSort(k)} title=${`Ordenar por ${lbl}`}>${lbl}${arrow(k)}</span>`;

  const head = html`<div className="buildshead">
    <span className="oico ghost"></span>
    <span className="bsets">sets</span>
    ${hcell('usage', 'uso', ' pctcol')}
    ${hcell('winRate', 'wr', ' pctcol')}
    ${hcell('arq', 'arquétipo', ' arqcol')}
    ${buildsList.COLUMNS.map(([k, lbl]) => hcell(k, lbl))}
  </div>`;

  return html`<div className="buildsmain">
    <div className="buildsbar">
      ${keys.filter((k) => k !== 'equipped').map((k) => html`<button key=${k}
        className=${'oico btnico ' + buildsList.ORIGINS[k].cls + (filters[k] ? ' on' : '')}
        onClick=${() => onToggleFilter(k)} title=${`${buildsList.ORIGINS[k].label} (${counts[k]})`}>
        ${buildsList.ORIGINS[k].icon}<b>${counts[k]}</b></button>`)}
      <span className="bardiv"></span>
      ${setNames.map((sn) => html`<button key=${sn} className=${'setfilter' + (setFilter === sn ? ' on' : '')}
        onClick=${() => setSetFilter(setFilter === sn ? '' : sn)} title=${sn.replace(/Set$/, '')}>
        <img src=${assets.setIcon(sn)} alt="" /></button>`)}
      <span className="fspacer"></span>
      <select className="arqsel" value=${arqFilter || ''} onChange=${(e) => onArqFilter(e.target.value)}
        title="Filtrar pelo arquétipo detectado nas estatísticas">
        <option value="">arquétipo: todos</option>
        <option value="none">sem arquétipo</option>
        ${arqNames.map((n) => html`<option key=${n} value=${n}>${n}</option>`)}
      </select>
      <span className="bcount">${rest.length + (equipped ? 1 : 0)}</span>
    </div>
    <div className="buildsscroll">
      <div className="buildsgrid">
        ${head}
        ${equipped ? html`<div className="pinned"><${BuildRow} row=${equipped} agg=${agg}
          selected=${selectedKey === equipped.key} onSelect=${onSelect} /></div>` : ''}
        ${rest.map((r) => html`<${BuildRow} key=${r.key} row=${r} agg=${agg}
          selected=${selectedKey === r.key} onSelect=${onSelect} />`)}
        ${rest.length === 0 && !equipped ? html`<div className="empty small">Nenhuma build com estes filtros.</div>` : ''}
      </div>
    </div>
  </div>`;
}

// ---- painel lateral fixo: arquétipo + média da comunidade + tipos de build ----
// colunas mostradas na mediana da comunidade (o cluster só agrega estes 8)
const MEDIAN_COLS = [['spd', 'SPD', 'spd'], ['atk', 'ATK', 'atk'], ['hp', 'HP', 'hp'], ['def', 'DEF', 'def'],
  ['cr', 'CC', 'chc'], ['cd', 'CD', 'chd'], ['eff', 'EFF', 'eff'], ['res', 'RES', 'efr']];
function CommunityMedian({ row }) {
  if (!row || !row.ranges) return null;
  return html`<div className="sidesec">
    <div className="sidehdr">Mediana da comunidade <span className="hint">${row.name}</span></div>
    <div className="sub">Mediana (p50) e faixa típica (p25–p75) das builds deste perfil.</div>
    ${MEDIAN_COLS.map(([k, lbl, icon]) => { const r = row.ranges[k]; if (!r) return '';
      return html`<div className="medrow" key=${k}>
        <img className="bsi" src=${assets.statIcon(icon)} alt="" />
        <span className="medlbl">${lbl}</span>
        <span className="medval">${isPct(k) ? Math.round(row.stats[k]) + '%' : Math.round(row.stats[k]).toLocaleString('pt-BR')}</span>
        <span className="medrange">${Math.round(r.lo)}–${Math.round(r.hi)}</span>
      </div>`; })}
  </div>`;
}

function BuildTypes({ list, onPick }) {
  if (!list.length) return null;
  return html`<div className="sidesec">
    <div className="sidehdr">Tipos de build</div>
    <div className="sub">Perfis distintos que a comunidade joga com este herói.</div>
    ${list.map((t, i) => html`<div className="typerow" key=${i} onClick=${() => onPick && onPick(i)}>
      <span className="typeshare">${t.share}%</span>
      <span className="bcontents">
        <span className="typenm">${t.name}</span>
        <span className="typemeta">SPD ${Math.round(t.spd)} · CC ${Math.round(t.cr)}% · CD ${Math.round(t.cd)}%${t.sets[0] ? ' · ' + t.sets[0] : ''}</span>
      </span>
    </div>`)}
  </div>`;
}

// artefatos mais usados pela comunidade neste perfil de build
function ArtifactUsage({ row }) {
  const arts = (row && row.cluster && row.cluster.artifacts) || [];
  if (!arts.length) return null;
  return html`<div className="sidesec">
    <div className="sidehdr">Artefatos mais usados <span className="hint">${row.name}</span></div>
    ${arts.map((a, i) => {
      const nm = heroBonus.artifactByCode(a.code);
      return html`<div className="artuse" key=${i}>
        <${ArtImg} code=${a.code} name=${nm} cls="artico" />
        <span className="artnm">${nm || a.code}</span>
        <span className="artpct">${a.pct}%</span>
      </div>`;
    })}
  </div>`;
}

/*
 * OptimizerPanel — a aba "Otimizador": as especificações técnicas do herói, no
 * mesmo espírito da aba Optimizer do app clássico. Ocupa a linha inteira e traz,
 * em cada linha de stat:
 *   prioridade (0–10) · mínimo · máximo · REFERÊNCIA da comunidade (p50 e faixa)
 * A referência fica colada ao controle de propósito: é assim que se sabe se o
 * intervalo escolhido é adequado, sem ter que olhar outra tabela.
 */
const OPT_STATS = [
  ['atk', 'Ataque', 'atk', 'atk'], ['hp', 'Vida', 'hp', 'hp'], ['def', 'Defesa', 'def', 'def'],
  ['spd', 'Velocidade', 'spd', 'spd'], ['chc', 'Chance Crítica', 'chc', 'cr'], ['chd', 'Dano Crítico', 'chd', 'cd'],
  ['eff', 'Eficácia', 'eff', 'eff'], ['efr', 'Resistência', 'efr', 'res'],
];
const ACC_MAINS = {
  Necklace: ['CriticalHitChancePercent', 'CriticalHitDamagePercent', 'AttackPercent', 'HealthPercent', 'DefensePercent'],
  Ring: ['EffectivenessPercent', 'EffectResistancePercent', 'AttackPercent', 'HealthPercent', 'DefensePercent'],
  Boots: ['Speed', 'AttackPercent', 'HealthPercent', 'DefensePercent'],
};
const MAIN_SHORT = (m) => (m || '').replace('CriticalHitChancePercent', 'CC%').replace('CriticalHitDamagePercent', 'CD%')
  .replace('AttackPercent', 'ATK%').replace('HealthPercent', 'HP%').replace('DefensePercent', 'DEF%')
  .replace('EffectivenessPercent', 'EFF%').replace('EffectResistancePercent', 'RES%').replace('Speed', 'SPD');
const SLOT_PT2 = { Necklace: 'Colar', Ring: 'Anel', Boots: 'Bota' };

function OptimizerPanel({ hero, profile, archetypes, accountHero, reference, onApply, onChange }) {
  const [sent, setSent] = useState('');
  const p = profile;
  const st = (k) => (p && p.stats && p.stats[k]) || { priority: 0 };
  const setStat = (k, patch) => onChange({ ...p, stats: { ...((p && p.stats) || {}), [k]: { ...st(k), ...patch } } });
  const num = (v) => (v === '' || v == null ? '' : v);
  const minOf = (v) => (v.min != null && v.min !== '' ? v.min : (v.target != null ? v.target : ''));

  const ranges = {};
  if (p && p.stats) {
    OPT_STATS.forEach(([ak, , , ok]) => {
      const v = p.stats[ak] || {};
      const mn = minOf(v);
      if (mn !== '' && mn != null) ranges[ok] = Object.assign(ranges[ok] || {}, { min: mn });
      if (v.max != null && v.max !== '') ranges[ok] = Object.assign(ranges[ok] || {}, { max: v.max });
    });
  }
  const nRanges = Object.keys(ranges).length;

  async function sendToOptimizer() {
    if (!accountHero) { setSent('Este herói não está na conta importada.'); return; }
    try {
      setSent('enviando…');
      await backend.saveOptimizationRequest(backend.buildOptimizationRequest(accountHero.id, ranges));
      backend.openInOptimizer(accountHero.id);
      setSent('aberto no otimizador');
    } catch (e) { setSent('falhou: ' + e.message); }
  }

  return html`<div className="optpanel">
    <div className="optbar">
      <span className="optlbl">Arquétipo</span>
      <select value=${(p && p.archetypeId) || ''} onChange=${(e) => onApply(e.target.value)}>
        <option value="">escolher…</option>
        ${archetypes.map((x) => html`<option value=${x.id} key=${x.id}>${cap(x.name)}</option>`)}
      </select>
      <span className="fspacer"></span>
      <span className="sub">${sent || (nRanges ? `${nRanges} stat(s) com intervalo definido` : 'defina os intervalos abaixo')}</span>
      <button className="btn primary" disabled=${!nRanges || !accountHero} onClick=${sendToOptimizer}
        title=${!accountHero ? 'Herói fora da conta importada' : (!nRanges ? 'Defina ao menos um intervalo' : 'Salva e abre a aba Optimizer com este herói')}>
        Abrir no otimizador →
      </button>
    </div>

    ${!p ? html`<div className="sub pad-8">Escolha um arquétipo acima para começar — ele preenche as prioridades e você ajusta o que quiser para ${hero.name}.</div>` : html`<span className="bcontents">
    <div className="optgrid">
      <div className="optrow head">
        <span>stat</span><span>prioridade</span><span></span><span>mínimo</span><span>máximo</span><span>referência da comunidade</span>
      </div>
      ${OPT_STATS.map(([ak, label, icon, ok]) => {
        const v = st(ak);
        const ref = reference && reference[ok];
        return html`<div className=${'optrow' + (v.priority ? '' : ' dim')} key=${ak}>
          <span className="opts">
            <img className="bsi" src=${assets.statIcon(icon)} alt="" />${label}
          </span>
          <input type="range" min="0" max="10" step="1" value=${v.priority || 0}
            onChange=${(e) => setStat(ak, { priority: parseInt(e.target.value, 10) })} />
          <span className="optprio">${v.priority || 0}</span>
          <input className="optnum" type="number" placeholder="—" value=${num(minOf(v))}
            onChange=${(e) => setStat(ak, { min: e.target.value === '' ? null : Number(e.target.value), target: null })} />
          <input className="optnum" type="number" placeholder="—" value=${num(v.max)}
            onChange=${(e) => setStat(ak, { max: e.target.value === '' ? null : Number(e.target.value) })} />
          <span className="optref">
            ${ref ? html`<span className="bcontents">
              <b>${Math.round(ref.p50)}</b>
              <i>${Math.round(ref.lo)}–${Math.round(ref.hi)}</i>
              ${ref.hi > ref.lo ? html`<button className="reflink" title="Usar a faixa da comunidade como intervalo"
                onClick=${() => setStat(ak, { min: Math.round(ref.lo), max: Math.round(ref.hi), target: null })}>usar</button>` : ''}
            </span>` : html`<i className="muted-inline">baixe os dados da comunidade</i>`}
          </span>
        </div>`;
      })}
    </div>

    <div className="optsets">
      <div className="optsub">
        <span className="optlbl">Main dos acessórios</span>
        ${Object.keys(ACC_MAINS).map((slot) => html`<label className="accmain" key=${slot}>
          <span>${SLOT_PT2[slot]}</span>
          <select value=${(p.mains && p.mains[slot]) || ''}
            onChange=${(e) => onChange({ ...p, mains: { ...(p.mains || {}), [slot]: e.target.value || null } })}>
            <option value="">qualquer</option>
            ${ACC_MAINS[slot].map((m) => html`<option key=${m} value=${m}>${MAIN_SHORT(m)}</option>`)}
          </select>
        </label>`)}
      </div>
      <div className="optsub">
        <span className="optlbl">Sets pretendidos</span>
        <${SetChips} selected=${p.sets} onToggle=${(s) => {
          const sel = new Set(p.sets || []); sel.has(s) ? sel.delete(s) : sel.add(s);
          onChange({ ...p, sets: [...sel] });
        }} />
      </div>
    </div></span>`}
  </div>`;
}

// ---- popout central ----
function Modal({ title, onClose, children, wide }) {
  return html`<div className="modalback" onClick=${onClose}>
    <div className=${'modal' + (wide ? ' wide' : '')} onClick=${(e) => e.stopPropagation()}>
      <div className="modalhdr"><h2>${title}</h2><button className="modalx" onClick=${onClose}>✕</button></div>
      <div className="modalbody">${children}</div>
    </div>
  </div>`;
}

/*
 * Editor ÚNICO de bônus (imprint + artefato + EE) — como o "Add Bonus Stats" do app
 * clássico fazia tudo num formulário só. Qualquer uma das 3 caixinhas abre este mesmo
 * popout (rolando até a seção clicada), com UM botão Salvar para os três.
 */
function ArtifactPicker({ hero, accountHero, onSave, saving }) {
  const cur = accountHero.artifactName && accountHero.artifactName !== 'None' ? accountHero.artifactName : null;
  const [q, setQ] = useState('');
  const lvl = Number(accountHero.artifactLevel) || 0;
  const list = useMemo(() => heroBonus.artifactList(hero.role), [hero.role]);
  const filtered = q ? list.filter((a) => a.name.toLowerCase().includes(q.toLowerCase())) : list;
  return html`<div>
    <input type="text" className="artsearch" placeholder="Buscar artefato..." value=${q} onInput=${(e) => setQ(e.target.value)} />
    <div className="artlist">
      <div className=${'artrow' + (cur ? '' : ' on')} onClick=${() => onSave({ artifactName: 'None', artifactLevel: 0 })}>
        <span className="artico"></span><span className="artnm">Sem artefato</span></div>
      ${filtered.map((a) => html`<div key=${a.name} className=${'artrow' + (cur === a.name ? ' on' : '')}
        onClick=${() => onSave({ artifactName: a.name, artifactLevel: lvl })}>
        <${ArtImg} code=${a.code} name=${a.name} cls="artico" />
        <span className="artnm">${a.name}</span>
        <span className="artrar">${a.rarity}</span>
      </div>`)}
      ${filtered.length === 0 ? html`<div className="sub pad-8">Nada encontrado.</div>` : ''}
    </div>
    ${saving ? html`<div className="sub mt-10">Salvando...</div>` : ''}
  </div>`;
}

// -------------------- arquétipo & ajuste fino do herói --------------------

// -------------------- coluna de stats, gear e build-alvo --------------------
function StatColumn({ rows, sets, bonus, cp }) {
  const showTop = cp != null || (sets && sets.length);
  return html`<div className="statcol">
    ${showTop ? html`<div className="setrow">
      ${cp != null ? html`<span className="cpbox" title="Combat Power — o poder de combate que o jogo exibe">
        <span className="cplbl">CP</span><span className="cpval">${statInfo.fmtInt(cp)}</span></span>` : ''}
      ${(sets || []).map((sn, i) => html`<img className="setico" key=${i} src=${assets.setIcon(sn)} alt="" title=${sn} />`)}
    </div>` : ''}
    ${rows.map((r) => html`<div className="srow" key=${r.k} title=${r.tip}>
      <span className="sl">
        ${r.icon ? html`<img className="si" src=${assets.statIcon(r.icon)} alt="" />` : ''}
        <span className="snm">${r.label}</span>
      </span>
      <span className="sv">${r.text}</span>
    </div>`)}
    ${bonus || ''}
  </div>`;
}

// um retângulo de equipamento (em pé)
const GEAR_SLOTS = [['Weapon', 'Arma'], ['Helmet', 'Capacete'], ['Armor', 'Armadura'], ['Necklace', 'Colar'], ['Ring', 'Anel'], ['Boots', 'Bota']];
function GearBox({ slot, item, portraitCode, onClick }) {
  if (!item || !item.main) return html`<div className="gearbox empty"><div className="gbhead"><span className="gbslot">${slot}</span></div><div className="gbempty">vazio</div></div>`;
  const mi = itemStats.info(item.main.type);
  const upCounts = itemStats.upgradeCounts(item);
  const code = (item.equippedByName && portraitCode && portraitCode.byName && portraitCode.byName[item.equippedByName]) || (portraitCode && portraitCode.code) || null;
  return html`<div className=${'gearbox r-' + (item.rank || '').toLowerCase() + (onClick ? '' : ' noclick')} title=${slot}
      onClick=${onClick ? () => onClick(item, slot) : undefined}>
    <div className="gbhead">
      ${item.set ? html`<img className="gbset" src=${assets.setIcon(item.set)} alt="" title=${item.set} />` : html`<span className="gbset"></span>`}
      <span className="gbenh">+${item.enhance || 0}</span>
      <span className="gbspace"></span>
      ${code ? html`<img className="gbportrait" src=${assets.portrait(code)} alt="" title=${item.equippedByName || ''} onError=${(e) => { e.target.style.visibility = 'hidden'; }} />` : ''}
    </div>
    <div className="gbmain" title=${item.main.type}>
      ${mi.icon ? html`<img className="gmi" src=${assets.statIcon(mi.icon)} alt="" />` : ''}
      <span className="gml">${itemStats.label(item.main.type)}</span>
      <span className="gmv">${itemStats.fmt(item.main.type, item.main.value)}</span>
    </div>
    <div className="gbsubs">
      ${(item.substats || []).map((sub, i) => {
        const si = itemStats.info(sub.type);
        const ups = upCounts[i] || 0;
        return html`<div className="gbsub" key=${i}
          title=${itemStats.label(sub.type) + (ups ? ` · ${ups} up${ups > 1 ? 's' : ''} (+3/+6/+9/+12/+15)` : ' · nenhum up')}>
          ${si.icon ? html`<img className="gsi2" src=${assets.statIcon(si.icon)} alt="" />` : html`<span className="gsi2"></span>`}
          <span className="gsl">${itemStats.label(sub.type)}</span>
          <span className=${'gup u' + ups}>${ups ? '>'.repeat(ups) : ''}</span>
          <span className="gsv">${itemStats.fmt(sub.type, sub.value)}</span>
        </div>`;
      })}
    </div>
  </div>`;
}
function GearBoxes({ equipment, portraitCode, onItemClick }) {
  return html`<div className="gearpanel">
    ${GEAR_SLOTS.map(([slot, label]) => html`<${GearBox} key=${slot} slot=${label} item=${equipment ? equipment[slot] : null}
      portraitCode=${portraitCode} onClick=${onItemClick} />`)}
  </div>`;
}

// sets ativos a partir da equipagem (4pc / 2pc completos)
// BLINDADO: nº de peças por set vem do constants.js do app clássico
function activeSets(equipment) {
  if (!equipment) return [];
  const counts = {};
  for (const slot of Object.keys(equipment)) { const it = equipment[slot]; if (it && it.set) counts[it.set] = (counts[it.set] || 0) + 1; }
  const out = [];
  for (const set of Object.keys(counts)) {
    const need = gameConstants.piecesRequired(set);
    for (let i = 0; i < Math.floor(counts[set] / need); i++) out.push(set);
  }
  return out.sort((a, b) => (gameConstants.isFourPiece(b) ? 1 : 0) - (gameConstants.isFourPiece(a) ? 1 : 0));
}

/*
 * Build SEM itens (comunidade / pro): em vez dos 6 slots, mostra o que o gear
 * precisa entregar — e compara com o que o SEU gear já entrega hoje.
 * Ordem dos stats = a mesma da coluna "No jogo", para leitura cruzada fácil.
 */
function TargetGear({ heroName, target, artifactName, setIcons, ov, myEquipment }) {
  const a = useMemo(() => {
    try { return targetBuild.analyze(heroName, target, artifactName, setIcons, ov, myEquipment); }
    catch (e) { return null; }
  }, [heroName, target, artifactName, setIcons, ov, myEquipment]);
  if (!a) return html`<div className="targetgear"><div className="sub pad-8">Sem base de stats deste herói para calcular o alvo.</div></div>`;

  const shortMain = (m) => (m || '').replace('CriticalHitChancePercent', 'CC%').replace('CriticalHitDamagePercent', 'CD%')
    .replace('AttackPercent', 'ATK%').replace('HealthPercent', 'HP%').replace('DefensePercent', 'DEF%')
    .replace('EffectivenessPercent', 'EFF%').replace('EffectResistancePercent', 'RES%').replace('Speed', 'SPD');
  const SLOT_PT = { Necklace: 'Colar', Ring: 'Anel', Boots: 'Bota' };
  const MAIN_ICON = { CriticalHitChancePercent: 'chc', CriticalHitDamagePercent: 'chd', AttackPercent: 'atk',
    HealthPercent: 'hp', DefensePercent: 'def', EffectivenessPercent: 'eff', EffectResistancePercent: 'efr', Speed: 'spd' };
  const byKey = {}; a.substats.forEach((s) => { byKey[s.key] = s; });
  const unit = (k) => (k === 'spd' ? '' : '%');
  const fmt1 = (v) => (Math.round(v * 10) / 10);

  return html`<div className="targetgear">
    <div className="tghdr">
      <span className="tgt1">Para alcançar esta build</span>
      <span className="tgt2">${a.bonuses.parts.map((p) => p.from).join(' · ') || 'sem bônus fora do gear'}${a.bonuses.sets && a.bonuses.sets.length ? ' · sets já descontados' : ''}</span>
    </div>

    <div className="tgmains">
      ${targetBuild.VARIABLE_SLOTS.map((slot) => html`<div className="tgmain" key=${slot}>
        <span className="tgslot">${SLOT_PT[slot]}</span>
        <span className="tgmainrow">
          ${MAIN_ICON[a.mains[slot]] ? html`<img className="bsi" src=${assets.statIcon(MAIN_ICON[a.mains[slot]])} alt="" />` : ''}
          <span className="tgmainv">${shortMain(a.mains[slot])}</span>
        </span>
      </div>`)}
    </div>

    <div className="tgtable">
      <div className="tgrow head">
        <span className="tgc-st">substatus</span>
        <span className="tgc-n">precisa</span>
        <span className="tgc-c">você tem</span>
        <span className="tgc-d">saldo</span>
      </div>
      ${targetBuild.KEYS.map((k) => {
        const need = (a.afterMains && a.afterMains[k]) || 0;
        const cur = (a.current && a.current[k]) || 0;
        if (need <= 0 && cur <= 0) return '';
        const diff = fmt1(cur - need);
        const ok = diff >= 0;
        const pct = need > 0 ? Math.max(0, Math.min(100, (cur / need) * 100)) : 100;
        const sv = byKey[k];
        return html`<div className=${'tgrow' + (ok ? ' ok' : ' falta')} key=${k}
          title=${sv ? `${sv.perItem}${unit(k)} em cada uma das ${sv.eligible} peças que podem levar este substatus (${sv.rolls} rolls por peça)` : ''}>
          <span className="tgc-st">
            <img className="bsi" src=${assets.statIcon(targetBuild.KEY_ICON[k])} alt="" />
            <b>${targetBuild.KEY_LABEL[k]}</b>
            <i className="tgbar"><u style=${{ width: pct + '%' }}></u></i>
          </span>
          <span className="tgc-n">${need > 0 ? fmt1(need) + unit(k) : '—'}</span>
          <span className="tgc-c">${fmt1(cur)}${unit(k)}</span>
          <span className="tgc-d">${ok ? '+' : ''}${diff}${unit(k)}</span>
        </div>`;
      })}
    </div>
  </div>`;
}

function StatBlocks({ stats, equipment, portraitCode, onItemClick, heroName, onSaveBonus, onPickArtifact, saving, topArtifact, setIcons, bonusHero, simulated, ov, myEquipment }) {
  if (!stats) return null;
  const hasGear = !!(equipment && Object.keys(equipment).length);
  const gameRows = statInfo.GAME.map((e) => ({ ...e, text: statInfo.fmtGame(e, stats[e.k]) }));
  const fribRows = statInfo.FRIBBELS.map((e) => ({ ...e, icon: null, text: statInfo.fmtInt(stats[e.k]) }));
  const sets = activeSets(equipment);
  return html`<div className="topregion">
    <${BonusSquares} heroName=${heroName} accountHero=${bonusHero || stats} onSave=${onSaveBonus} onPickArtifact=${onPickArtifact} saving=${saving} simulated=${simulated} />
    <${StatColumn} rows=${gameRows} sets=${sets} cp=${stats.cp} />
    <${StatColumn} rows=${fribRows} />
    ${hasGear
      ? html`<${GearBoxes} equipment=${equipment} portraitCode=${portraitCode} onItemClick=${onItemClick} />`
      : html`<${TargetGear} heroName=${heroName} target=${stats} artifactName=${topArtifact} setIcons=${setIcons} ov=${ov} myEquipment=${myEquipment} />`}
  </div>`;
}

function HeroPanel({ hero, summary, profile, archetypes, isFav, isEquip, account, accountHero, onToggleFav, onToggleEquip, onFetch, onApplyArch, onChangeProfile, onSaveBonus, onPickArtifact, saving, busy, minTier, onMinTier }) {
  // hooks SEMPRE antes de qualquer return condicional (ordem de hooks do React)
  const [selBuild, setSelBuild] = useState(null);
  const [buildEquip, setBuildEquip] = useState(null);
  const [originFilters, setOriginFilters] = useState({ equipped: true, saved: true, community: true, pro: true });
  const [lowTab, setLowTab] = useState('builds');   // 'builds' | 'arq'
  const [arqFilter, setArqFilter] = useState('');
  const [sim, setSim] = useState({});   // simulação de bônus em build pública (não grava)
  const heroKey = hero ? hero.name : null;

  useEffect(() => { setSelBuild(null); setBuildEquip(null); }, [heroKey]);
  useEffect(() => { setSim({}); }, [selBuild && selBuild.key]);

  const rows = useMemo(() => buildsList.collect(accountHero, summary, heroKey), [accountHero, summary, heroKey]);
  const types = useMemo(() => buildsList.types(summary), [summary]);

  // build salva guarda só os ids dos itens -> busca os itens no backend
  useEffect(() => {
    if (!selBuild || !selBuild.items || !selBuild.items.length) { setBuildEquip(null); return undefined; }
    let alive = true;
    backend.getItemsByIds(selBuild.items).then((items) => {
      if (!alive) return;
      const m = {};
      (items || []).forEach((it) => { if (it && it.gear) m[it.gear] = it; });
      setBuildEquip(m);
    }).catch(() => { if (alive) setBuildEquip(null); });
    return () => { alive = false; };
  }, [selBuild]);

  if (!hero) return html`<div className="empty">Selecione um herói à esquerda.</div>`;
  const s = summary || {};
  const com = s.community; const off = s.official;
  const inAccount = !!accountHero;
  const active = selBuild || rows[0] || null;
  const topStats = active ? active.stats : accountHero;
  const topEquip = selBuild ? (selBuild.equipment || buildEquip) : (accountHero ? accountHero.equipment : null);
  /*
   * Artefato usado no cálculo do alvo: o da PRÓPRIA build real quando existe;
   * senão o mais usado pela comunidade naquele perfil.
   */
  const clusters = (com && com.clusters) || [];
  const comboOf = (r) => (r && r.sets && r.sets[0]) || null;
  const clusterForActive = active
    ? (clusters.find((c) => c.combo && comboOf(active) && c.combo === comboOf(active)) || clusters[0] || null)
    : (clusters[0] || null);
  const topArtifactCode = (active && active.artifactCode)
    || (clusterForActive && clusterForActive.artifacts && clusterForActive.artifacts[0] ? clusterForActive.artifacts[0].code : null);
  const topArtifactName = topArtifactCode ? heroBonus.artifactByCode(topArtifactCode) : null;
  // painéis de estatística vêm dos CLUSTERS (é lá que mora o cálculo), não das linhas
  /*
   * Build pública (comunidade/pro): as 3 caixas entram em SIMULAÇÃO, começando no
   * máximo — que é exatamente o que o cálculo do alvo assume. Mexer nelas refaz o
   * painel da direita e NÃO grava nada na conta.
   */
  const isPublic = !!(selBuild && (selBuild.origin === 'community' || selBuild.origin === 'pro'));
  const impMax = hero ? heroBonus.imprint(hero.name, null) : null;
  const eeMax = hero ? heroBonus.ee(hero.name, null) : null;
  const simHero = isPublic ? {
    artifactName: ('artifactName' in sim) ? sim.artifactName : (topArtifactName || 'None'),
    artifactLevel: ('artifactLevel' in sim) ? sim.artifactLevel : heroBonus.ARTIFACT_MAX_LEVEL,
    imprintNumber: ('imprintValue' in sim) ? sim.imprintValue : (impMax ? impMax.max : null),
    eeNumber: ('eeValue' in sim) ? sim.eeValue : (eeMax ? eeMax.max : null),
  } : null;
  const medianRow = clusterForActive
    ? { name: buildsList.clusterName(clusterForActive, 0), stats: buildsList.clusterToStats(clusterForActive),
        ranges: buildsList.clusterRanges(clusterForActive), cluster: clusterForActive }
    : null;
  /*
   * Referência exibida em cada linha do Otimizador: mediana + faixa típica do
   * perfil de build ativo. É o que responde "que intervalo é adequado aqui?".
   */
  let reference = null;
  if (medianRow && medianRow.ranges) {
    reference = {};
    Object.keys(medianRow.ranges).forEach((k) => {
      const r = medianRow.ranges[k];
      if (!r) return;
      // os dados crus passam do teto (CC 102%, p.ex.); sugerir isso como intervalo
      // seria pedir um mínimo inalcançável. O teto vem do backend, não é fixado aqui.
      const cap = gameConstants.statCap(k);
      const cut = (v) => (cap != null ? Math.min(v, cap) : v);
      reference[k] = { p50: cut(medianRow.stats[k]), lo: cut(r.lo), hi: cut(r.hi) };
    });
  }
  const acctNote = account && account.ready
    ? (inAccount ? 'Na conta — build atual disponível' : 'Fora da conta importada — só dados públicos')
    : 'Backend offline — só dados públicos';
  return html`<div>
    <div className="herobar">
      ${hero.code && html`<img className="hbportrait" src=${assets.portrait(hero.code)} alt="" onError=${(e) => { e.target.style.visibility = 'hidden'; }} />`}
      <div className="hbinfo">
        <div className="hbname">
          <span className="hbnm">${hero.name}</span>
          ${hero.attribute && html`<img className="hbico" src=${assets.element(hero.attribute)} title=${hero.attribute} />`}
          ${hero.role && html`<img className="hbico" src=${assets.klass(hero.role)} title=${hero.role} />`}
          ${hero.rarity ? html`<span className="hbstars">${Array.from({ length: hero.rarity }).map((_, i) => html`<img key=${i} src=${assets.starBase()} alt="★" />`)}</span>` : ''}
          <span className=${'statusdot ' + (inAccount ? 'in' : 'out')} title=${acctNote}></span>
        </div>
      </div>
      <div className="hbactions">
        <button className=${'symtoggle' + (isFav ? ' on' : '')} title=${isFav ? 'Favorito (clique para desmarcar)' : 'Favoritar (marca equipável junto)'}
          onClick=${() => onToggleFav(hero.name, !isFav)}>${isFav ? '★' : '☆'}</button>
        <button className=${'symtoggle' + (isEquip ? ' on' : '')} title=${isEquip ? 'Equipável (quer equipamento)' : 'Marcar como equipável'}
          onClick=${() => onToggleEquip(hero.name, !isEquip)}>⚙</button>
        <label className="tiersel" title="De que rank do RTA para cima buscar as builds dos pros">
          <span>Pros de</span>
          <select value=${minTier} onChange=${(e) => onMinTier(e.target.value)}>
            ${official.TIERS.map((t) => html`<option key=${t.code} value=${t.code}>${t.label}</option>`)}
          </select>
          <span>pra cima</span>
        </label>
        <button className="btn primary" disabled=${busy || s.__loading} onClick=${() => onFetch(hero, true)}>
          ${s.__loading ? '⭳ Baixando…' : '⭳ Dados Comunidade'}
        </button>
      </div>
      ${s.__error && html`<span className="err ml-8">${s.__error}</span>`}
    </div>
    ${topStats
      ? html`<span className="bcontents">
          <${StatBlocks} stats=${topStats} equipment=${topEquip} portraitCode=${{ code: hero.code }}
            heroName=${hero.name} onPickArtifact=${onPickArtifact} saving=${saving}
            topArtifact=${isPublic && simHero ? (simHero.artifactName === 'None' ? null : simHero.artifactName) : topArtifactName}
            setIcons=${active ? active.setIcons : null}
            bonusHero=${simHero} simulated=${isPublic} ov=${isPublic ? sim : undefined}
            myEquipment=${accountHero ? accountHero.equipment : null}
            onSaveBonus=${isPublic ? ((c) => setSim((p) => Object.assign({}, p, c))) : onSaveBonus} />
        </span>`
      : html`<div className="card"><div className="sub">Sem build atual — ${account && account.ready ? 'herói fora da conta importada' : 'backend offline'}. Baixe os dados da comunidade acima para ver os perfis de build deste herói.</div></div>`}

    <div className="lowtabs">
      <button className=${'ltab' + (lowTab === 'builds' ? ' on' : '')} onClick=${() => setLowTab('builds')}>Builds</button>
      <button className=${'ltab' + (lowTab === 'opt' ? ' on' : '')} onClick=${() => setLowTab('opt')}>Otimizador</button>
      <button className=${'ltab' + (lowTab === 'stats' ? ' on' : '')} onClick=${() => setLowTab('stats')}>Estatísticas</button>
    </div>
    ${lowTab === 'builds' ? html`<${BuildsList} rows=${rows} selectedKey=${active ? active.key : null}
          onSelect=${(r) => setSelBuild(r.key === 'equipped' ? null : r)}
          filters=${originFilters} onToggleFilter=${(k) => setOriginFilters({ ...originFilters, [k]: !originFilters[k] })}
          archetypes=${archetypes} arqFilter=${arqFilter} onArqFilter=${setArqFilter} />` : ''}
    ${lowTab === 'opt' ? html`<${OptimizerPanel} hero=${hero} profile=${profile} archetypes=${archetypes}
          accountHero=${accountHero} reference=${reference}
          onApply=${(id) => onApplyArch(hero, id)} onChange=${(p) => onChangeProfile(hero, p)} />` : ''}
    ${lowTab === 'stats' ? html`<div className="statstab">
          <${CommunityMedian} row=${medianRow} />
          <${BuildTypes} list=${types} onPick=${(i) => { const r = rows.find((x) => x.key === 'com-' + i); if (r) { setSelBuild(r); setLowTab('builds'); } }} />
          <${ArtifactUsage} row=${medianRow} />
          <${OfficialCard} off=${off} />
        </div>` : ''}
  </div>`;
}

// -------------------- editor de arquétipos --------------------
function ArchetypeEditor({ arch, onChange, onSave, onDuplicate, onDelete, dirty }) {
  if (!arch) return html`<div className="empty">Selecione ou crie um arquétipo.</div>`;
  return html`<div>
    <div className="hdrrow">
      <h2>${arch.name || '(novo arquétipo)'} ${arch.builtin ? html`<span className="bi">(padrão)</span>` : ''}</h2>
      <button className="btn" onClick=${onDuplicate}>Duplicar</button>
      ${!arch.builtin && html`<button className="btn" onClick=${onDelete}>Excluir</button>`}
      <button className="btn primary" disabled=${!dirty} onClick=${onSave}>Salvar</button>
    </div>
    <div className="field"><label>Nome</label>
      <input type="text" value=${arch.name} onChange=${(e) => onChange({ ...arch, name: e.target.value })} /></div>
    <div className="field"><label>Descrição</label>
      <textarea rows="2" value=${arch.desc} onChange=${(e) => onChange({ ...arch, desc: e.target.value })}></textarea></div>
    <div className="field"><label>Stats — prioridade e alvo</label>
      <${StatBars} stats=${arch.stats} onChange=${(stats) => onChange({ ...arch, stats })} /></div>
    <div className="field"><label>Sets preferidos</label>
      <${SetChips} selected=${arch.sets} onToggle=${(s) => {
        const sel = new Set(arch.sets || []); sel.has(s) ? sel.delete(s) : sel.add(s);
        onChange({ ...arch, sets: [...sel] });
      }} /></div>
    ${arch.builtin && html`<div className="sub">Editar um padrão salva uma cópia sua que passa a valer no lugar dele.</div>`}
  </div>`;
}

function ArchetypesView() {
  const [items, setItems] = useState(() => arche.list());
  const [selId, setSelId] = useState(() => (arche.list()[0] || {}).id);
  const [draft, setDraft] = useState(() => deep(arche.list()[0] || arche.blankArchetype()));
  const [dirty, setDirty] = useState(false);

  function select(id) {
    const a = items.find((x) => x.id === id);
    setSelId(id); setDraft(deep(a)); setDirty(false);
  }
  function change(next) { setDraft(next); setDirty(true); }
  function save() {
    if (!draft.name.trim()) { alert('Dê um nome ao arquétipo.'); return; }
    arche.upsertUser({ ...draft, stats: normalizeStats(draft.stats) });
    const list = arche.list(); setItems(list); setDirty(false);
    setSelId(draft.id || arche.slugify(draft.name));
  }
  function newArch() { const b = arche.blankArchetype(); setSelId(null); setDraft(b); setDirty(true); }
  function duplicate() {
    const copy = deep(draft); copy.id = null; copy.builtin = false; copy.name = (draft.name || 'Arquétipo') + ' (cópia)';
    setSelId(null); setDraft(copy); setDirty(true);
  }
  function del() {
    if (!draft.id || draft.builtin) return;
    if (!confirm('Excluir este arquétipo?')) return;
    arche.deleteUser(draft.id); const list = arche.list(); setItems(list); select((list[0] || {}).id);
  }

  return html`<div className="editorwrap">
    <div className="archlist">
      <div className="pad-8"><button className="btn primary w-100" onClick=${newArch}>+ Novo arquétipo</button></div>
      ${items.map((a) => html`<div key=${a.id} className=${'archrow' + (a.id === selId ? ' selected' : '')} onClick=${() => select(a.id)}>
        <div className="nm">${a.name}</div>
        <div className="bi">${a.builtin ? 'padrão' : 'meu'} · ${a.id}</div>
      </div>`)}
    </div>
    <div className="editor">
      <${ArchetypeEditor} arch=${draft} onChange=${change} onSave=${save} onDuplicate=${duplicate} onDelete=${del} dirty=${dirty} />
    </div>
  </div>`;
}

// -------------------- linha da lista de heróis --------------------
// A LISTA É O RANK: todas as linhas são arrastáveis; o nº é a posição global.
function HeroRow({ h, entry, rankPos, selected, showStar, dragOver, onSelect, onEditRank, onContext, onDragStart, onDragOver, onDragLeave, onDrop }) {
  const hasProfile = entry && entry.profile && entry.profile.archetypeId;
  const cls = 'herorow' + (selected ? ' selected' : '') + (dragOver ? ' dragover' : '');
  const fav = entry && entry.favorite;
  const equip = entry && entry.equipavel;
  return html`<div className=${cls} onClick=${() => onSelect(h)} draggable="true"
      onDragStart=${(e) => onDragStart(e, h.name)} onDragOver=${(e) => onDragOver(e, h.name)}
      onDragLeave=${(e) => onDragLeave(e, h.name)} onDrop=${(e) => onDrop(e, h.name)}
      onContextMenu=${(e) => onContext(e, h.name)}>
    <span className="grip" title="Arraste para reordenar o rank">${[0, 0, 0, 0, 0, 0, 0, 0, 0].map((_, i) => html`<i key=${i}></i>`)}</span>
    <span className="rankn" title="Clique para digitar a posição no rank"
      onClick=${(e) => { e.stopPropagation(); onEditRank(h.name); }}>${rankPos}</span>
    ${h.code && html`<img className="portrait" src=${assets.portrait(h.code)} alt="" onError=${(e) => { e.target.style.visibility = 'hidden'; }} />`}
    ${h.attribute && html`<img className="ico" src=${assets.element(h.attribute)} alt=${h.attribute} title=${h.attribute} />`}
    ${h.role && html`<img className="ico" src=${assets.klass(h.role)} alt=${h.role} title=${h.role} />`}
    <span className="nm">${h.name}${hasProfile ? html`<span className="tag"> ◆${entry.profile.archetypeId.slice(0, 10)}</span>` : ''}</span>
    ${fav && showStar ? html`<span className="favmark" title="Favorito">★</span>`
      : (equip ? html`<span className="eqmark" title="Equipável">⚙</span>` : '')}
  </div>`;
}

// filtro visual de elemento/classe/estrela com ícones
function IconFilter({ src, label, active, onClick }) {
  return html`<button className=${'iconfilter' + (active ? ' on' : '')} title=${label} onClick=${onClick}>
    <img src=${src} alt=${label} /></button>`;
}

// -------------------- view heróis --------------------
function HeroesView() {
  const [heroes] = useState(() => { try { return heroList.load(); } catch (e) { return { __err: e.message }; } });
  const [rel, setRel] = useState(() => relevance.load());
  const [archetypes] = useState(() => arche.list());
  const [q, setQ] = useState('');
  const [role, setRole] = useState(''); const [attr, setAttr] = useState('');
  const [stars, setStars] = useState(() => new Set());       // {3,4,5}
  const [archFilter, setArchFilter] = useState('');          // '', 'none', ou id
  const [onlyFav, setOnlyFav] = useState(false);
  const [onlyEquip, setOnlyEquip] = useState(false);
  const [selected, setSelected] = useState(null);
  const [summaries, setSummaries] = useState({});
  const [busy] = useState(false);
  const [drag, setDrag] = useState(null); const [dragOver, setDragOver] = useState(null); const [ctx, setCtx] = useState(null);
  // conta (backend localhost:8130): null=verificando, {ready:false}=offline, {ready:true,count}=ok
  const [account, setAccount] = useState(null);
  const [bonusEdit, setBonusEdit] = useState(null); // 'imprint' | 'artifact' | 'ee'
  const [minTier, setMinTier] = useState(official.DEFAULT_MIN_TIER); // RTA: de que rank pra cima puxar
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    backend.getAllHeroes(true, true)
      .then((hs) => { if (alive) setAccount({ ready: true, count: hs.length }); })
      .catch(() => { if (alive) setAccount({ ready: false, count: 0 }); });
    return () => { alive = false; };
  }, []);

  const list = Array.isArray(heroes) ? heroes : [];
  const roles = useMemo(() => ordered(uniq(list.map((h) => h.role)), CLASS_ORDER), [list]);
  const attrs = useMemo(() => ordered(uniq(list.map((h) => h.attribute)), ELEMENT_ORDER), [list]);
  const allNames = useMemo(() => list.map((h) => h.name), [list]);
  const byName = useMemo(() => { const m = {}; list.forEach((h) => { m[h.name] = h; }); return m; }, [list]);

  // rank global (a lista É o rank)
  const rankedAll = relevance.rankedNames(rel, allNames);
  const rankPos = useMemo(() => { const m = {}; rankedAll.forEach((n, i) => { m[n] = i + 1; }); return m; }, [rankedAll]);

  function filterOk(h) {
    const e = rel.heroes[h.name];
    if (q && !h.name.toLowerCase().includes(q.toLowerCase())) return false;
    if (role && h.role !== role) return false;
    if (attr && h.attribute !== attr) return false;
    if (stars.size && !stars.has(h.rarity)) return false;
    if (onlyFav && !(e && e.favorite)) return false;
    if (onlyEquip && !(e && e.equipavel)) return false;
    if (archFilter === 'none' && e && e.profile && e.profile.archetypeId) return false;
    if (archFilter && archFilter !== 'none' && !(e && e.profile && e.profile.archetypeId === archFilter)) return false;
    return true;
  }
  const visible = rankedAll.map((n) => byName[n]).filter(Boolean).filter(filterOk);
  const visibleNames = visible.map((h) => h.name);
  const favCount = relevance.favoriteNames(rel).length;
  const equipCount = relevance.equipavelNames(rel).length;

  function toggleFav(name, on) {
    if (!on) {
      const next = relevance.setFavorite(rel, name, false);
      if (relevance.isEquipavel(next, name) && window.confirm(`${name} deixou de ser favorito.\nTambém remover da lista de "quer equipamento" (equipáveis)?`)) {
        setRel(relevance.setEquipavel(next, name, false));
      } else setRel(next);
    } else setRel(relevance.setFavorite(rel, name, true));
  }
  function toggleEquip(name, on) { setRel(relevance.setEquipavel(rel, name, on)); }
  function toggleStar(n) { const s = new Set(stars); s.has(n) ? s.delete(n) : s.add(n); setStars(s); }

  function onDragStart(e, name) { setDrag(name); e.dataTransfer.effectAllowed = 'move'; }
  function onDragOver(e, name) { e.preventDefault(); if (drag && dragOver !== name) setDragOver(name); }
  function onDragLeave(e, name) { if (dragOver === name) setDragOver(null); }
  function onDrop(e, name) {
    e.preventDefault();
    if (drag && drag !== name) setRel(relevance.reorderBefore(rel, rankedAll, drag, name));
    setDrag(null); setDragOver(null);
  }
  function onContext(e, name) { e.preventDefault(); setCtx({ name, x: e.clientX, y: e.clientY }); }
  function reorderPrompt(name) {
    setCtx(null);
    const pos = visibleNames.indexOf(name) + 1;
    const v = window.prompt(`Posição de ${name} na lista atual (1–${visibleNames.length}):`, String(pos || 1));
    if (v != null && v.trim() !== '') setRel(relevance.reorderToVisiblePosition(rel, rankedAll, visibleNames, name, v));
  }
  function applyArch(hero, id) {
    if (!id) return;
    const a = arche.get(id); if (!a) return;
    const profile = { archetypeId: id, stats: normalizeStats(a.stats), sets: [...(a.sets || [])] };
    setRel(relevance.setProfile(rel, hero.name, profile));
  }
  function changeProfile(hero, profile) { setRel(relevance.setProfile(rel, hero.name, profile)); }

  async function fetchBoth(hero, force) {
    setSummaries((s) => ({ ...s, [hero.name]: { ...s[hero.name], __loading: true } }));
    const res = {};
    try { res.community = await community.getHero(hero.name, { force }); } catch (e) { res.__error = 'Fribbels: ' + e.message; }
    if (hero.code) { try { res.official = await official.getHeroFromTier(hero.code, { force, minTier }); } catch (e) { res.official = { __error: e.message }; } }
    setSummaries((s) => ({ ...s, [hero.name]: res }));
  }
  function selectHero(h) {
    setSelected(h);
    if (!summaries[h.name]) {
      Promise.all([
        Promise.resolve(community.getHero(h.name, { offlineOnly: true })).catch(() => null),
        h.code ? Promise.resolve(official.getHeroFromTier(h.code, { offlineOnly: true, minTier })).catch(() => null) : null,
      ]).then(([com, off]) => { if (com || off) setSummaries((s) => ({ ...s, [h.name]: { community: com || undefined, official: off || undefined } })); });
    }
  }
  // grava artefato / EE / imprint no backend (mesma conta do app clássico) e recarrega
  async function saveBonus(changes) {
    const name = selected && selected.name;
    const acct = name ? backend.accountHeroByName(name) : null;
    if (!acct) { setBonusEdit(null); return; }
    setSaving(true);
    try {
      const payload = heroBonus.buildBonusPayload(acct, name, changes);
      await backend.setBonusStats(payload);
      const hs = await backend.getAllHeroes(true, true); // força recarga do cache
      setAccount({ ready: true, count: hs.length });
      setBonusEdit(null);
    } catch (e) {
      alert('Falha ao salvar no backend: ' + e.message);
    } finally { setSaving(false); }
  }

  if (heroes && heroes.__err) return html`<pre className="err pad-16">Falha ao ler herodata.json: ${heroes.__err}</pre>`;
  const selName = selected && selected.name;
  const selEntry = selName ? rel.heroes[selName] : null;
  const selProfile = selName ? relevance.getProfile(rel, selName) : null;
  const ctxEntry = ctx ? rel.heroes[ctx.name] : null;
  const acctHero = (selName && account && account.ready) ? backend.accountHeroByName(selName) : null;

  return html`<div className="main">
    <div className="left">
      <div className="filters">
        <input type="text" placeholder="Buscar herói…" value=${q} onInput=${(e) => setQ(e.target.value)} />
        <div className="frow">
          <span className="flabel">Elemento</span>
          ${attrs.map((a) => html`<${IconFilter} key=${a} src=${assets.element(a)} label=${a} active=${attr === a} onClick=${() => setAttr(attr === a ? '' : a)} />`)}
        </div>
        <div className="frow">
          <span className="flabel">Classe</span>
          ${roles.map((r) => html`<${IconFilter} key=${r} src=${assets.klass(r)} label=${r} active=${role === r} onClick=${() => setRole(role === r ? '' : r)} />`)}
        </div>
        <div className="frow">
          <span className="flabel">Estrelas</span>
          ${[3, 4, 5].map((n) => html`<button key=${n} className=${'starfilter' + (stars.has(n) ? ' on' : '')} title=${n + '★ base'} onClick=${() => toggleStar(n)}>
            <img src=${assets.starBase()} alt="★" />${n}</button>`)}
          <span className="fspacer"></span>
          <button className=${'symtoggle sm' + (onlyFav ? ' on' : '')} title="Só favoritos" onClick=${() => setOnlyFav(!onlyFav)}>${onlyFav ? '★' : '☆'}</button>
          <button className=${'symtoggle sm' + (onlyEquip ? ' on' : '')} title="Só equipáveis" onClick=${() => setOnlyEquip(!onlyEquip)}>⚙</button>
        </div>
        <div className="frow">
          <span className="flabel">Arquétipo</span>
          <select value=${archFilter} onChange=${(e) => setArchFilter(e.target.value)}>
            <option value="">Todos</option>
            <option value="none">Sem arquétipo</option>
            ${archetypes.map((a) => html`<option value=${a.id} key=${a.id}>${cap(a.name)}</option>`)}
          </select>
        </div>
      </div>
      <div className="herolist">
        ${visible.length === 0 && html`<div className="empty small">Nenhum herói com esses filtros.</div>`}
        ${visible.map((h) => html`<${HeroRow} key=${h.name} h=${h} entry=${rel.heroes[h.name]}
          rankPos=${rankPos[h.name]} selected=${selName === h.name} showStar=${!onlyFav}
          dragOver=${dragOver === h.name} onSelect=${selectHero} onEditRank=${reorderPrompt} onContext=${onContext}
          onDragStart=${onDragStart} onDragOver=${onDragOver} onDragLeave=${onDragLeave} onDrop=${onDrop} />`)}
      </div>
      <div className="liststats">
        <span><b>${list.length}</b> heróis</span>
        <span className="sep">·</span>
        <span title="Favoritos">★ <b>${favCount}</b></span>
        <span className="sep">·</span>
        <span title="Equipáveis">⚙ <b>${equipCount}</b></span>
        ${visible.length !== list.length ? html`<span className="bcontents"><span className="sep">·</span><span>${visible.length} exibidos</span></span>` : ''}
        <span className="fspacer"></span>
        <span className=${'bstat ' + (!account ? 'chk' : account.ready ? 'ok' : 'off')}
          title=${!account ? 'Verificando backend…' : account.ready ? `Backend conectado · ${account.count} heróis na conta` : 'Backend offline — só dados públicos'}>
          ${!account ? '● backend…' : account.ready ? `● conta (${account.count})` : '● só público'}</span>
      </div>
    </div>
    <div className="right">
      <${HeroPanel} hero=${selected} summary=${selName ? summaries[selName] : null} profile=${selProfile}
        archetypes=${archetypes} isFav=${!!(selEntry && selEntry.favorite)} isEquip=${!!(selEntry && selEntry.equipavel)}
        account=${account} accountHero=${acctHero}
        onToggleFav=${toggleFav} onToggleEquip=${toggleEquip} onSaveBonus=${saveBonus} onPickArtifact=${() => setBonusEdit('artifact')} saving=${saving}
        minTier=${minTier} onMinTier=${setMinTier}
        onFetch=${fetchBoth} onApplyArch=${applyArch} onChangeProfile=${changeProfile} busy=${busy} />
    </div>
    ${bonusEdit && acctHero ? html`<${Modal} title="Status bônus" onClose=${() => setBonusEdit(null)}>
      <${ArtifactPicker} hero=${selected} accountHero=${acctHero} onSave=${saveBonus} saving=${saving} />
    </${Modal}>` : ''}
    ${ctx && html`<div className="ctxbackdrop" onClick=${() => setCtx(null)} onContextMenu=${(e) => { e.preventDefault(); setCtx(null); }}>
      <div className="ctxmenu" style=${{ left: ctx.x + 'px', top: ctx.y + 'px' }} onClick=${(e) => e.stopPropagation()}>
        <div className="ctxhdr">${ctx.name} · rank #${rankPos[ctx.name]}</div>
        <button className="ctxitem" onClick=${() => { const n = ctx.name; setCtx(null); toggleFav(n, !(ctxEntry && ctxEntry.favorite)); }}>
          ${ctxEntry && ctxEntry.favorite ? 'Remover favorito' : 'Favoritar'}</button>
        <button className="ctxitem" onClick=${() => { const n = ctx.name; setCtx(null); toggleEquip(n, !(ctxEntry && ctxEntry.equipavel)); }}>
          ${ctxEntry && ctxEntry.equipavel ? 'Remover de equipáveis' : 'Marcar como equipável'}</button>
        <button className="ctxitem" onClick=${() => reorderPrompt(ctx.name)}>Definir posição na lista…</button>
      </div>
    </div>`}
  </div>`;
}

// -------------------- app raiz --------------------
function App() {
  const [view, setView] = useState('heroes');
  return html`<div className="approot">
    <div className="topbar">
      <h1>E7 Fork</h1>
      <div className="tabs">
        <button className=${'tab' + (view === 'heroes' ? ' active' : '')} onClick=${() => setView('heroes')}>Heróis</button>
        <button className=${'tab' + (view === 'archetypes' ? ' active' : '')} onClick=${() => setView('archetypes')}>Arquétipos</button>
      </div>
      <div className="spacer"></div>
    </div>
    ${view === 'heroes' ? html`<${HeroesView} />` : html`<${ArchetypesView} />`}
  </div>`;
}

ReactDOM.render(html`<${App} />`, document.getElementById('root'));
