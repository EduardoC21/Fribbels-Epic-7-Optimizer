/*
 * Menu — lista de ações flutuante (desenhada no <body>, por cima de tudo).
 *   <Menu at={{ x, y, alignRight }} items onClose label />
 *     clique direito: `at` = posição do mouse; nunca sai da janela
 *   <MenuButton label items />
 *     botão "⋯" que abre o menu logo abaixo dele, alinhado pela direita
 * items = [{ label, icon (nome de glifo), onClick, disabled, danger, title, checked }]
 *   `{ heading: 'Título' }` = rótulo de seção (não clica); `checked` (true/false) = opção de escolha
 *   única (menuitemradio, ✓ na marcada; o espaço do ✓ fica reservado nas outras)
 * Fecha no clique fora, Esc, rolagem, redimensionar e depois de escolher.
 * Teclado: abre com foco no 1º item; ↑/↓ andam; Enter escolhe.
 */
'use strict';
const { html, ReactDOM, useState, useEffect, useRef } = require('../h.js');
const { Glyph } = require('./glyphs.js');

const EDGE = 8;   // folga até a borda da janela

/* `anchor` (opcional): o botão que abriu — clicar nele de novo quem fecha é o próprio botão */
function Menu({ at, items, onClose, label, anchor }) {
  const ref = useRef(null);
  const [pos, setPos] = useState({ left: at.x, top: at.y, visibility: 'hidden' });
  // mede e encaixa na janela antes de mostrar
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    let left = at.alignRight ? at.x - r.width : at.x;
    let top = at.y;
    left = Math.max(EDGE, Math.min(left, window.innerWidth - r.width - EDGE));
    top = Math.max(EDGE, Math.min(top, window.innerHeight - r.height - EDGE));
    setPos({ left, top });
    const first = el.querySelector('button:not([disabled])');
    if (first) first.focus();
  }, []);
  useEffect(() => {
    const down = (e) => {
      if (anchor && anchor.current && anchor.current.contains(e.target)) return;
      if (ref.current && !ref.current.contains(e.target)) onClose();
    };
    const key = (e) => { if (e.key === 'Escape') onClose(); };
    const away = () => onClose();
    document.addEventListener('mousedown', down, true);
    document.addEventListener('keydown', key);
    window.addEventListener('scroll', away, true);
    window.addEventListener('resize', away);
    window.addEventListener('blur', away);
    return () => {
      document.removeEventListener('mousedown', down, true);
      document.removeEventListener('keydown', key);
      window.removeEventListener('scroll', away, true);
      window.removeEventListener('resize', away);
      window.removeEventListener('blur', away);
    };
  }, [onClose]);
  const onKeyDown = (e) => {
    const d = e.key === 'ArrowDown' ? 1 : (e.key === 'ArrowUp' ? -1 : 0);
    if (!d) return;
    e.preventDefault();
    const list = Array.from(ref.current.querySelectorAll('button:not([disabled])'));
    const i = list.indexOf(document.activeElement);
    const next = list[(i + d + list.length) % list.length];
    if (next) next.focus();
  };

  return ReactDOM.createPortal(html`<div ref=${ref} className="ui-pop ui-menu" role="menu" aria-label=${label}
    style=${pos} onKeyDown=${onKeyDown} onContextMenu=${(e) => e.preventDefault()}>
    ${items.map((it, i) => (it.heading
      ? html`<div key=${i} className="ui-menu-h" role="presentation">${it.heading}</div>`
      : html`<button key=${i} type="button" role=${it.checked != null ? 'menuitemradio' : 'menuitem'}
      aria-checked=${it.checked != null ? !!it.checked : undefined}
      className=${'ui-opt' + (it.danger ? ' danger' : '') + (it.checked ? ' on' : '')} disabled=${!!it.disabled} title=${it.title}
      onClick=${() => { onClose(); it.onClick(); }}>
      ${it.checked != null ? html`<span className="ui-menu-chk">${it.checked ? html`<${Glyph} name="check" size=${13} />` : ''}</span>` : ''}
      ${it.icon ? html`<${Glyph} name=${it.icon} size=${14} />` : ''}<span>${it.label}</span>
    </button>`))}
  </div>`, document.body);
}

function MenuButton({ label, items, className }) {
  const [at, setAt] = useState(null);
  const btn = useRef(null);
  const open = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    setAt({ x: r.right, y: r.bottom + 4, alignRight: true });
  };
  return html`<span className="contents">
    <button ref=${btn} type="button" className=${'ui-menubtn' + (at ? ' open' : '') + (className ? ' ' + className : '')}
      aria-label=${label} title=${label} aria-haspopup="menu" aria-expanded=${!!at}
      onClick=${(e) => (at ? setAt(null) : open(e))}>
      <${Glyph} name="more" size=${16} />
    </button>
    ${at ? html`<${Menu} at=${at} items=${items} label=${label} anchor=${btn} onClose=${() => setAt(null)} />` : ''}
  </span>`;
}

module.exports = { Menu, MenuButton };
