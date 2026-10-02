/*
 * ItemPopout — o popout de UMA peça (modelo C2/C3 aprovado no canvas).
 *
 *   identidade (ItemHeader) · ficha (StatSheet, com a gema por linha e o botão
 *   Reforjar no cabeçalho da coluna do meio) · Editar campos (recolhido) ·
 *   Peça: Duplicar · Remover ·
 *   rodapé: [erro] · Fechar/Descartar · Salvar
 * (Travado e Não modificável ficam em Editar campos; o cabeçalho mostra o símbolo.)
 *
 * Sem faixa de mensagem (pedido do Eduardo: escândalo demais para algo
 * reversível): gravou → o botão diz "Salvo"; fechar com alteração pendente →
 * o Salvar pisca, e um 2º Esc logo em seguida DESCARTA e fecha; duplicou → o
 * botão diz "Duplicada" (e trava: evita cópias repetidas). Só ERRO aparece, curto,
 * no rodapé. Esc em camadas: lista aberta → painel da gema → popout.
 *
 * Tudo o que é CAMPO da peça (valores, gema, reforja, dono, travado, não
 * modificável) vai para um RASCUNHO e só vale no Salvar. Duplicar e Remover
 * criam/apagam peça e valem na hora (Remover pede confirmação).
 *
 * Cobre o que o app clássico faz com item: Edit, Reforge, Add new (espaço vazio),
 * Duplicate, Remove, Unequip (dono "Ninguém"), Lock/Unlock, "Disable mods" e o
 * substatus modificado. A gravação é o código do próprio clássico (lib/itemEdit.js).
 *
 * Abre de dois jeitos: `itemId` (peça existente) ou `newSlot` + `ownerName`
 * (espaço vazio de um herói da conta → cadastrar peça).
 *
 * EMBUTIDO (`inline`, tela Equipamentos em janela larga): o mesmo editor no painel ao lado da
 * lista, sem fundo, sem X e sem prender o foco; altura FIXA (a do editor fechado) e o que abrir a
 * mais (Editar campos, gema) rola por dentro — as caixas de baixo não se mexem. Esc só fecha a gema;
 * "Descartar" volta o rascunho. `guard` (ref) expõe { dirty, nudge } para a tela segurar a troca de
 * peça com alteração pendente. As notas (cabeçalho e interessados) seguem o RASCUNHO: cada mudança
 * pede a nota ao backend (`app.rateDrafts`) e `onDraft` avisa a tela.
 */
'use strict';
const { React, html, useState, useEffect, useMemo, useRef } = require('../../h.js');
const { Button, Checkbox, Glyph, useDialogFocus } = require('../../components/index.js');
const { shown } = require('../../components/Modal.js');
const { useApp } = require('../../state/app.js');
const IE = require('../../../lib/itemEdit.js');
const { ItemHeader } = require('./ItemHeader.js');
const { StatSheet } = require('./StatSheet.js');
const interest = require('../../../lib/interest.js');
const itemRank = require('../../../lib/itemRank.js');
const { SLOT_PT } = require('../top/GearCard.js');
const gameData = require('../../../lib/gameData.js');
const { EditFields } = require('./EditFields.js');

/* `initial` ({ draft, editing, modLine, modType }) só para teste/sonda de layout — mesmo
   papel dos initial* do AppProvider. Em uso normal fica vazio. */
/* `gemMode`: modo da pedra da nota do herói ao ABRIR (tela de herói: o do herói; sem = o da tela Equipamentos).
   Escolher outro na caixinha do cabeçalho vale só neste editor (outra peça = volta ao da tela). */
