/*
 * ModPanel — modificar um substatus com gema (modelo C3 aprovado).
 *
 * Regras do jogo: só no +15; só UM substatus por peça fica modificado e, depois,
 * só ele pode ser modificado de novo (lib/itemEdit.canModify). Os atributos que a
 * gema aceita são o `allowedMods` do ItemAugmenter do clássico; a faixa de valor é
 * o constants.modValues do clássico (peça reforjada ou não × gema menor/maior ×
 * nº de rolls da linha). O usuário informa o valor que SAIU no jogo.
 * Sem texto de instrução na tela (pedido do Eduardo): explicação só em tooltip.
 */
'use strict';
const { html, useState, useMemo } = require('../../h.js');
const { StatIcon, Button, Segmented, NumberField, GameGlyph } = require('../../components/index.js');
const itemStats = require('../../../lib/itemStats.js');
const IE = require('../../../lib/itemEdit.js');

const GEM_PT = { lesser: 'Menor', greater: 'Maior' };
const rangeTxt = (type, r) => (r ? `${itemStats.fmt(type, r.min)}–${itemStats.fmt(type, r.max)}` : '—');

/* `initialType` só para teste/sonda (atributo já escolhido) */
function ModPanel({ draft, index, onApply, onCancel, initialType }) {
  const options = useMemo(() => IE.modOptions(draft, index), [draft, index]);
  const [type, setType] = useState(initialType || null);
  const [gem, setGem] = useState('greater');
  const [value, setValue] = useState(null);

  const rolls = useMemo(() => IE.lineRolls(draft, index), [draft, index]);
  const reforged = IE.modKind(draft) === 'reforged';
  // 85 que ainda reforja: a faixa de agora e a mesma depois da reforja (o jogo soma o bônus da reforja na linha)
  const later = type && IE.reforgesLater(draft) ? IE.modRange(draft, index, gem, type, 'reforged') : null;
  const ranges = useMemo(() => (type ? {
    lesser: IE.modRange(draft, index, 'lesser', type),
    greater: IE.modRange(draft, index, 'greater', type),
  } : { lesser: null, greater: null }), [draft, index, type]);
  const r = ranges[gem];
  // faixa curta: todos os valores; fixo (faixa larga): 5 igualmente espaçados — como no up
  const quick = r ? IE.upValues({ min: r.min, max: r.max }) : [];
  const outOfRange = r && value != null && (value < r.min || value > r.max);

  // o que ficou de fora da lista (só no tooltip)
  const others = draft.substats.filter((s, k) => k !== index && s && !s.modified).map((s) => itemStats.label(s.type));
  const leftOut = `Fora da lista: ${itemStats.label(draft.main && draft.main.type)} (main)${others.length ? `, ${others.join(', ')} (outras linhas)` : ''}`;

  return html`<div className="ip-mod">
    <div className="ip-mod-sec">
      <span className="ip-lbl" title=${`${rolls} ${rolls === 1 ? 'roll' : 'rolls'} · tabela ${reforged ? 'reforjada' : 'não reforjada'}`}>Atributo novo</span>
      <div className="ip-chips" title=${leftOut}>
        ${options.map((o) => {
          const inf = itemStats.info(o.type);
          return html`<button type="button" key=${o.type} className=${'ip-chip' + (type === o.type ? ' on' : '')}
            aria-pressed=${type === o.type} onClick=${() => { setType(o.type); setValue(null); }}>
            <${StatIcon} stat=${inf.icon} size=${13} />${itemStats.label(o.type)}${o.keep ? ' (mesmo)' : ''}
          </button>`;
        })}
      </div>
    </div>

    <div className="ip-mod-grid">
      <div className="ip-mod-sec">
        <span className="ip-lbl">Gema</span>
        <${Segmented} label="Tipo de gema" value=${gem} onChange=${(g) => { setGem(g); setValue(null); }}
          options=${['lesser', 'greater'].map((g) => ({ value: g, label: `${GEM_PT[g]}${type ? ' · ' + rangeTxt(type, ranges[g]) : ''}` }))} />
      </div>
      <div className="ip-mod-sec">
        <span className="ip-lbl">Valor que saiu</span>
        <span className="ip-quick">
          ${quick.map((v) => html`<button type="button" key=${v} className=${'ip-qv tnum' + (value === v ? ' on' : '')}
            onClick=${() => setValue(v)}>${v}</button>`)}
          <${NumberField} value=${value} onChange=${setValue} min=${0} label="Valor que a gema deu no jogo"
            title="Valor que caiu no jogo" />
          ${r ? html`<span className="ip-mod-range tnum" title=${`Faixa da ${GEM_PT[gem].toLowerCase()} · ${r.rolls} ${r.rolls === 1 ? 'roll' : 'rolls'}`}>
            <span className="sub">mín</span> ${itemStats.fmt(type, r.min)} <span className="sub">máx</span> ${itemStats.fmt(type, r.max)}${later
              ? html`<span className="sub" title="Valor depois da reforja"> · reforjada ${itemStats.fmt(type, later.min)}–${itemStats.fmt(type, later.max)}</span>` : ''}</span>` : ''}
        </span>
      </div>
    </div>

    <div className="ip-mod-foot">
      ${type && value != null
        ? html`<span className="ip-mod-res">
            <b>${itemStats.label(type)} ${itemStats.fmt(type, value)}</b>
            <${GameGlyph} name="modified" size=${13} title="Modificado (gema)" className="ip-modmark" />
            ${outOfRange ? html`<span className="ip-note warn" title=${`Fora da faixa da gema ${GEM_PT[gem].toLowerCase()}`}>fora da faixa (${rangeTxt(type, r)})</span>` : ''}
          </span>`
        : ''}
      <span className="spacer"></span>
      <${Button} onClick=${onCancel} title="Esc">Fechar<//>
      <${Button} variant="accent" disabled=${!type || value == null || !(value > 0)}
        title="Depois, só esta linha poderá ser modificada"
        onClick=${() => onApply(IE.applyMod(draft, index, type, value))}>Aplicar<//>
    </div>
  </div>`;
}

module.exports = { ModPanel };
