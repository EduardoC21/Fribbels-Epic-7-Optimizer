/*
 * StatSheet — a ficha da peça (modelo C2/C3 aprovado):
 *
 *   #    Stat            Valor   Ups   [coluna do meio]   Modificar
 *   MAIN HP              2.700         → 2.835
 *   1    ATK%            28%     ›››   → 33%              [gema]
 *   2    CD% modificado  7%      ·     → 8%               [gema]  ← só esta pode
 *
 * As COLUNAS e as 4 linhas de substatus são as mesmas em todos os estados
 * (antes/depois da reforja, Editar campos aberto/fechado): nada pula de lugar.
 * Coluna do meio conforme o estado da peça (itemEdit.middleColumn):
 *   abaixo do +15 → "Próximo up": os valores de UM roll viram botões — clicar soma
 *                   o valor na linha e leva a peça ao próximo +3 (itemEdit.applyUp);
 *                   no nível em que entra substatus novo, a linha vazia escolhe o
 *                   atributo e as outras ficam bloqueadas
 *   nível 85 +15  → botão Reforjar no cabeçalho + reforgedValue do clássico
 *   88/90 no +15  → os UPS em destaque (a coluna pequena de Ups fica vazia); com
 *                   Editar campos aberto eles voltam para a coluna pequena
 * Editar campos aberto: a coluna Ups vira marcação editável (UpsEdit) — corrigir à
 * mão quantos ups cada linha levou; a soma tem de bater com aprimoramento ÷ 3.
 *
 * `editing` (Editar campos aberto): atributo e valor viram campos e a última
 * coluna vira a marca "modificado" (a mesma caixinha do diálogo do clássico).
 * `gem` = a troca da pedra SIMULADA que dá a nota do herói (modo da Pedra ≠ Sem troca): na linha dela,
 * [seta] atributo novo ao lado do nome e, na coluna logo depois do Valor, [seta] valor esperado — em
 * accent, seta = Glyph `arrow-right` (o símbolo de modificado, se houver, fica antes). A coluna da troca
 * existe sempre (vazia nas outras linhas): o valor atual não sai do alinhamento.
 */
'use strict';
const { html, useMemo, useState, useEffect } = require('../../h.js');
const { StatIcon, Dropdown, NumberField, Checkbox, Collapse, GameGlyph, Glyph } = require('../../components/index.js');
const itemStats = require('../../../lib/itemStats.js');
const IE = require('../../../lib/itemEdit.js');
const theme = require('../../theme.js');
const { Ups } = require('../top/GearCard.js');
const { ModPanel } = require('./ModPanel.js');

function statOpt(t) {
  const inf = itemStats.info(t);
  return { value: t, label: itemStats.label(t), icon: inf.icon ? html`<${StatIcon} stat=${inf.icon} size=${13} />` : null };
}

function StatName({ type, modified, gemTo }) {
  const inf = itemStats.info(type);
  const to = gemTo ? itemStats.info(gemTo) : null;
  return html`<span className="ip-stat">
    <${StatIcon} stat=${inf.icon} size=${16} />${itemStats.label(type)}
    ${modified ? html`<${GameGlyph} name="modified" size=${13} title="Modificado (gema)" className="ip-modmark" />` : ''}
    ${to ? html`<span className="ip-gem" title="Troca simulada da pedra">
      <${Glyph} name="arrow-right" size=${12} /><${StatIcon} stat=${to.icon} size=${14} />${itemStats.label(gemTo)}</span>` : ''}
  </span>`;
}

