/*
 * Dropdown — lista de seleção do projeto, em dois modos:
 *   single  → escolhe um; o campo mostra o valor escolhido.
 *   multiple→ escolhe vários (OU entre eles); o campo mostra o ÚNICO escolhido
 *             quando só há um, e um badge com a QUANTIDADE quando há vários
 *             (o hover/title lista quais).
 * O menu FLUTUA (position:absolute + z-index): nunca empurra o conteúdo abaixo.
 *
 * options: [{ value, label, icon }]  — `icon` é um nó pronto (ex.: <SetIcon/>).
 * value:   single → o valor; multiple → array de valores.
 * LIMPAR: com algo escolhido, um × discreto no lugar da setinha zera SÓ este campo (multiple → [],
 *   single → a opção vazia se existir, senão null — no single só com `clearable`, que filtro passa).
 * `search` (texto do placeholder): campo de busca no topo da lista; digitar filtra pelo nome.
 * Teclado (useListKeys, também usado pelo seletor de dono da peça): ↑↓ abrem e
 * movem, Home/End, Enter escolhe, Esc fecha SÓ a lista.
 */
'use strict';
const { html, useState, useRef, useEffect } = require('../h.js');
const { Checkbox } = require('./Checkbox.js');
const { Glyph } = require('./glyphs.js');

function useClickOutside(ref, onOut, active) {
  useEffect(() => {
    if (!active) return undefined;
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) onOut(); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [active, onOut]);
}

let seq = 0;
// clicar na lista (opção ou barra de rolagem) não tira o foco do gatilho: senão o
// onBlur fecharia a lista no meio do clique
const keepFocus = (e) => e.preventDefault();

/*
 * Teclado de lista suspensa. O foco fica no gatilho (botão ou campo de busca) e a
 * opção ativa vai por aria-activedescendant. Esc é ouvido na CAPTURA do document
 * e para ali: o diálogo em volta (popout de peça, Modal) não fecha junto.
 */
function useListKeys({ open, setOpen, count, start, onPick, popRef }) {
  const [act, setAct] = useState(-1);
  const id = useRef(null);
  if (id.current == null) id.current = 'lk' + (++seq);
  useEffect(() => { if (open) setAct(start >= 0 ? start : 0); }, [open]);
  useEffect(() => {
    if (!open) return undefined;
    const h = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setOpen(false); } };
    document.addEventListener('keydown', h, true);
    return () => document.removeEventListener('keydown', h, true);
  }, [open]);
  useEffect(() => {
    const el = open && popRef && popRef.current && popRef.current.querySelector(`[data-i="${act}"]`);
    if (el) el.scrollIntoView({ block: 'nearest' });
  }, [act, open]);
  const clamp = (i) => Math.max(0, Math.min(count - 1, i));
  function onKeyDown(e) {
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); setOpen(true); }
      return;
    }
    const to = { ArrowDown: act + 1, ArrowUp: act - 1, Home: 0, End: count - 1 }[e.key];
    if (to != null) { e.preventDefault(); setAct(clamp(to)); return; }
    if (e.key === 'Enter' && act >= 0 && act < count) { e.preventDefault(); onPick(act); }
  }
  const optId = (i) => `${id.current}-${i}`;
  // Tab para fora do componente fecha a lista (antes ela ficava aberta até um clique fora)
  const onBlur = (e) => { if (open && !(e.currentTarget.contains(e.relatedTarget))) setOpen(false); };
  return { act, setAct, onKeyDown, onBlur, optId, activeId: open && act >= 0 && act < count ? optId(act) : undefined };
}

const isBlank = (v) => v == null || v === '';

