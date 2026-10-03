/*
 * StatisticsTab — a aba Estatísticas, 4 caixas nesta ordem:
 *   [Construções] [Estatísticas]     ← vêm das BUILDS baixadas
 *   [RTA]         [Artefatos]        ← RTA oficial (win rate por combo) · artefatos das builds
 * Construções lista os ARQUÉTIPOS das builds. Um clique num deles faz
 * Estatísticas e Artefatos mostrarem só aquele arquétipo (o RTA não tem stats,
 * então não dá para filtrar por arquétipo); dois cliques
 * abrem a aba Construções já filtrada nele.
 * Um botão ("Baixar") traz as duas partes; se uma falhar, a outra aparece mesmo assim.
 */
'use strict';
const { html, useState, useMemo } = require('../../h.js');
const { Box } = require('../../components/index.js');
const { useCommunity, missing, downloadWarn } = require('./useCommunity.js');
const F = require('./filters.js');
const B = require('./boxes.js');

function NeedBuilds({ title, entry }) {
  return html`<${Box} className="cm-box">
    <div className="cm-hd"><span className="label">${title}</span></div>
    <span className="sub cm-none">${entry && entry.status === 'loading' ? 'Lendo as builds…'
      : (entry && entry.error ? `Não foi possível ler as builds: ${entry.error}` : '')}</span>
  <//>`;
}

function StatisticsTab({ hero }) {
  const c = useCommunity(hero);
  const { app, entry, summary, official, tier } = c;
  const groups = useMemo(() => F.archetypeGroups(summary, hero.name), [summary, hero.name]);
  const all = useMemo(() => F.allGroup(summary), [summary]);   // "Todas": mesma conta, todas as builds
  const [sel, setSel] = useState(null);

  // nada lido ou nada baixado (nem builds nem RTA): a aba inteira vira o bloco "sem dados"
  if (!entry || (!summary && !official)) return missing(c, hero);

  const g = summary && sel != null ? groups.find((x) => x.id === sel) : null;
  const cur = g || all;
  const scope = !summary ? '' : `${g ? g.name : 'todas'} · ${cur.count} builds`;
  return html`<section className="cm">
    ${downloadWarn(c)}
    <div className="cm-grid">
      ${summary
        ? html`<${B.Constructions} groups=${groups} selected=${g ? g.id : null}
            onSelect=${setSel} onOpen=${(id) => app.openConstructions(hero.name, id)} />`
        : html`<${NeedBuilds} title="Construções" entry=${entry} />`}
      ${summary
        ? html`<${B.Stats} stats=${cur.stats} scope=${scope} />`
        : html`<${NeedBuilds} title="Estatísticas" entry=${entry} />`}
      <${B.Rta} official=${official} error=${entry.officialError} tier=${tier} loading=${entry.rtaStatus === 'loading'} />
      ${summary
        ? html`<${B.Artifacts} list=${cur.artifacts} scope=${scope} />`
        : html`<${NeedBuilds} title="Artefatos" entry=${entry} />`}
    </div>
  </section>`;
}

module.exports = { StatisticsTab };
