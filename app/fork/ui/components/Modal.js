/* Modal — popout central (usado pelo seletor de artefato). Fecha no fundo e no Esc. */
'use strict';
const { html, useEffect, useRef } = require('../h.js');
const { Glyph } = require('./glyphs.js');

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
// a tela do diálogo está à vista? (AppShell mantém as telas montadas e esconde as outras)
const shown = (el) => !!(el && el.getClientRects().length);

/*
 * Foco de diálogo: ao abrir, o foco entra (se nenhum filho já pegou com autoFocus);
 * Tab/Shift+Tab giram só dentro; ao fechar, volta para quem abriu.
 * `ref` aponta para o elemento role="dialog" (que precisa de tabIndex=-1).
 */
function useDialogFocus(ref) {
  useEffect(() => {
    const prev = document.activeElement;
    const el = ref.current;
    if (el && !el.contains(document.activeElement)) el.focus();
    const trap = (e) => {
      if (e.key !== 'Tab' || !shown(el)) return;
      const f = Array.from(el.querySelectorAll(FOCUSABLE)).filter((x) => x.offsetParent !== null);
      if (!f.length) { e.preventDefault(); el.focus(); return; }
      const first = f[0];
      const last = f[f.length - 1];
      const at = document.activeElement;
      if (e.shiftKey && (at === first || at === el)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && at === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', trap);
    return () => {
      document.removeEventListener('keydown', trap);
      if (prev && prev.focus && document.contains(prev)) prev.focus();
    };
  }, []);
}

let seq = 0;

function Modal({ title, onClose, width, children }) {
  const ref = useRef(null);
  const titleId = useRef(`ui-modal-${++seq}`).current;
  useDialogFocus(ref);
  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape' && shown(ref.current)) onClose && onClose(); };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [onClose]);

  return html`<div className="ui-modal-back" onClick=${onClose}>
    <div ref=${ref} className="ui-modal" style=${width ? { width } : undefined} tabIndex=${-1}
      role="dialog" aria-modal="true" aria-labelledby=${titleId} onClick=${(e) => e.stopPropagation()}>
      <div className="ui-modal-hdr">
        <h2 id=${titleId}>${title}</h2>
        <button type="button" className="ui-modal-x" aria-label="Fechar" onClick=${onClose}>
          <${Glyph} name="close" size=${15} />
        </button>
      </div>
      <div className="ui-modal-body">${children}</div>
    </div>
  </div>`;
}

module.exports = { Modal, useDialogFocus, shown };