/* valores de um up como botões (todos se a faixa for curta; senão mín · méd · máx) */
function UpButtons({ type, range, onUp, blocked }) {
  const vals = IE.upValues(range);
  return html`<span className="ip-ups" title=${blocked || `Um up: ${itemStats.fmt(type, range.min)} a ${itemStats.fmt(type, range.max)}`}>
    ${vals.map((v) => html`<button type="button" key=${v} className=${'ip-upv tnum' + ((v === range.rare || v === range.rareLow) ? ' rare' : '')} aria-disabled=${!!blocked || !onUp}
      title=${(v === range.rare || v === range.rareLow) ? (v === range.rare ? 'Roll raro (acima da faixa)' : 'Roll raro (abaixo da faixa)') : undefined}
      aria-label=${`subir com +${itemStats.fmt(type, v)}${(v === range.rare || v === range.rareLow) ? ' (raro)' : ''}${blocked ? ' (bloqueado)' : ''}`}
      onClick=${() => { if (!blocked && onUp) onUp(v); }}>${itemStats.fmt(type, v)}</button>`)}
  </span>`;
}

/* ups em destaque (peça 88/90 no +15: a coluna do meio não tem outra serventia) */
function UpsBig({ n }) {
  if (!n) return html`<span className="ip-upsbig zero" aria-label="sem up">·</span>`;
  return html`<span className="ip-upsbig" style=${{ color: theme.upColor(n) }} aria-label=${`${n} up`}>${'›'.repeat(n)}</span>`;
}

/* ups editáveis: 5 marcações; clicar na k-ésima marca k ups (na última marcada, desmarca uma).
   Teclado: ← → ↑ ↓ Home End (role=slider) */
function UpsEdit({ n, min, line, onChange }) {
  const set = (v) => onChange(Math.max(min, Math.min(IE.MAX_UPS, v)));
  function onKeyDown(e) {
    const to = { ArrowRight: n + 1, ArrowUp: n + 1, ArrowLeft: n - 1, ArrowDown: n - 1, Home: min, End: IE.MAX_UPS }[e.key];
    if (to == null) return;
    e.preventDefault();
    set(to);
  }
  return html`<span className="ip-upsedit" role="slider" tabIndex=${0} aria-label=${`Ups da linha ${line}`}
    aria-valuemin=${min} aria-valuemax=${IE.MAX_UPS} aria-valuenow=${n} title="Ups da linha"
    onKeyDown=${onKeyDown} style=${{ color: n ? theme.upColor(n) : undefined }}>
    ${Array.from({ length: IE.MAX_UPS }, (_, k) => html`<i key=${k} className=${k < n ? 'on' : ''}
      onClick=${() => set(k + 1 === n ? k : k + 1)}>›</i>`)}
  </span>`;
}

function Mid({ kind, type, reforged, range, onUp, blocked }) {
  if (kind === 'reforge') {
    if (reforged == null) return html`<span className="ip-mid muted">—</span>`;
    // texto normal: na reforja tudo sobe, o verde não dizia nada e gritava mais que o valor real
    return html`<span className="ip-mid tnum"><${Glyph} name="arrow-right" size=${12} className="ip-arrow" />${itemStats.fmt(type, reforged)}</span>`;
  }
  if (kind === 'up') {
    if (!range) return html`<span className="ip-mid muted">—</span>`;
    return html`<${UpButtons} type=${type} range=${range} onUp=${onUp} blocked=${blocked} />`;
  }
  return html`<span></span>`;
}

function MidHead({ kind, onReforge }) {
  if (kind === 'up') return html`<span className="c acc">Próximo up</span>`;
  if (kind === 'ups') return html`<span className="c">Ups</span>`;
  if (kind === 'reforge') {
    return html`<button type="button" className="ip-refbtn c" onClick=${onReforge}
      title="Aplica a coluna (vale ao Salvar)">
      <${GameGlyph} name="reforge" size=${15} />Reforjar
    </button>`;
  }
  return html`<span></span>`;
}

