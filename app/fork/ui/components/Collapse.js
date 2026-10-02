/*
 * Collapse — abre/fecha um bloco animando a ALTURA (a janela em volta cresce
 * aos poucos em vez de pular). Fechando, o conteúdo continua montado até a
 * animação acabar. Aberto, fica com altura automática e overflow visível
 * (menus suspensos de dentro não são cortados).
 *
 * Electron 16 (Chrome 96) não anima grid-template-rows: a altura vai por JS.
 */
'use strict';
const { React, html, useState, useRef } = require('../h.js');

const MS = 220;   // mesma duração do CSS (.ui-collapse)
// sem DOM (sonda SSR) o useLayoutEffect só gera aviso
const useLayout = typeof window === 'undefined' ? React.useEffect : React.useLayoutEffect;
const still = () => typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function Collapse({ open, className, children }) {
  const ref = useRef(null);
  const kept = useRef(children);
  if (open) kept.current = children;
  // 'open' | 'opening' | 'closing' | 'closed'
  const [phase, setPhase] = useState(open ? 'open' : 'closed');
  if (open && (phase === 'closed' || phase === 'closing')) setPhase('opening');
  if (!open && (phase === 'open' || phase === 'opening')) setPhase('closing');

  const prev = useRef(phase);
  useLayout(() => {
    const el = ref.current;
    const was = prev.current;
    prev.current = phase;
    if (!el) return undefined;
    if (phase === 'open') { el.style.height = ''; return undefined; }
    if (phase === 'closed') return undefined;
    const end = phase === 'opening' ? 'open' : 'closed';
    if (still()) { setPhase(end); return undefined; }
    // parte da altura ATUAL (inverter no meio da animação não dá salto); recém-montado parte do 0
    const from = was === 'closed' ? 0 : el.offsetHeight;
    el.style.height = from + 'px';
    void el.offsetHeight;   // fixa a altura de partida antes de trocar
    el.style.height = (phase === 'opening' ? el.scrollHeight : 0) + 'px';
    const t = setTimeout(() => setPhase(end), MS);
    return () => clearTimeout(t);
  }, [phase]);

  if (phase === 'closed') return null;
  return html`<div ref=${ref} className=${'ui-collapse ' + phase + (className ? ' ' + className : '')}>${open ? children : kept.current}</div>`;
}

module.exports = { Collapse };
