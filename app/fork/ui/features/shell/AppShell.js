/*
 * AppShell — a moldura da janela, com DOIS níveis de navegação:
 *   1. topo: a lista de TELAS do app (a primeira é "Herói"; outras entram depois)
 *   2. dentro de Herói: barra lateral (lista/rank) + área central com o topo do
 *      herói e, ABAIXO dele, as abas Principal/Estatísticas/Construções/Otimizador
 *
 * As telas registradas aqui são o único lugar que precisa mudar para ganhar uma
 * tela nova no topo. Tela visitada FICA MONTADA (só escondida) ao trocar: filtros, peça escolhida,
 * edição em andamento e rolagem voltam como estavam (Eduardo, 2026-10-01). Diálogo de tela escondida
 * não ouve teclado (components/Modal.js `shown`).
 */
'use strict';
const { html, useState, useEffect } = require('../../h.js');
const { Tabs, Scrollable } = require('../../components/index.js');
const { useApp } = require('../../state/app.js');
const { HeroSidebar } = require('../sidebar/HeroSidebar.js');
const { Catalog } = require('../../Catalog.js');
const { HeroTop } = require('../top/HeroTop.js');
const { PrincipalTab } = require('../principal/PrincipalTab.js');
const { StatisticsTab } = require('../community/StatisticsTab.js');
const { ConstructionsTab } = require('../community/ConstructionsTab.js');
const { CommunityActions } = require('../community/CommunityActions.js');
const { OptimizerTab, useTwinAsk, ruleHandlers } = require('../optimizer/OptimizerTab.js');
const { ArchetypeScreen } = require('../archetypes/ArchetypeScreen.js');
const { CoverageScreen } = require('../coverage/CoverageScreen.js');
const { CoverageSection } = require('../coverage/CoverageSection.js');
const interest = require('../../../lib/interest.js');
const { GearScreen } = require('../gear/GearScreen.js');
const { GameLink } = require('./GameLink.js');

const SCREENS = [
  { id: 'otimizador', label: 'Otimizador' },   // a tela própria de otimização (ainda vazia)
  { id: 'equipamentos', label: 'Equipamentos' },
  { id: 'heroi', label: 'Heróis' },
  { id: 'arquetipos', label: 'Arquétipos' },
  { id: 'cobertura', label: 'Cobertura' },
  // 'estilo' (catálogo de componentes) fica fora da barra; SCREEN_EL mantém para quem precisar
];

const HERO_TABS = [
  { id: 'principal', label: 'Principal' },
  { id: 'estatisticas', label: 'Estatísticas' },
  { id: 'construcoes', label: 'Construções' },
  { id: 'otimizador', label: 'Otimizador' },
  { id: 'cobertura', label: 'Cobertura' },
];
// abas cujo conteúdo é UMA LISTA: ela ocupa o resto da tela e rola por dentro
const LIST_TABS = new Set(['principal', 'construcoes', 'cobertura']);

/* aba Cobertura: a do perfil do herói (gêmeo → a do arquétipo; ele não conta como disputa de si mesmo). Régua e pedra
   editáveis aqui, as MESMAS do Otimizador do herói, com a mesma regra do gêmeo (outro valor = pergunta e vira variante) */
function HeroCoverage({ hero }) {
  const app = useApp();
  const p = interest.profileFor(app.ratingProfiles, 'h:' + hero.name);
  const twin = p && p.kind === 'a';
  const own = app.profileOf(hero.name) || {};
  const tier = app.isFavorite(hero.name) || app.isEquipavel(hero.name) ? 1 : 0;
  const { request, dialog } = useTwinAsk();
  const h = ruleHandlers(app, hero.name, twin ? { name: p.name, min: p.min, gem: p.gem } : null, request);
  const rule = {
    value: own.interestMin, inherited: twin ? p.min : (p ? p.inhMin : app.interestGlobal),
    gem: own.gemMode || null, gemInherited: twin ? p.gem : (p ? p.inhGem : app.profileGemMode),
    onCut: h.onCut, onGem: h.onGem,
  };
  return html`<span className="contents"><${CoverageSection} profileId=${p ? p.id : 'h:' + hero.name} self=${twin ? tier : undefined}
    rule=${rule} className="cvs-hero" />${dialog}</span>`;
}

