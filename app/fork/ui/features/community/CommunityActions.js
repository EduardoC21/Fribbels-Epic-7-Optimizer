/*
 * CommunityActions — a ponta direita da faixa das abas:
 *   ↑ RTA: [Imperador ▾]   Builds: [1.000 ▾]   [⭳ Baixar]
 * UM botão baixa as duas partes: o RTA oficial do tier escolhido pra cima
 * (caixa RTA) e as N builds de maior gear score (Construções, Estatísticas,
 * Artefatos e a lista da aba Construções). Tier e quantidade valem para o HERÓI
 * aberto e ficam lembrados depois de baixar (lib/rtaTiers.js).
 * O botão é o ÚNICO ponto desta tela que usa a rede.
 */
'use strict';
const { html } = require('../../h.js');
const { Button, Dropdown, Glyph } = require('../../components/index.js');
const { useApp } = require('../../state/app.js');
const officialStats = require('../../../lib/officialStats.js');
const communityBuilds = require('../../../lib/communityBuilds.js');
const fmt = require('../../format.js');

const TIER_OPTS = officialStats.TIERS.map((t) => ({ value: t.code, label: t.label }));
const COUNT_OPTS = communityBuilds.COUNT_OPTIONS.map((n) => ({ value: n, label: fmt.int(n) }));

function ageText(iso) {
  if (!iso) return 'nunca baixado';
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 864e5);
  return d <= 0 ? 'baixado hoje' : (d === 1 ? 'baixado ontem' : `baixado há ${d} dias`);
}

function CommunityActions({ hero }) {
  const app = useApp();
  const entry = app.community[hero.name] || {};
  const tier = app.rtaTierOf(hero.name);
  const count = app.buildsCountOf(hero.name);
  const tierLabel = (officialStats.TIERS.find((t) => t.code === tier) || {}).label || tier;
  const busy = entry.status === 'loading' || entry.rtaStatus === 'loading';
  const s = entry.summary;
  return html`<span className="cm-actions">
    <span className="cm-tier" title=${`RTA de ${tierLabel} pra cima`}>
      <${Glyph} name="arrow-up" size=${13} />
      <span className="sub">RTA:</span>
      <${Dropdown} options=${TIER_OPTS} value=${tier} onChange=${(t) => app.setRtaTier(hero.name, t)} />
    </span>
    <span className="cm-tier" title="Builds de maior gear score">
      <span className="sub">Builds:</span>
      <${Dropdown} options=${COUNT_OPTS} value=${count} onChange=${(n) => app.setBuildsCount(hero.name, n)} />
    </span>
    <${Button} variant="accent" disabled=${busy}
      title=${`RTA de ${tierLabel} pra cima + ${fmt.int(count)} builds · ${ageText(s && s.generatedAt)}`}
      onClick=${() => app.downloadCommunity(hero.name)}>
      <${Glyph} name="download" size=${14} /> ${busy ? 'Baixando…' : 'Baixar'}
    <//>
  </span>`;
}

module.exports = { CommunityActions };
