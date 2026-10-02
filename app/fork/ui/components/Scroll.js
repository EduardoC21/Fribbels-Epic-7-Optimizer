/*
 * Scrollable — o painel com scroll PRÓPRIO do projeto.
 *
 * A barra é discreta e some sozinha: aparece ao passar o mouse por cima do
 * painel OU enquanto se está rolando, e some por fade pouco depois de parar.
 * O "enquanto rola" não dá para fazer só em CSS, então é aqui que a classe
 * `is-scrolling` entra e sai; todo o resto (traço, setas, fade) é CSS.
 */
'use strict';
const { html, useRef, useEffect } = require('../h.js');

const IDLE_MS = 800;   // quanto tempo a barra fica visível depois de parar de rolar

/* `innerRef` (opcional): quem precisa medir o painel (lista virtual) recebe o elemento */
function Scrollable({ className, style, horizontal, children, onScroll, role, label, innerRef }) {
  const own = useRef(null);
  const ref = innerRef || own;

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    let timer = null;
    const mark = () => {
      el.classList.add('is-scrolling');
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => el.classList.remove('is-scrolling'), IDLE_MS);
    };
    el.addEventListener('scroll', mark, { passive: true });
    return () => {
      el.removeEventListener('scroll', mark);
      if (timer) clearTimeout(timer);
    };
  }, []);

  const cls = ['ui-scroll', horizontal ? 'x' : '', className || ''].filter(Boolean).join(' ');
  return html`<div ref=${ref} className=${cls} style=${style} role=${role} aria-label=${label} onScroll=${onScroll}>${children}</div>`;
}

module.exports = { Scrollable };