function ItemPopout({ itemId, newSlot, ownerName, onClose, initial, inline, guard, onDraft, gemMode }) {
  const app = useApp();
  const isNew = !itemId;
  const stored = itemId ? app.itemById(itemId) : null;
  const storedKey = stored ? JSON.stringify(stored) : null;
  const owner = ownerName ? app.accountHero(ownerName) : null;

  // o rascunho recomeça do gravado sempre que o gravado muda (depois de Salvar)
  const base = useMemo(() => (stored ? IE.clone(stored) : IE.blank(newSlot, owner)), [storedKey, newSlot]);
  const init = initial || {};
  const [draft, setDraft] = useState(init.draft || base);
  const [modLine, setModLine] = useState(init.modLine == null ? null : init.modLine);
  const [editing, setEditing] = useState(init.editing == null ? isNew : init.editing);
  const [noteMode, setNoteMode] = useState(gemMode || app.gemMode);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [saved, setSaved] = useState(false);      // "Salvo" no botão até a próxima mudança
  const [copied, setCopied] = useState(false);
  const [nudge, setNudge] = useState(0);          // fechar com pendência: o Salvar pisca
  const [confirmRemove, setConfirmRemove] = useState(false);
  // ups dados nesta edição (rascunhos de ANTES de cada up): baixar o aprimoramento desfaz
  const [upHist, setUpHist] = useState([]);
  const ours = useRef(null);        // rascunho que NÓS geramos por up/desfazer; outra mudança zera o histórico
  const armedAt = useRef(0);        // Remover armado agora: ignora o 2º clique do duplo clique
  const lastNudge = useRef(0);      // 2º Esc em até 2 s descarta
  const noBtn = useRef(null);
  const firstBase = React.useRef(true);
  const dialog = React.useRef(null);
  const noTrap = React.useRef(null);                  // embutido: não prende o foco
  useDialogFocus(inline ? noTrap : dialog);
  useEffect(() => {
    if (firstBase.current) { firstBase.current = false; return; }   // na montagem vale o estado inicial
    setDraft(base); setModLine(null);
  }, [base]);

  // a peça sumiu da conta (removida aqui ou em outra janela) → fecha
  useEffect(() => { if (itemId && !stored && app.account.ready) onClose(); }, [itemId, stored, app.account.ready]);

  const dirty = isNew || JSON.stringify(draft) !== JSON.stringify(base);

  // fechar: com pendência o Salvar pisca; `discard` (2º Esc logo em seguida) joga fora e fecha
  function tryClose(discard) {
    if (!dirty || isNew) { onClose(); return; }
    if (discard && Date.now() - lastNudge.current < 2000) { onClose(); return; }
    lastNudge.current = Date.now();
    setNudge((n) => n + 1);
  }
  const esc = useRef(null);
  esc.current = (e) => {
    // uma lista aberta (dropdown, dono) trata o próprio Esc na captura e para o evento
    if (e.key !== 'Escape' || e.defaultPrevented || !shown(dialog.current)) return;
    if (modLine != null) { setModLine(null); return; }
    if (!inline) tryClose(true);
  };
  useEffect(() => {
    const h = (e) => esc.current(e);
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, []);
  useEffect(() => { if (confirmRemove && noBtn.current) noBtn.current.querySelector('button').focus(); }, [confirmRemove]);

  // notas ao vivo: o rascunho ganha nota do backend; a tela acompanha
  useEffect(() => {
    if (!isNew) app.rateDrafts([draft]);
    if (onDraft) onDraft(draft);
  }, [draft]);
  useEffect(() => () => { if (onDraft) onDraft(null); }, []);
  if (guard) guard.current = { dirty: dirty && !isNew, nudge: () => { lastNudge.current = Date.now(); setNudge((n) => n + 1); } };

  useEffect(() => {
    if (dirty) setSaved(false);
    setErr(null);
    if (draft !== ours.current && upHist.length) setUpHist([]);   // edição à mão: o histórico deixa de valer
  }, [draft]);

  function up(i, value, type) {
    try {
      const next = IE.applyUp(draft, i, value, type);
      ours.current = next;
      setUpHist((h) => h.concat([draft]));
      setDraft(next);
    } catch (e) { setErr(e.message); }
  }
  function enhance(v) {
    const r = IE.setEnhance(draft, v, upHist);
    ours.current = r.draft;
    setUpHist(r.history);
    setDraft(r.draft);
  }

  async function run(job, after) {
    setBusy(true); setErr(null);
    try {
      await app.runItemJob(job);
      after();
    } catch (e) {
      setErr(e.message);
    } finally { setBusy(false); }
  }

  const save = () => run((api) => (isNew
    ? IE.saveNew(api, draft, app.heroesById)
    : IE.saveEdit(api, draft, stored, app.heroesById)), () => (isNew ? onClose() : setSaved(true)));
  const duplicate = () => run((api) => IE.duplicate(api, stored), () => setCopied(true));
  const remove = () => { if (Date.now() - armedAt.current > 400) run((api) => IE.remove(api, stored), onClose); };

  function reforge() {
    try { setDraft(IE.reforge(draft)); } catch (e) { setErr(e.message); }
  }

  if (!isNew && !stored) return null;

  // pedra SIMULADA que dá a nota do herói dono (mesmo perfil do cabeçalho) — só com o botão Pedra ligado
  // pedra SIMULADA que dá a nota do herói dono no modo escolhido no cabeçalho (mesmo perfil da nota)
  const gemHero = noteMode !== 'none' && draft.equippedByName ? interest.profileFor(app.ratingProfiles, 'h:' + draft.equippedByName) : null;
  const gemSrc = itemRank.potentialOf(draft) != null ? draft : stored;
  const gem = gemHero && gemSrc && interest.fits(gemSrc, gemHero) ? itemRank.gemOf(gemSrc, gemHero.id, noteMode) : null;
  const label = `${isNew ? 'Cadastrar peça' : 'Peça'}: ${SLOT_PT[draft.gear] || draft.gear || ''} ${draft.set ? gameData.shortName(draft.set) : ''}`.trim();
  const discard = () => { setDraft(base); setModLine(null); setUpHist([]); };
  const body = html`<span className="contents">
      <${ItemHeader} draft=${draft} stored=${stored} dirty=${dirty && !isNew} noteMode=${noteMode} onNoteMode=${setNoteMode}
        onOwner=${(id) => setDraft((d) => ({ ...d, equippedById: id, equippedByName: id && app.heroesById[id] ? app.heroesById[id].name : null }))}
        onClose=${inline ? null : () => tryClose(false)} />
      <div className="ip-body">

      <${StatSheet} draft=${draft} setDraft=${setDraft} editing=${editing} modLine=${modLine} setModLine=${setModLine} modType=${init.modType}
        onReforge=${reforge} onUp=${up} gem=${gem} />

      <${EditFields} open=${editing} onToggle=${() => { setEditing((o) => !o); setModLine(null); }} draft=${draft} setDraft=${setDraft} onEnhance=${enhance} />

      ${isNew ? '' : html`<div className="ip-actions">
        <${Button} disabled=${busy || copied} title=${copied ? 'Cópia criada, solta e destravada'
          : 'Cria uma cópia desta peça (como está gravada), fora de herói'}
          onClick=${duplicate}><${Glyph} name=${copied ? 'check' : 'copy'} size=${12} /> ${copied ? 'Duplicada' : 'Duplicar'}<//>
        <span className="spacer"></span>
        ${confirmRemove
          /* o "Não" nasce onde estava o Remover e recebe o foco: duplo clique não apaga a peça */
          ? html`<span className="ip-confirm">
              <span className="sub">Remover a peça da conta?</span>
              <${Button} className="danger solid" disabled=${busy} onClick=${remove}>Remover<//>
              <span ref=${noBtn} className="contents">
                <${Button} onClick=${() => setConfirmRemove(false)}>Não<//>
              </span>
            </span>`
          : html`<${Button} className="danger" disabled=${busy} onClick=${() => { armedAt.current = Date.now(); setConfirmRemove(true); }}>
              <${Glyph} name="trash" size=${12} /> Remover
            <//>`}
      </div>`}
      </div>

      <div className="ip-foot">
        <span className="ip-err" role="alert" title=${err || undefined}>${err || ''}</span>
        <span className="ip-sr" aria-live="polite">${nudge ? (inline ? 'Alterações não salvas: Salvar, ou clique de novo na outra peça para descartar.' : 'Alterações não salvas: Salvar, ou Esc de novo para descartar.') : ''}</span>
        ${inline
          ? html`<${Button} disabled=${busy || !dirty} onClick=${discard} title="Volta ao gravado">Descartar<//>`
          : html`<${Button} disabled=${busy} onClick=${onClose} title=${dirty && !isNew ? 'Joga fora as alterações' : 'Esc'}>
          ${dirty && !isNew ? 'Descartar' : isNew ? 'Cancelar' : 'Fechar'}
        <//>`}
        <span className=${nudge ? 'ip-nudge n' + (nudge % 2) : ''} title=${nudge ? (inline ? 'Não salvo · clique de novo para descartar' : 'Não salvo · Esc de novo descarta') : undefined}>
          <${Button} variant=${modLine == null ? 'accent' : undefined} disabled=${busy || !dirty} onClick=${save}>
            ${busy ? 'Gravando…' : isNew ? 'Cadastrar' : saved && !dirty ? 'Salvo' : 'Salvar'}
          <//>
        </span>
      </div>
    </span>`;

  if (inline) return html`<section ref=${dialog} className="ip inline" aria-label=${label}>${body}</section>`;
  return html`<div className="ui-modal-back ip-back" onMouseDown=${(e) => { if (e.target === e.currentTarget) tryClose(false); }}>
    <div ref=${dialog} className="ip" tabIndex=${-1} role="dialog" aria-modal="true" aria-label=${label}>${body}</div>
  </div>`;
}

module.exports = { ItemPopout };
