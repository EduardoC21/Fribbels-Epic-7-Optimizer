/*
 * BonusColumn — coluna 1 do topo: Imprint, Artefato e EE.
 * Título pequeno no canto de cima; conteúdo no centro; o valor editável fica
 * colado no rodapé (setas OU digitação, só inteiros dentro do intervalo).
 *
 * Gravar é caro (o backend recalcula o herói inteiro), então a edição é
 * "rascunho + commit": o número muda na hora na tela e a gravação só sai depois
 * de ~0,6s sem mexer — clicar a seta 5 vezes vira UMA gravação.
 */
'use strict';
const { html, useState, useEffect, useRef } = require('../../h.js');
const { Box, Glyph, Img, StatIcon, Stepper, GameGlyph } = require('../../components/index.js');
const { useApp } = require('../../state/app.js');
const heroBonus = require('../../../lib/heroBonus.js');
const assets = require('../../../lib/assets.js');
const theme = require('../../theme.js');
const fmt = require('../../format.js');
const { ArtifactPicker, ArtImg } = require('./ArtifactPicker.js');

const COMMIT_MS = 600;

/* valor local que reflete o servidor, mas pode ser editado antes de gravar */
function useDraft(serverValue, commit) {
  const [draft, setDraft] = useState(serverValue);
  const timer = useRef(null);
  useEffect(() => { setDraft(serverValue); }, [serverValue]);
  useEffect(() => () => clearTimeout(timer.current), []);
  const change = (v) => {
    setDraft(v);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => commit(v), COMMIT_MS);
  };
  return [draft, change];
}

/* símbolo do jogo no título de cada caixa (lib/assets.js GAME_GLYPHS) */
const TITLE_GLYPH = { Imprint: 'imprint', Artefato: 'artifact', EE: 'ee' };

function BonusBox({ title, children, footer, onCenterClick, disabled }) {
  return html`<${Box} className=${'bx' + (disabled ? ' off' : '')}>
    <span className="bx-title">${TITLE_GLYPH[title] ? html`<${GameGlyph} name=${TITLE_GLYPH[title]} size=${11} />` : ''}${title}</span>
    ${onCenterClick
      ? html`<button type="button" className="bx-center clickable" onClick=${onCenterClick}>${children}</button>`
      : html`<div className="bx-center">${children}</div>`}
    <div className="bx-foot">${footer}</div>
  <//>`;
}

/* ---------------- Imprint: graus D→SSS com o asset do próprio jogo ---------------- */
function ImprintBox({ hero, acc, onSave, disabled }) {
  const imp = heroBonus.imprint(hero.name, acc);
  const grades = imp ? Object.keys(imp.grades).sort((a, b) => imp.grades[a] - imp.grades[b]) : [];
  const [grade, setGrade] = useDraft(imp ? imp.grade : null,
    (g) => onSave({ imprintValue: g ? imp.grades[g] : null }));

  if (!imp) {
    return html`<${BonusBox} title="Imprint" disabled=${true}
      ><span className="sub bx-note">sem imprint</span><//>`;
  }
  const i = grade ? grades.indexOf(grade) : -1;
  const step = (d) => {
    const next = Math.max(-1, Math.min(grades.length - 1, i + d));
    setGrade(next < 0 ? null : grades[next]);
  };
  const value = grade ? imp.grades[grade] : null;

  return html`<${BonusBox} title="Imprint" disabled=${disabled} footer=${html`
    <span className="bx-step">
      <button type="button" className="bx-arw" aria-label="grau anterior" disabled=${disabled || i < 0} onClick=${() => step(-1)}>
        <${Glyph} name="chevron-left" size=${13} /></button>
      <span className="bx-val" style=${{ color: grade ? theme.rankVar(grade) : undefined }}>${grade || '—'}</span>
      <button type="button" className="bx-arw" aria-label="próximo grau" disabled=${disabled || i >= grades.length - 1} onClick=${() => step(1)}>
        <${Glyph} name="chevron-right" size=${13} /></button>
    </span>`}>
    ${grade
      ? html`<${Img} src=${assets.imprintGrade(grade)} size=${38} title=${`Imprint ${grade}`} />`
      : html`<span className="bx-big muted">—</span>`}
    <span className="bx-sub"><${StatIcon} stat=${imp.info.icon} size=${12} />
      ${value == null ? 'sem imprint' : `${imp.info.short} +${fmt.dec1(value)}${imp.pct ? '%' : ''}`}</span>
  <//>`;
}

/*
 * ---------------- Artefato: arte + nome + stats no nível; nível editável ----------------
 * Stats no nível: os do herói (backend, getAllHeroes) no nível gravado; enquanto o
 * nível é editado, a tabela do backend por nível (app.artifactLevels) — nada de
 * fórmula aqui. Sem a tabela ainda, mostra "…".
 */
function artifactStatsAt(app, art, level) {
  if (!art) return null;
  const table = app.artifactLevels[art.name];
  if (table && table[level]) return table[level];
  if (level === art.level) return { attack: art.attack, health: art.health, defense: art.defense };
  return null;
}