/* Conteúdo das abas do herói */
function HeroTabContent({ tab, hero }) {
  if (tab === 'estatisticas') return html`<${StatisticsTab} key=${hero.name} hero=${hero} />`;
  if (tab === 'construcoes') return html`<${ConstructionsTab} key=${hero.name} hero=${hero} />`;
  if (tab === 'otimizador') return html`<${OptimizerTab} hero=${hero} />`;
  if (tab === 'cobertura') return html`<${HeroCoverage} key=${hero.name} hero=${hero} />`;
  return html`<${PrincipalTab} hero=${hero} />`;
}

/*
 * A área central, de cima para baixo (como no design base):
 *   topo do herói (barra + 4 colunas) — comum a todas as abas
 *   abas Principal / Estatísticas / Construções / Otimizador (+ RTA à direita)
 *   conteúdo da aba
 * Tudo rola junto, num scroll só.
 */
function HeroScreen() {
  const app = useApp();
  const hero = app.selected ? app.byName[app.selected] : null;
  return html`<div className="hero-screen">
    <${HeroSidebar} />
    <${Scrollable} className="hero-main">
      ${hero ? html`<div className=${'hero-col' + (LIST_TABS.has(app.tab) ? ' fill' : '')}>
        <${HeroTop} hero=${hero} />
        <${Tabs} items=${HERO_TABS} value=${app.tab} onChange=${app.setTab}
          right=${html`<${CommunityActions} hero=${hero} />`} />
        <div className="tab-body"><${HeroTabContent} tab=${app.tab} hero=${hero} /></div>
      </div>` : html`<div className="pt-empty"></div>`}
    <//>
  </div>`;
}

const OptimizerScreen = () => html`<div className="eq" aria-label="Otimizador"></div>`;
const SCREEN_EL = { otimizador: OptimizerScreen, heroi: HeroScreen, equipamentos: GearScreen, arquetipos: ArchetypeScreen, cobertura: CoverageScreen, estilo: Catalog };

function AppShell() {
  const app = useApp();
  const [visited, setVisited] = useState(() => new Set([app.screen]));
  useEffect(() => { setVisited((v) => (v.has(app.screen) ? v : new Set(v).add(app.screen))); }, [app.screen]);
  return html`<div className="shell">
    <nav className="shell-nav" aria-label="Telas">
      ${SCREENS.map((s) => html`<button type="button" key=${s.id}
        className=${'shell-screen' + (app.screen === s.id ? ' on' : '')}
        aria-current=${app.screen === s.id ? 'page' : undefined}
        onClick=${() => app.setScreen(s.id)}>${s.label}</button>`)}
      <span className="spacer"></span>
      <${GameLink} />
      <span className=${'shell-status' + (app.account.ready ? ' ok' : '')}
        title=${app.account.ready ? 'Backend conectado'
          : (app.account.loading ? 'Conectando ao backend…' : `Backend fora do ar — só dados públicos (${app.account.error || ''})`)}>
        ${app.account.ready ? `Conta · ${Object.keys(app.account.byName).length} heróis`
          : (app.account.loading ? 'Conectando…' : 'Sem conta')}
      </span>
    </nav>

    <div className="shell-body">
      ${app.catalogError
        ? html`<div className="shell-error">Não foi possível ler a base de heróis: ${app.catalogError}</div>`
        : SCREENS.filter((s) => s.id === app.screen || visited.has(s.id)).map((s) => html`<div key=${s.id}
            className="shell-pane" hidden=${s.id !== app.screen}>${html`<${SCREEN_EL[s.id]} />`}</div>`)}
    </div>

  </div>`;
}

module.exports = { AppShell, SCREENS, HERO_TABS };