function StatSheet({ draft, setDraft, editing, modLine, setModLine, onReforge, onUp, modType, gem }) {
  const mid = IE.middleColumn(draft);
  const newSub = mid === 'up' && IE.upAddsSub(draft);   // o próximo up é um substatus novo
  const [newType, setNewType] = useState(null);
  useEffect(() => { setNewType(null); }, [draft.enhance, draft.substats.length]);
  // derivados pelo código do clássico (valor pós-reforja); peça incompleta não tem
  const aug = useMemo(() => { try { return IE.augment(draft); } catch (e) { return null; } }, [draft]);
  const bigUps = !editing && mid === null;   // 88/90 no +15: ups em destaque na coluna do meio
  const uc = editing ? IE.upsCheck(draft) : null;
  // ups do RASCUNHO quando todas as linhas têm rolls (o augment do clássico completaria os que faltam
  // e esconderia a correção à mão); senão a estimativa do clássico
  const ups = useMemo(() => itemStats.upgradeCounts(IE.upsCheck(draft) ? draft : (aug || draft)), [aug, draft]);

  const set = (fn) => setDraft((d) => { const n = IE.clone(d); fn(n); return n; });
  const setMain = (patch) => set((n) => { n.main = { ...n.main, ...patch }; });
  const setSub = (i, patch) => set((n) => {
    const cur = n.substats[i] || {};
    if (patch.type === null) { n.substats.splice(i, 1); return; }
    const next = { ...cur, ...patch };
    if (patch.type && patch.type !== cur.type) delete next.rolls;   // atributo trocado à mão: o clássico reestima
    if (i < n.substats.length) n.substats[i] = next; else n.substats.push(next);
  });
  const setModified = (i, on) => set((n) => { n.substats.forEach((s, k) => { s.modified = on && k === i; }); });

  // sempre as 4 linhas: peça com menos substatus mostra a linha vazia (a altura não muda)
  const rows = Array.from({ length: IE.MAX_SUBS }, (_, i) => draft.substats[i] || null);
  const empty = html`<span></span>`;

  return html`<div className="ip-sheet">
    <div className="ip-grid ip-gh">
      <span></span><span>Stat</span><span className="r">Valor</span><span></span>
      <span className=${uc && !uc.ok ? 'warn' : ''} title=${uc && !uc.ok ? `Os ups somam ${uc.sum}; no +${draft.enhance} são ${uc.want}` : undefined}>
        ${bigUps ? '' : 'Ups'}${uc && !uc.ok ? html` <span className="tnum">${uc.sum}/${uc.want}</span>` : ''}
      </span>
      <${MidHead} kind=${bigUps ? 'ups' : mid} onReforge=${onReforge} />
      <span className="c">Modificar</span>
    </div>

    <div className="ip-grid ip-row main">
      <span className="ip-idx acc">MAIN</span>
      ${editing
        ? html`<${Dropdown} options=${IE.mainTypes(draft.gear).map(statOpt)} value=${draft.main.type}
            onChange=${(t) => setMain({ type: t })} />`
        : html`<${StatName} type=${draft.main.type} />`}
      ${editing
        ? html`<${NumberField} className="r" label="Valor do main" value=${draft.main.value} min=${0} onChange=${(v) => setMain({ value: v })} />`
        : html`<b className="r tnum ip-mainv">${itemStats.fmt(draft.main.type, draft.main.value)}</b>`}
      ${empty}${empty}
      ${mid === 'reforge'
        ? html`<${Mid} kind=${mid} type=${draft.main.type} reforged=${aug && aug.main.reforgedValue} />`
        : mid === 'up' && IE.nextUpLevel(draft) === 15 && IE.mainAt15(draft) != null
          ? html`<span className="ip-mid tnum" title="Main no +15"><${Glyph} name="arrow-right" size=${12} className="ip-arrow" />${itemStats.fmt(draft.main.type, IE.mainAt15(draft))}</span>`
          : empty}
      ${empty}
    </div>

    ${rows.map((s, i) => {
      const open = modLine === i && !editing;
      const plus15 = IE.isPlus15(draft);   // abaixo do +15 não existe gema: coluna vazia, sem botão morto
      const can = s && IE.canModify(draft, i);
      const why = s ? IE.modBlockReason(draft, i) : null;
      const isNewRow = newSub && !s && i === draft.substats.filter((x) => x && x.type).length && !editing;
      return html`<div key=${i} className=${'ip-rw' + (open ? ' open' : '')}>
        <div className="ip-grid ip-row">
          <span className="ip-idx">${i + 1}</span>
          ${editing
            ? html`<${Dropdown} placeholder="—"
                options=${[{ value: '', label: '—' }, ...IE.freeSubTypes(draft, i).concat(s ? [s.type] : [])
                  .filter((t, k, a) => a.indexOf(t) === k).map(statOpt)]}
                value=${s ? s.type : ''}
                onChange=${(t) => setSub(i, { type: t || null })} />`
            : s ? html`<${StatName} type=${s.type} modified=${s.modified} gemTo=${gem && gem.line === i && gem.from === s.type ? gem.to : null} />`
            : isNewRow ? html`<${Dropdown} placeholder="substatus novo" label=${`Substatus novo (linha ${i + 1})`}
                options=${IE.freeSubTypes(draft, i).map(statOpt)} value=${newType} onChange=${setNewType} />`
            : html`<span className="muted">—</span>`}
          ${!s ? empty
            : editing ? html`<${NumberField} className="r" label=${`Valor do substatus ${i + 1}`} value=${s.value} min=${0} onChange=${(v) => setSub(i, { value: v })} />`
            : html`<span className="r tnum">${itemStats.fmt(s.type, s.value)}</span>`}
          ${s && !editing && gem && gem.line === i && gem.from === s.type
            ? html`<span className="ip-gem tnum" title="Máximo da pedra superior">
                <${Glyph} name="arrow-right" size=${12} />${itemStats.fmt(gem.to, gem.value)}</span>`
            : empty}
          ${!s || bigUps ? empty
            : editing ? html`<${UpsEdit} n=${ups[i] || 0} min=${IE.minUps(draft, i)} line=${i + 1}
                onChange=${(n) => setDraft((d) => IE.setUps(d, i, n))} />`
            : html`<${Ups} n=${ups[i]} />`}
          ${s && bigUps ? html`<span className="c"><${UpsBig} n=${ups[i]} /></span>`
            : s ? html`<${Mid} kind=${mid} type=${s.type}
              reforged=${aug && aug.substats[i] ? aug.substats[i].reforgedValue : null}
              range=${mid === 'up' ? IE.upRange(draft, s.type) : null}
              onUp=${onUp && ((v) => onUp(i, v))}
              blocked=${newSub ? `No +${IE.nextUpLevel(draft)} entra substatus novo: escolha na linha vazia` : null} />`
            : isNewRow && newType ? html`<${Mid} kind="up" type=${newType} range=${IE.upRange(draft, newType)}
              onUp=${onUp && ((v) => onUp(i, v, newType))} />`
            : empty}
          ${!s || !plus15 ? empty
            : editing ? html`<span className="c"><${Checkbox} checked=${!!s.modified} label=${`linha ${i + 1} modificada`}
                onChange=${(on) => setModified(i, on)} /></span>`
            : html`<button type="button" className=${'ip-modbtn' + (open ? ' on' : '')} aria-disabled=${!can}
                aria-label=${`modificar linha ${i + 1}${can ? '' : ': ' + why}`} aria-expanded=${open}
                title=${can ? (open ? 'Fechar' : 'Modificar (uma linha por peça)') : why}
                onClick=${() => { if (can) setModLine(open ? null : i); }}>
                <${GameGlyph} name="modify" size=${17} />
              </button>`}
        </div>
        <${Collapse} open=${open}>
          <${ModPanel} draft=${draft} index=${i} initialType=${modType}
            onApply=${(d) => { setDraft(d); setModLine(null); }}
            onCancel=${() => setModLine(null)} />
        <//>
      </div>`;
    })}
  </div>`;
}

module.exports = { StatSheet };