function ArtifactBox({ hero, acc, onSave, disabled }) {
  const app = useApp();
  const [picking, setPicking] = useState(false);
  const art = heroBonus.artifact(acc);
  const [level, setLevel] = useDraft(art ? art.level : null, (lv) => onSave({ artifactLevel: lv }));
  useEffect(() => { if (art) app.ensureArtifactLevels(art.name); }, [art && art.name]);
  const stats = artifactStatsAt(app, art, level == null ? 0 : level);
  const parts = stats ? [
    stats.attack ? `+${fmt.int(stats.attack)} ATK` : null,
    stats.health ? `+${fmt.int(stats.health)} HP` : null,
    stats.defense ? `+${fmt.int(stats.defense)} DEF` : null,
  ].filter(Boolean) : [];

  return html`<span className="contents">
    <${BonusBox} title="Artefato" disabled=${disabled}
      onCenterClick=${disabled ? undefined : () => setPicking(true)}
      footer=${art
        ? html`<${Stepper} value=${level} min=${0} max=${heroBonus.ARTIFACT_MAX_LEVEL}
            title="Nível do artefato" onChange=${disabled ? () => {} : setLevel} />`
        : ''}>
      ${art
        ? html`<span className="contents">
            <${ArtImg} name=${art.name} code=${art.code} size=${30} />
            <span className="bx-name ellipsis" title=${art.name}>${art.name}</span>
            <span className="bx-sub tnum">${stats ? (parts.join(' · ') || '—') : '…'}</span>
          </span>`
        : html`<span className="bx-note sub">${disabled ? 'sem artefato' : 'escolher artefato'}</span>`}
    <//>
    ${picking ? html`<${ArtifactPicker} role=${hero.role} current=${art && art.name}
      onClose=${() => setPicking(false)}
      onPick=${(name) => {
        setPicking(false);
        onSave({ artifactName: name, artifactLevel: name === 'None' ? 0 : (art ? art.level : heroBonus.ARTIFACT_MAX_LEVEL) });
      }} />` : ''}
  </span>`;
}

/* ---------------- EE: só o atributo que ele dá, no centro (o valor já está no editor) ---------------- */
/*
 * Faixa válida do EE: do valor base (nível 1) ao máximo do herói, só INTEIROS —
 * ex.: ATK% 7 a 14. Abaixo do mínimo = "sem EE" (—). Digitar só vale ao sair do
 * campo (Enter/Tab/clique fora): validar a cada tecla transformaria "12" em 7.
 */
function eeRange(ee) { return { lo: Math.ceil(ee.base), hi: Math.floor(ee.max) }; }
function EeStepper({ ee, value, onChange, disabled }) {
  const { lo, hi } = eeRange(ee);
  const v = value == null || Number(value) <= 0 ? null : Math.max(lo, Math.min(hi, Math.round(Number(value))));
  const [text, setText] = useState(null);   // o que está sendo digitado (null = não editando)
  const step = (d) => {
    if (v == null) { if (d > 0) onChange(lo); return; }
    const n = v + d;
    onChange(n < lo ? null : Math.min(hi, n));
  };
  const commit = () => {
    if (text == null) return;
    const t = text.trim();
    setText(null);
    if (t === '') { onChange(null); return; }
    const n = parseInt(t, 10);
    if (isFinite(n)) onChange(n <= 0 ? null : Math.max(lo, Math.min(hi, n)));
  };
  return html`<span className="bx-step" title=${`${lo} a ${hi} · vazio = sem EE`}>
    <button type="button" className="bx-arw" aria-label="diminuir" disabled=${disabled || v == null} onClick=${() => step(-1)}>
      <${Glyph} name="chevron-left" size=${13} /></button>
    <input className="bx-val bx-input tnum" inputMode="numeric" aria-label="Nível do EE" placeholder="—" disabled=${disabled}
      value=${text != null ? text : (v == null ? '' : String(v))}
      onChange=${(e) => setText(e.target.value.replace(/[^0-9]/g, '').slice(0, 3))}
      onBlur=${commit}
      onKeyDown=${(e) => { if (e.key === 'Enter') e.target.blur(); if (e.key === 'Escape') { setText(null); e.target.blur(); } }} />
    <button type="button" className="bx-arw" aria-label="aumentar" disabled=${disabled || v === hi} onClick=${() => step(1)}>
      <${Glyph} name="chevron-right" size=${13} /></button>
  </span>`;
}
/* o atributo do EE, centrado: ícone maior + nome */
function EeFace({ ee }) {
  return html`<span className="bx-ee"><${StatIcon} stat=${ee.info.icon} size=${22} /><span>${ee.info.short}${ee.pct ? '%' : ''}</span></span>`;
}

function EeBox({ hero, acc, onSave, disabled }) {
  const ee = heroBonus.ee(hero.name, acc);
  const [value, setValue] = useDraft(ee ? ee.value : null, (v) => onSave({ eeValue: v }));
  if (!ee) {
    return html`<${BonusBox} title="EE" disabled=${true}
      ><span className="sub bx-note">sem EE</span><//>`;
  }
  return html`<${BonusBox} title="EE" disabled=${disabled}
    footer=${html`<${EeStepper} ee=${ee} value=${value} disabled=${disabled} onChange=${setValue} />`}>
    <${EeFace} ee=${ee} />
  <//>`;
}

function BonusColumn({ hero }) {
  const app = useApp();
  const acc = app.accountHero(hero.name);
  // só herói fora da conta desabilita — gravar NÃO desabilita (era isso que fazia as 3 piscarem)
  const disabled = !acc;
  const save = (changes) => { if (acc) app.saveBonus(hero.name, changes); };
  return html`<div className="bx-col">
    <${ImprintBox} hero=${hero} acc=${acc} onSave=${save} disabled=${disabled} />
    <${ArtifactBox} hero=${hero} acc=${acc} onSave=${save} disabled=${disabled} />
    <${EeBox} hero=${hero} acc=${acc} onSave=${save} disabled=${disabled} />
  </div>`;
}

module.exports = { BonusColumn, BonusBox, useDraft, EeStepper, EeFace };
