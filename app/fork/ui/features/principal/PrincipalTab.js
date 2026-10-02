/*
 * PrincipalTab — a aba Principal: a lista com a build EQUIPADA e as SALVAS do
 * herói, com heatmap por coluna. (O topo do herói — bônus, stats, equipamentos
 * — fica acima das abas, em features/top/HeroTop.js.)
 *
 * As builds públicas MARCADAS na aba Construções entram aqui também
 * (e dá para desmarcar por aqui mesmo).
 *
 * Builds salvas (Eduardo, 2026-09-28):
 *   "Salvar build atual" (em cima da lista) → pede o nome → as 6 peças equipadas
 *   clique na linha salva → o topo mostra a build (peças e com quem estão)
 *   clique DIREITO na linha salva → Equipar · Renomear · Apagar (pede confirmação)
 */
'use strict';
const { html, useMemo, useState } = require('../../h.js');
const { SectionLabel, Button, Glyph, Menu } = require('../../components/index.js');
const { useApp } = require('../../state/app.js');
const { BuildTable } = require('../builds/BuildTable.js');
const buildRows = require('../builds/buildRows.js');
const { pickHandler } = require('../builds/pick.js');
const { NameDialog, ConfirmDialog } = require('./BuildDialogs.js');

const MENU_HINT = 'Clique direito: equipar, renomear ou apagar.';

function PrincipalTab({ hero }) {
  const app = useApp();
  const acc = app.accountHero(hero.name);
  const itemsById = app.account.itemsById;
  const marked = app.markedOf(hero.name);
  const rows = useMemo(() => buildRows.rowsFor(acc, hero.name, itemsById, marked)
    .map((r) => (r.origin === 'saved' ? Object.assign({}, r, { note: `${r.note} ${MENU_HINT}` }) : r)),
  [acc, hero.name, itemsById, app.marks]);
  // estáveis para o BuildTable (memo) não redesenhar à toa
  const mark = useMemo(() => (marked.length ? {
    isMarked: (r) => app.isMarked(hero.name, r.markKey),
    onToggle: (r) => app.toggleMark(hero.name, r),
  } : null), [hero.name, app.marks]);
  const onPick = useMemo(() => pickHandler(app, hero), [hero.name]);

  const [menu, setMenu] = useState(null);       // { at, row }
  const [dialog, setDialog] = useState(null);   // { kind: 'save'|'rename'|'remove', row }
  const onRowMenu = useMemo(() => (r, e) => {
    if (r.origin !== 'saved') return;
    e.preventDefault();
    // tecla de menu / Shift+F10: sem posição do mouse, abre embaixo da linha
    let at = { x: e.clientX, y: e.clientY };
    if (!e.clientX && !e.clientY && e.currentTarget) { const b = e.currentTarget.getBoundingClientRect(); at = { x: b.left + 40, y: b.bottom }; }
    setMenu({ at, row: r });
  }, []);

  const saved = rows.filter((r) => r.origin === 'saved');
  const inUse = rows.some((r) => r.inUse);
  const canSave = !!acc && buildRows.isComplete(acc) && !inUse;
  const saveTip = !acc ? 'Fora da conta'
    : (!buildRows.isComplete(acc) ? 'Precisa das 6 peças' : (inUse ? 'Já está salva' : undefined));

  const menuItems = menu ? [
    { label: 'Equipar', icon: 'equip', disabled: menu.row.inUse, title: menu.row.inUse ? 'Já equipada' : 'Tira as peças de quem estiver usando',
      onClick: () => app.equipBuild(hero.name, menu.row) },
    { label: 'Renomear', icon: 'edit', onClick: () => setDialog({ kind: 'rename', row: menu.row }) },
    { label: 'Apagar', icon: 'trash', danger: true, onClick: () => setDialog({ kind: 'remove', row: menu.row }) },
  ] : [];

  return html`<section className="pl">
    <div className="pl-head">
      <${SectionLabel}>${marked.length ? 'Build atual, salvas e marcadas' : 'Build atual e salvas'}<//>
      <span className="spacer"></span>
      ${acc ? html`<${Button} disabled=${!canSave} title=${saveTip} onClick=${() => setDialog({ kind: 'save' })}>
        <${Glyph} name="save" size=${13} /> Salvar build atual<//>` : ''}
    </div>
    <${BuildTable} rows=${rows} mark=${mark}
      onPick=${onPick} pickedKey=${app.target && app.target.row.key} onRowMenu=${onRowMenu}
      empty=${acc ? 'Sem builds.' : 'Herói fora da conta importada — sem build equipada nem salva. Marque builds na aba Construções para compará-las aqui.'} />
    ${menu ? html`<${Menu} at=${menu.at} items=${menuItems} label=${`Build ${menu.row.name}`} onClose=${() => setMenu(null)} />` : ''}
    ${dialog && dialog.kind === 'save' ? html`<${NameDialog} title="Salvar build atual" initial=${`Build ${saved.length + 1}`}
      confirmLabel="Salvar" onConfirm=${(n) => app.saveBuild(hero.name, n)} onClose=${() => setDialog(null)} />` : ''}
    ${dialog && dialog.kind === 'rename' ? html`<${NameDialog} title="Renomear build" initial=${dialog.row.name}
      confirmLabel="Renomear" onConfirm=${(n) => app.renameBuild(hero.name, dialog.row, n)} onClose=${() => setDialog(null)} />` : ''}
    ${dialog && dialog.kind === 'remove' ? html`<${ConfirmDialog} title="Apagar build"
      text=${`Apagar a build "${dialog.row.name}"? As peças não são afetadas, só o registro da build.`}
      confirmLabel="Apagar" onConfirm=${() => app.removeBuild(hero.name, dialog.row)} onClose=${() => setDialog(null)} />` : ''}
  </section>`;
}

module.exports = { PrincipalTab };
