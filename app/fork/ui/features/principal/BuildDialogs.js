/*
 * BuildDialogs — as janelinhas das builds salvas (aba Principal):
 *   NameDialog     nome ao salvar a build atual ou ao renomear (vem sugerido)
 *   ConfirmDialog  "Apagar a build X?" — só o registro da build some; as peças ficam
 * Enter confirma, Esc/fundo cancela (Modal). Enquanto grava, os botões travam.
 */
'use strict';
const { html, useState } = require('../../h.js');
const { Modal, Button } = require('../../components/index.js');

function NameDialog({ title, initial, confirmLabel, onConfirm, onClose }) {
  const [name, setName] = useState(initial || '');
  const [busy, setBusy] = useState(false);
  const ok = name.trim().length > 0 && !busy;
  const go = async () => {
    if (!ok) return;
    setBusy(true);
    const done = await onConfirm(name.trim());
    if (done !== false) onClose(); else setBusy(false);
  };
  return html`<${Modal} title=${title} onClose=${onClose} width="380px">
    <div className="bd">
      <input className="bd-input" autoFocus=${true} aria-label="Nome da build" maxLength=${60}
        value=${name} onChange=${(e) => setName(e.target.value)}
        onFocus=${(e) => e.target.select()}
        onKeyDown=${(e) => { if (e.key === 'Enter') go(); }} />
      <div className="bd-foot">
        <${Button} onClick=${onClose}>Cancelar<//>
        <${Button} variant="accent" disabled=${!ok} onClick=${go}>${busy ? 'Gravando…' : confirmLabel}<//>
      </div>
    </div>
  <//>`;
}

function ConfirmDialog({ title, text, confirmLabel, onConfirm, onClose }) {
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true);
    const done = await onConfirm();
    if (done !== false) onClose(); else setBusy(false);
  };
  return html`<${Modal} title=${title} onClose=${onClose} width="380px">
    <div className="bd">
      <p className="bd-text">${text}</p>
      <div className="bd-foot">
        <${Button} onClick=${onClose}>Cancelar<//>
        <${Button} className="bd-danger" disabled=${busy} onClick=${go}>${busy ? 'Apagando…' : confirmLabel}<//>
      </div>
    </div>
  <//>`;
}

module.exports = { NameDialog, ConfirmDialog };
