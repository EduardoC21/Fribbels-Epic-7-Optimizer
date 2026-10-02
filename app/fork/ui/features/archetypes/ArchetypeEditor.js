/*
 * ArchetypeEditor — a bancada de UM arquétipo (tela Arquétipos, à direita da lista):
 *
 *   [símbolo] Nome do arquétipo ...................................... [Apagar]
 *   [ Símbolo: prévia grande │ classe · stats (0–3) · 2 cores ] [ Heróis com este arquétipo ]
 *   [ Otimizador: sets · mains │ stat | prioridade | mín | máx  (o mesmo editor da aba Otimizador) ]
 *
 * Tudo que muda sobe por onChange(arquétipo inteiro); quem grava é a tela (debounce).
 * O símbolo tem composição FIXA (components/ArchetypeSymbol): aqui só se escolhe
 * classe, quais stats e as duas cores.
 */
'use strict';
const { html, useState, useEffect, useRef } = require('../../h.js');
const { Box, Button, Glyph, Segmented, StatIcon, Portrait, ArchetypeSymbol, ClassIcon, InterestCut, Dropdown } = require('../../components/index.js');
const { ProfileSplit } = require('../optimizer/profileEditor.js');
const { CoverageSection } = require('../coverage/CoverageSection.js');
const { GEM_OPTS } = require('../coverage/coverageText.js');
const itemRatings = require('../../../lib/itemRatings.js');
const { ROLES } = require('../sidebar/order.js');
const archetypes = require('../../../lib/archetypes.js');
const statInfo = require('../../../lib/statInfo.js');

const CLASS_OPTS = ROLES.map((r) => ({ value: r.key, title: r.label, label: html`<${ClassIcon} role=${r.key} size=${24} />` }));
const MIN_CONTRAST = 3;   // abaixo disto o símbolo some no fundo (WCAG para gráfico)

/* contraste WCAG entre duas cores #rrggbb (checagem de legibilidade, não é conta do jogo) */
function contrast(a, b) {
  const lum = (hex) => {
    const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
      .map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  };
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
}

/* amostra nativa (abre o seletor do sistema) + campo #rrggbb para digitar exato */
function ColorField({ label, value, onChange }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const bad = !archetypes.HEX.test(draft);
  const type = (v) => {
    const t = v.trim().startsWith('#') ? v.trim() : '#' + v.trim();
    setDraft(t);
    if (archetypes.HEX.test(t)) onChange(t.toLowerCase());
  };
  return html`<div className="ab-color">
    <span className="ab-color-lab">${label}</span>
    <input type="color" className="ab-swatch" aria-label=${`${label}: escolher cor`} value=${value}
      onChange=${(e) => onChange(e.target.value)} />
    <input className=${'ab-hex tnum' + (bad ? ' bad' : '')} aria-label=${`${label}: código da cor`} aria-invalid=${bad}
      maxLength=${7} spellCheck=${false} value=${draft}
      onChange=${(e) => type(e.target.value)} onBlur=${() => setDraft(value)} />
  </div>`;
}

function SymbolBox({ arch, onSymbol }) {
  const sy = arch.symbol;
  const set = (patch) => onSymbol(Object.assign({}, sy, patch));
  const full = sy.subs.length >= archetypes.MAX_SUBS;
  const toggleSub = (k) => set({ subs: sy.subs.includes(k) ? sy.subs.filter((x) => x !== k) : sy.subs.concat(k) });
  const low = contrast(sy.bg, sy.fg) < MIN_CONTRAST;
  return html`<${Box} className="ab-box ab-sym">
    <div className="ab-head"><span className="label">Símbolo</span></div>
    <div className="ab-sym-body">
      <div className="ab-preview">
        <${ArchetypeSymbol} symbol=${sy} size=${104} title=${`Símbolo de ${arch.name || 'arquétipo sem nome'}`} />
        <span className="ab-mini" title="No seletor">
          <${ArchetypeSymbol} symbol=${sy} size=${36} /><${ArchetypeSymbol} symbol=${sy} size=${18} />
        </span>
      </div>
      <div className="ab-ctrls">
        <div className="ab-crow">
          <span className="ab-lab">Classe</span>
          <${Segmented} className="ab-cls" label="Símbolo principal (classe)" options=${CLASS_OPTS}
            value=${sy.main} onChange=${(v) => set({ main: v })} />
        </div>
        <div className="ab-crow">
          <span className="ab-lab">Stats</span>
          <span className="ab-stats" role="group" aria-label="Subsímbolos (até 3 stats)">
            ${statInfo.GAME.map((e) => {
              const i = sy.subs.indexOf(e.k);
              const on = i >= 0;
              const off = !on && full;
              return html`<button type="button" key=${e.k} className=${'ab-tog' + (on ? ' on' : '')}
                aria-pressed=${on} disabled=${off}
                title=${off ? `Máximo de ${archetypes.MAX_SUBS} stats` : e.label}
                aria-label=${e.label + (on ? `, posição ${i + 1}` : '')} onClick=${() => toggleSub(e.k)}>
                <${StatIcon} stat=${e.icon} size=${18} />
                ${on ? html`<b className="ab-ord tnum">${i + 1}</b>` : null}
              </button>`;
            })}
          </span>
          <span className="ab-count tnum muted">${sy.subs.length}/${archetypes.MAX_SUBS}</span>
        </div>
        <div className="ab-crow">
          <span className="ab-lab">Cores</span>
          <${ColorField} label="Fundo" value=${sy.bg} onChange=${(v) => set({ bg: v })} />
          <${ColorField} label="Símbolos" value=${sy.fg} onChange=${(v) => set({ fg: v })} />
        </div>
        <p className=${'ab-warn' + (low ? ' on' : '')} role="status">
          ${low ? 'Pouco contraste: o símbolo quase some no fundo.' : ''}
        </p>
      </div>
    </div>
  <//>`;
}

