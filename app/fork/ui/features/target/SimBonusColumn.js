/*
 * SimBonusColumn — coluna 1 do topo com uma build-alvo: Imprint, Artefato e EE
 * em SIMULAÇÃO. Mesmo visual da coluna de bônus normal, em tom de destaque,
 * e NADA é gravado na conta: muda só o cálculo de "o que o gear precisa entregar".
 *
 * Começa com imprint e EE no máximo e o artefato da própria build no nível 30
 * (targetBuild.simDefaults). Os stats do artefato vêm do BACKEND (resultado do
 * /fork/gearNeeded), não de conta feita aqui.
 */
'use strict';
const { html, useState } = require('../../h.js');
const { Glyph, Img, StatIcon, Stepper } = require('../../components/index.js');
const heroBonus = require('../../../lib/heroBonus.js');
const assets = require('../../../lib/assets.js');
const theme = require('../../theme.js');
const fmt = require('../../format.js');
const { BonusBox, EeStepper, EeFace } = require('../top/BonusColumn.js');
const { ArtifactPicker, ArtImg } = require('../top/ArtifactPicker.js');

function ImprintSim({ hero, value, onChange }) {
  const imp = heroBonus.imprint(hero.name, null);
  if (!imp) return html`<${BonusBox} title="Imprint" disabled=${true} ><span className="sub bx-note">sem imprint</span><//>`;
  const grades = Object.keys(imp.grades).sort((a, b) => imp.grades[a] - imp.grades[b]);
  const grade = value == null ? null : grades.filter((g) => value + 0.05 >= imp.grades[g]).pop() || null;
  const i = grade ? grades.indexOf(grade) : -1;
  const step = (d) => {
    const n = Math.max(-1, Math.min(grades.length - 1, i + d));
    onChange(n < 0 ? null : imp.grades[grades[n]]);
  };
  return html`<${BonusBox} title="Imprint" footer=${html`
    <span className="bx-step">
      <button type="button" className="bx-arw" aria-label="grau anterior" disabled=${i < 0} onClick=${() => step(-1)}>
        <${Glyph} name="chevron-left" size=${13} /></button>
      <span className="bx-val" style=${{ color: grade ? theme.rankVar(grade) : undefined }}>${grade || '—'}</span>
      <button type="button" className="bx-arw" aria-label="próximo grau" disabled=${i >= grades.length - 1} onClick=${() => step(1)}>
        <${Glyph} name="chevron-right" size=${13} /></button>
    </span>`}>
    ${grade ? html`<${Img} src=${assets.imprintGrade(grade)} size=${38} title=${`Imprint ${grade}`} />` : html`<span className="bx-big muted">—</span>`}
    <span className="bx-sub"><${StatIcon} stat=${imp.info.icon} size=${12} />
      ${value == null ? 'sem imprint' : `${imp.info.short} +${fmt.dec1(value)}${imp.pct ? '%' : ''}`}</span>
  <//>`;
}

function ArtifactSim({ hero, name, level, stats, onChange }) {
  const [picking, setPicking] = useState(false);
  const meta = name ? heroBonus.artifactList().find((a) => a.name === name) : null;
  const parts = stats ? [
    stats.attack ? `+${fmt.int(stats.attack)} ATK` : null,
    stats.health ? `+${fmt.int(stats.health)} HP` : null,
    stats.defense ? `+${fmt.int(stats.defense)} DEF` : null,
  ].filter(Boolean) : [];
  return html`<span className="contents">
    <${BonusBox} title="Artefato" onCenterClick=${() => setPicking(true)}
      footer=${name
        ? html`<${Stepper} value=${level} min=${0} max=${heroBonus.ARTIFACT_MAX_LEVEL}
            title="Nível do artefato" onChange=${(v) => onChange({ artifactLevel: v })} />`
        : ''}>
      ${name
        ? html`<span className="contents">
            <${ArtImg} name=${name} code=${meta && meta.code} size=${30} />
            <span className="bx-name ellipsis" title=${name}>${name}</span>
            <span className="bx-sub tnum">${stats ? (parts.join(' · ') || 'sem ATK/HP/DEF') : '…'}</span>
          </span>`
        : html`<span className="bx-note sub">escolher artefato</span>`}
    <//>
    ${picking ? html`<${ArtifactPicker} role=${hero.role} current=${name}
      onClose=${() => setPicking(false)}
      onPick=${(n) => { setPicking(false); onChange({ artifactName: n === 'None' ? null : n }); }} />` : ''}
  </span>`;
}

function EeSim({ hero, value, onChange }) {
  const ee = heroBonus.ee(hero.name, null);
  if (!ee) return html`<${BonusBox} title="EE" disabled=${true}><span className="sub bx-note">sem EE</span><//>`;
  return html`<${BonusBox} title="EE"
    footer=${html`<${EeStepper} ee=${ee} value=${value} onChange=${onChange} />`}>
    <${EeFace} ee=${ee} />
  <//>`;
}

/* sim = { imprintValue, eeValue, artifactName, artifactLevel }; onChange(patch) */
function SimBonusColumn({ hero, sim, artifactStats, onChange }) {
  return html`<div className="bx-col sim">
    <${ImprintSim} hero=${hero} value=${sim.imprintValue} onChange=${(v) => onChange({ imprintValue: v })} />
    <${ArtifactSim} hero=${hero} name=${sim.artifactName} level=${sim.artifactLevel} stats=${artifactStats} onChange=${onChange} />
    <${EeSim} hero=${hero} value=${sim.eeValue} onChange=${(v) => onChange({ eeValue: v })} />
  </div>`;
}

module.exports = { SimBonusColumn };
