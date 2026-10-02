/*
 * HoverCard — cartão informativo que aparece ao passar o mouse (ou focar) num
 * elemento. Desenhado no <body> (por cima de tabela com rolagem), abaixo do
 * elemento, ou acima se não couber; nunca sai da janela. Não recebe clique
 * (pointer-events: none): é leitura, não menu.
 *   <HoverCard content={() => nó} delay={180} focusable label>…gatilho…</HoverCard>
 * `content` é função: só monta o conteúdo quando abre (a tabela tem centenas de linhas).
 * `focusable`: o gatilho vira parada de Tab (fora de tabela, onde a linha já é a parada).
 */
'use strict';
const { html, ReactDOM, useState, useRef, useEffect } = require('../h.js');

const EDGE = 8;
const GAP = 6;

function Card({ anchor, children }) {
  const ref = useRef(null);
  const [pos, setPos] = useState({ left: 0, top: 0, visibility: 'hidden' });
  useEffect(() => {
    const el = ref.current;
    if (!el || !anchor) return;
    const a = anchor.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    let top = a.bottom + GAP;
    if (top + r.height > window.innerHeight - EDGE) top = Math.max(EDGE, a.top - GAP - r.height);
    const left = Math.max(EDGE, Math.min(a.left, window.innerWidth - r.width - EDGE));
    setPos({ left, top });
  }, []);
  return ReactDOM.createPortal(html`<div ref=${ref} className="ui-pop ui-hovercard" role="tooltip" style=${pos}>${children}</div>`, document.body);
}

function HoverCard({ content, children, className, delay, focusable, label }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const timer = useRef(null);
  const show = () => { clearTimeout(timer.current); timer.current = setTimeout(() => setOpen(true), delay == null ? 180 : delay); };
  const hide = () => { clearTimeout(timer.current); setOpen(false); };
  useEffect(() => {
    if (!open) return undefined;
    const away = () => hide();
    const esc = (e) => { if (e.key === 'Escape') hide(); };
    window.addEventListener('scroll', away, true);
    document.addEventListener('keydown', esc);
    return () => { window.removeEventListener('scroll', away, true); document.removeEventListener('keydown', esc); };
  }, [open]);
  useEffect(() => () => clearTimeout(timer.current), []);
  return html`<span ref=${ref} className=${'ui-hovercard-anchor' + (className ? ' ' + className : '')}
    tabIndex=${focusable ? 0 : undefined} aria-label=${label}
    onMouseEnter=${show} onMouseLeave=${hide} onFocus=${show} onBlur=${hide}>
    ${children}
    ${open ? html`<${Card} anchor=${ref.current}>${content()}<//>` : ''}
  </span>`;
}

module.exports = { HoverCard };