/* gêmeos (idênticos: contam no arquétipo) em cima, sem título; VARIANTES (atribuídos e diferentes: perfil próprio) embaixo */
function HeroesBox({ twins, variants, byName, onOpen }) {
  const face = (n, size) => {
    const h = byName[n];
    return html`<button type="button" key=${n} className="ab-hero" title=${`Otimizador de ${n}`}
      aria-label=${`Abrir o Otimizador de ${n}`} onClick=${() => onOpen(n)}>
      <${Portrait} code=${h && h.code} size=${size} />
    </button>`;
  };
  return html`<${Box} className="ab-box ab-heroes">
    <div className="ab-head">
      <span className="label">Heróis</span>
      <span className="spacer"></span>
      <span className="sub tnum" title="Gêmeos">${twins.length}</span>
    </div>
    <div className="ab-hlist">
      ${twins.length ? html`<div className="ab-hgrid">${twins.map((n) => face(n, 40))}</div>` : html`<p className="ab-none" title="Nenhum herói idêntico"></p>`}
      ${variants.length ? html`<div className="ab-var">
        <div className="ic-sec" title="Atribuídos, mas com barras, sets ou principais diferentes">Variantes · ${variants.length}</div>
        <div className="ab-hgrid sm">${variants.map((n) => face(n, 28))}</div>
      </div>` : ''}
    </div>
  <//>`;
}

function ArchetypeEditor({ arch, fresh, twins, variants, byName, onChange, onAskDelete, onOpenHero, globalMin, globalGem }) {
  const nameRef = useRef(null);
  // arquétipo recém-criado: o nome já vem selecionado para digitar por cima
  useEffect(() => { if (fresh && nameRef.current) { nameRef.current.focus(); nameRef.current.select(); } }, []);
  const patch = (p) => onChange(Object.assign({}, arch, p));
  return html`<div className="ab">
    <header className="ui-box hb ab-bar">
      <${ArchetypeSymbol} symbol=${arch.symbol} size=${44} />
      <input ref=${nameRef} className="ab-name" aria-label="Nome do arquétipo" placeholder="Nome do arquétipo"
        maxLength=${40} spellCheck=${false} value=${arch.name} onChange=${(e) => patch({ name: e.target.value })} />
      <${Button} className="bd-danger" onClick=${onAskDelete}>
        <span className="contents"><${Glyph} name="trash" size=${13} /> Apagar</span><//>
    </header>

    <div className="ab-top">
      <${SymbolBox} arch=${arch} onSymbol=${(symbol) => patch({ symbol })} />
      <${HeroesBox} twins=${twins} variants=${variants} byName=${byName} onOpen=${onOpenHero} />
    </div>

    <${Box} className="op-box ab-prof">
      <div className="op-head">
        <div className="op-hrow">
          <span className="label" title="Escolher este arquétipo num herói substitui barras, sets, principais, mín e máx dele">Otimizador</span>
          <span className="spacer"></span>
          <span className="eq-int" title="Régua do arquétipo. Vazio = a padrão">
            <${InterestCut} lead="Régua ≥" label="Régua deste arquétipo" value=${arch.interestMin}
              inherited=${globalMin} onChange=${(v) => patch({ interestMin: v })} />
          </span>
          <span className="eq-dd eq-gem" title=${arch.gemMode ? itemRatings.GEM_MODE_TIP[arch.gemMode] : 'Pedra herdada'}>
            <${Dropdown} label="Pedra deste arquétipo" options=${GEM_OPTS} value=${arch.gemMode} clearable=${true}
              placeholder=${itemRatings.GEM_MODE_LABEL[globalGem]} onChange=${(v) => patch({ gemMode: v })} /></span>
        </div>
      </div>
      <${ProfileSplit} profile=${arch} change=${(p) => patch({ sets: p.sets, mains: p.mains, stats: p.stats })} />
    <//>
    <${CoverageSection} profileId=${'a:' + arch.id} showAtt=${true} className="ab-cov" />

  </div>`;
}

module.exports = { ArchetypeEditor, contrast };