function Dropdown({ options, value, onChange, multiple, placeholder, label, className, disabled, clearable, search }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const wrap = useRef(null);
  const pop = useRef(null);
  useClickOutside(wrap, () => setOpen(false), open);
  useEffect(() => { if (!open) setQ(''); }, [open]);

  const all = options || [];
  const qq = search ? q.trim().toLowerCase() : '';
  const opts = qq ? all.filter((o) => String(o.label).toLowerCase().includes(qq)) : all;
  const sel = multiple ? (Array.isArray(value) ? value : []) : (value == null ? [] : [value]);
  const keys = useListKeys({ open, setOpen, count: opts.length, popRef: pop,
    start: opts.findIndex((o) => sel.includes(o.value)), onPick: (i) => pick(opts[i].value) });
  useEffect(() => { if (open && qq) keys.setAct(0); }, [qq]);   // buscou: o 1º achado fica ativo
  const chosen = all.filter((o) => sel.includes(o.value));
  const names = chosen.map((o) => o.label).join(', ');
  const blankOpt = multiple ? null : all.find((o) => isBlank(o.value));
  const canClear = !disabled && chosen.some((o) => !isBlank(o.value)) && (multiple || clearable || !!blankOpt);
  function clear() {
    onChange && onChange(multiple ? [] : (blankOpt ? blankOpt.value : null));
    setOpen(false);
  }

  function pick(v) {
    if (!multiple) { onChange && onChange(v); setOpen(false); return; }
    const set = new Set(sel);
    set.has(v) ? set.delete(v) : set.add(v);
    onChange && onChange([...set]);
  }

  // o que aparece dentro do campo fechado
  let face;
  if (chosen.length === 0) face = html`<span className="muted ellipsis">${placeholder || label || '—'}</span>`;
  else if (chosen.length === 1) face = html`<span className="contents">${chosen[0].icon || ''}<span className="ellipsis">${chosen[0].label}</span></span>`;
  else face = html`<span className="contents">${label ? html`<span className="sub">${label}</span>` : ''}<span className="count">${chosen.length}</span></span>`;

  const cls = ['ui-dd', open ? 'open' : '', chosen.length ? 'filled' : '', className || ''].filter(Boolean).join(' ');

  return html`<span className=${'ui-dd-wrap' + (canClear ? ' clearable' : '')} ref=${wrap} onBlur=${keys.onBlur}>
    <button type="button" className=${cls} disabled=${!!disabled}
      title=${chosen.length ? names : undefined} aria-label=${label}
      role="combobox" aria-haspopup="listbox" aria-expanded=${open}
      aria-controls=${open ? keys.optId('lista') : undefined} aria-activedescendant=${keys.activeId}
      onClick=${() => setOpen((o) => !o)} onKeyDown=${keys.onKeyDown}>
      ${face}<${Glyph} name="chevron-down" size=${12} className="caret" />
    </button>
    ${canClear ? html`<button type="button" className="ui-dd-x" aria-label=${`Limpar ${label || placeholder || 'seleção'}`}
      title="Limpar" onClick=${clear}><${Glyph} name="close" size=${9} /></button>` : ''}
    ${open ? html`<div className=${'ui-pop' + (search ? ' has-q' : '')} role="listbox" ref=${pop} id=${keys.optId('lista')}
      aria-multiselectable=${multiple ? 'true' : undefined} onMouseDown=${(e) => { if (e.target.tagName !== 'INPUT') keepFocus(e); }}>
      ${search ? html`<input className="ui-num ui-pop-q" autoFocus placeholder=${search} value=${q}
        aria-label=${`Buscar em ${label || placeholder || 'lista'}`} aria-controls=${keys.optId('lista')} aria-activedescendant=${keys.activeId}
        onChange=${(e) => setQ(e.target.value)} onKeyDown=${keys.onKeyDown} />` : ''}
      ${search && !opts.length ? html`<div className="ui-pop-none">Nada com “${q.trim()}”</div>` : ''}
      ${opts.map((o, i) => html`<button type="button" className=${'ui-opt' + (i === keys.act ? ' act' : '')} key=${String(o.value)}
        id=${keys.optId(i)} data-i=${i} tabIndex=${-1}
        role="option" aria-selected=${sel.includes(o.value)}
        onMouseEnter=${() => keys.setAct(i)} onClick=${() => pick(o.value)}>
        ${multiple ? html`<${Checkbox} checked=${sel.includes(o.value)} readOnly=${true} /> ` : ''}
        ${o.icon || ''}
        <span className="ellipsis">${o.label}</span>
      </button>`)}
    </div>` : ''}
  </span>`;
}

module.exports = { Dropdown, useListKeys, keepFocus };
