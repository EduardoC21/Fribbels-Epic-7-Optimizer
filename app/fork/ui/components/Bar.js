/*
 * PriorityBar — barra de prioridade do otimizador. Mostra:
 *   fill  = o valor que EU defini (sólido)
 *   ghost = o valor original do arquétipo (atrás, apagado)
 *   mark  = um risco no ponto ORIGINAL, por cima de tudo — continua visível
 *           quando a barra passa dele (ex.: arquétipo pedia 2, eu pus 3)
 *   ticks = os pontos onde a barra pode parar
 * Editável: clicar OU arrastar; trava em cada valor inteiro. Setas do teclado ±1.
 *
 * QualityBar — barra de QUANTIDADE (não de intensidade): enche pela razão
 * percentual tenho÷preciso e a cor percorre o gradiente contínuo vermelho→verde.
 */
'use strict';
const { html, useRef } = require('../h.js');
const theme = require('../theme.js');

const pct = (n) => `${Math.max(0, Math.min(100, n * 100))}%`;

/* `min` (padrão 0) permite escala com negativo, como a do otimizador (-1 a 3) */
function PriorityBar({ value, ghost, min, max, onChange, title, label }) {
  const lo = min || 0;
  const m = max || 10;
  const span = m - lo;
  const v = Math.max(lo, Math.min(m, Number(value) || 0));
  const g = ghost == null ? null : Math.max(lo, Math.min(m, Number(ghost)));
  const at = (x) => (x - lo) / span;
  const ref = useRef(null);
  const valueAt = (clientX) => {
    const r = ref.current.getBoundingClientRect();
    const t = Math.max(0, Math.min(1, (clientX - r.left) / r.width));
    return lo + Math.round(t * span);   // trava no inteiro mais próximo
  };
  const onMouseDown = onChange ? (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    let last = valueAt(e.clientX);
    if (last !== v) onChange(last);
    const move = (ev) => { const nv = valueAt(ev.clientX); if (nv !== last) { last = nv; onChange(nv); } };
    const up = () => { document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up); };
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
  } : undefined;
  const onKeyDown = onChange ? (e) => {
    const d = e.key === 'ArrowRight' || e.key === 'ArrowUp' ? 1 : (e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -1 : 0);
    if (!d) return;
    e.preventDefault();
    const nv = Math.max(lo, Math.min(m, v + d));
    if (nv !== v) onChange(nv);
  } : undefined;
  const ticks = [];
  for (let x = lo + 1; x < m; x++) ticks.push(x);
  return html`<span ref=${ref} className=${'ui-pbar' + (onChange ? ' editable' : '')} title=${title}
    role="slider" aria-label=${label || title} aria-valuenow=${v} aria-valuemin=${lo} aria-valuemax=${m}
    aria-valuetext=${g != null && g !== v ? `${v} (original do arquétipo: ${g})` : String(v)}
    tabIndex=${onChange ? 0 : undefined} onMouseDown=${onMouseDown} onKeyDown=${onKeyDown}>
    ${g != null ? html`<span className="ghost" style=${{ width: pct(at(g)) }}></span>` : ''}
    <span className="fill" style=${{ width: pct(at(v)) }}></span>
    ${span <= 12 ? ticks.map((x) => html`<span key=${x} className="tick" style=${{ left: pct(at(x)) }}></span>`) : ''}
    ${g != null ? html`<span className="mark" style=${{ left: pct(at(g)) }} title=${`Arquétipo: ${g}`}></span>` : ''}
    <span className="knob" style=${{ left: pct(at(v)) }}></span>
  </span>`;
}

/*
 * ratio = tenho ÷ preciso. 1 = bateu o alvo; acima de 1 fica cheia e verde.
 * `neutral` é para o stat que a build não exige: barra cinza, sem julgamento.
 */
function QualityBar({ ratio, neutral, title }) {
  if (neutral) {
    return html`<span className="ui-qbar" title=${title || 'não exigido'}>
      <span style=${{ width: '100%', background: 'var(--line-soft)' }}></span>
    </span>`;
  }
  const r = Number(ratio);
  return html`<span className="ui-qbar" title=${title}>
    <span style=${{ width: pct(theme.qualityFill(r)), background: theme.qualityColor(r) }}></span>
  </span>`;
}

module.exports = { PriorityBar, QualityBar };
