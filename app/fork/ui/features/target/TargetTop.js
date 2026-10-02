/*
 * TargetTop — o topo do herói quando uma BUILD-ALVO (pública ou marcada) está
 * escolhida na lista:
 *   barra do herói com o selo da build e "Minha build" para voltar
 *   [1 Bônus (simulação)] [2 Status no jogo (da build)] [3 Calculado] [4 Equipamentos]
 * A coluna 2 tem o MESMO formato da sua build: total + ▲ do que vem de fora da
 * base (equipamento, sets e bônus). A 4 compara o que o gear da build dá com o seu.
 *
 * Os números da build e os calculados vêm do backend (/fork/calculateStats, já
 * dentro da linha). O "quanto o gear precisa" também (/fork/gearNeeded), pedido
 * de novo a cada mudança da simulação — com uma pequena espera para não disparar
 * uma chamada por clique.
 */
'use strict';
const { html, useState, useEffect, useRef } = require('../../h.js');
const { Box, SetIcon, StatIcon, Glyph } = require('../../components/index.js');
const { useApp } = require('../../state/app.js');
const statInfo = require('../../../lib/statInfo.js');
const targetBuild = require('../../../lib/targetBuild.js');
const heroBonus = require('../../../lib/heroBonus.js');
const forkCalc = require('../../../lib/forkCalc.js');
const fmt = require('../../format.js');
const { HeroBar } = require('../top/HeroBar.js');
const { DerivedStats, Row } = require('../top/StatColumns.js');
const { SimBonusColumn } = require('./SimBonusColumn.js');
const { GearNeedColumn } = require('./GearNeedColumn.js');

const WAIT_MS = 250;
const BADGE = { pro: 'Pro', community: 'Comunidade' };

function ColHead({ children }) {
  return html`<div className="colh"><span className="label">${children}</span></div>`;
}

/* coluna 2: os stats da build-alvo, como o jogo mostra (total + ▲ sobre a base) */
function TargetStats({ hero, row }) {
  const s = row.stats || {};
  const base = targetBuild.baseStats(hero.name) || {};
  const f = (e, v) => fmt[e.pct ? 'pct' : 'int'](v);
  return html`<${Box} className="sc">
    <div className="sc-head">
      <span className="sc-cp tnum" title="CP">
        <span className="sub">CP</span> ${fmt.int(s.cp)}
      </span>
      <span className="sc-sets">
        ${(row.setIcons || []).map((ic, i) => html`<span key=${i} className="sc-set" title=${`${ic.set.replace(/Set$/, '')} · ${ic.count} peças`}>
          <${SetIcon} set=${ic.set} size=${16} /><b className="tnum">${ic.count}</b></span>`)}
      </span>
    </div>
    <div className="sc-list">
      ${statInfo.GAME.map((e) => {
        const has = s[e.k] != null && base[e.k] != null;
        const gain = has ? Math.round(s[e.k] - base[e.k]) : 0;
        return html`<${Row} key=${e.k}
          title=${has ? `Base ${f(e, base[e.k])} + ${f(e, gain)}` : undefined}
          icon=${html`<${StatIcon} stat=${e.icon} size=${14} />`}
          label=${e.label} value=${f(e, s[e.k])} gain=${gain > 0 ? f(e, gain) : ''} />`;
      })}
      <${Row}
        icon=${html`<${Glyph} name="dual" size=${14} />`}
        label="Ataque em dupla" value=${fmt.pct(s.dac != null ? s.dac : base.dac)} gain="" />
    </div>
  <//>`;
}

function TargetTop({ hero, row, initialGear }) {
  const app = useApp();
  const acc = app.accountHero(hero.name);
  const artName = row.artifactCode ? heroBonus.artifactByCode(row.artifactCode) : null;
  const [sim, setSim] = useState(() => targetBuild.simDefaults(hero.name, artName));
  // initialGear: só para teste/sonda (resultado já pronto, sem esperar o backend)
  const [res, setRes] = useState(() => (initialGear ? { loading: false, result: initialGear } : { loading: true, result: null }));
  const seq = useRef(0);

  // outra build escolhida: simulação volta ao ponto de partida
  useEffect(() => { setSim(targetBuild.simDefaults(hero.name, artName)); }, [row.key]);

  useEffect(() => {
    const my = ++seq.current;
    setRes((r) => ({ loading: true, result: r.result }));
    const t = setTimeout(async () => {
      const result = await forkCalc.gearNeeded({
        heroName: hero.name, heroId: acc ? acc.id : null, stats: row.stats, setIcons: row.setIcons, sim,
      });
      if (my === seq.current) setRes({ loading: false, result });
    }, WAIT_MS);
    return () => clearTimeout(t);
  }, [row.key, sim]);

  const r = res.result;
  const plan = r && !r.error ? targetBuild.plan(r.need, acc && acc.equipment, targetBuild.baseStats(hero.name)) : null;

  return html`<div className="ht tt">
    <${HeroBar} hero=${hero} badge=${`${BADGE[row.origin] || 'Build'} · ${row.name}`} onExit=${app.clearTarget} />
    <div className="pt-grid">
      <section className="pt-col c1">
        <${ColHead}>Bônus<//>
        <${SimBonusColumn} hero=${hero} sim=${sim} artifactStats=${r && !r.error ? r.artifact : null}
          onChange=${(patch) => setSim((s) => Object.assign({}, s, patch))} />
      </section>
      <section className="pt-col c2">
        <${ColHead}>Status no jogo<//>
        <${TargetStats} hero=${hero} row=${row} />
      </section>
      <section className="pt-col c3">
        <${ColHead}>Calculado<//>
        <${DerivedStats} acc=${row.stats} />
      </section>
      <section className="pt-col c4">
        <${ColHead}>Equipamentos<//>
        <${GearNeedColumn} plan=${plan} equipment=${acc && acc.equipment}
          loading=${res.loading} error=${r && r.error} />
      </section>
    </div>
  </div>`;
}

module.exports = { TargetTop };
