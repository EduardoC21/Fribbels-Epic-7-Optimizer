/*
 * SlotDialog — clique num espaço VAZIO do herói: equipar uma peça que já existe
 * ou cadastrar uma nova.
 *
 *   filtros (o tipo de peça é fixo = o do espaço)
 *   tabela das peças desse tipo — clique escolhe, Enter também
 *   rodapé: [Cadastrar peça nova] ········ [aviso: sai de <herói>] Cancelar · Equipar
 *
 * Equipar peça de outro herói tira dela de lá (o backend faz isso sozinho); o
 * rodapé avisa antes. Cadastrar fecha este diálogo e abre o popout em modo cadastro.
 */
'use strict';
const { html, useState, useMemo, useCallback } = require('../../h.js');
const { Modal, Button, Glyph } = require('../../components/index.js');
const { useApp } = require('../../state/app.js');
const { SLOT_PT } = require('../top/GearCard.js');
const { ItemTable } = require('./ItemTable.js');
const { GearFilters } = require('./GearFilters.js');
const G = require('./gearList.js');

function SlotDialog({ hero, slot, onClose, onCreate }) {
  const app = useApp();
  const acc = app.accountHero(hero.name);
  const [filters, setFilters] = useState(G.EMPTY_FILTERS);
  const [picked, setPicked] = useState(null);
  const [busy, setBusy] = useState(false);
  const ofSlot = useMemo(() => Object.values(app.account.itemsById || {}).filter((it) => it.gear === slot), [app.account.itemsById, slot]);
  const opts = useMemo(() => G.options(ofSlot, app.heroesById), [ofSlot, app.heroesById]);
  const items = useMemo(() => G.applyFilters(ofSlot, filters), [ofSlot, filters]);
  const codeOf = useCallback((name) => (name && app.byName[name] ? app.byName[name].code : null), [app.byName]);
  const pick = useCallback((it) => setPicked(it.id), []);
  const chosen = picked ? app.itemById(picked) : null;

  async function equip() {
    if (!chosen || !acc) return;
    setBusy(true);
    const ok = await app.heroJob((b) => b.equipItemsOnHero(acc.id, [chosen.id]));
    setBusy(false);
    if (ok) onClose();
  }

  return html`<${Modal} title=${`${SLOT_PT[slot]} vazio · ${hero.name}`} onClose=${onClose} width="min(1180px, 94vw)">
    <div className="sd">
      <${GearFilters} filters=${filters} onChange=${setFilters} opts=${opts} slotLocked=${true}
        total=${ofSlot.length} shown=${items.length} />
      <${ItemTable} items=${items} onPick=${pick} pickedId=${picked} codeOf=${codeOf} className="sd-table"
        profiles=${app.ratingProfiles} ver=${app.ratingsVer}
        empty=${ofSlot.length ? 'Nenhuma peça com esses filtros.' : `Nenhum(a) ${SLOT_PT[slot].toLowerCase()} no inventário.`} />
      <div className="sd-foot">
        <${Button} onClick=${() => onCreate(slot)}>
          <${Glyph} name="plus" size=${12} /> Cadastrar peça nova
        <//>
        <span className="spacer"></span>
        ${chosen && chosen.equippedById && chosen.equippedById !== (acc && acc.id)
          ? html`<span className="sd-warn">Sai de <b>${chosen.equippedByName || 'outro herói'}</b></span>` : ''}
        <${Button} onClick=${onClose}>Cancelar<//>
        <${Button} variant="accent" disabled=${!chosen || busy} onClick=${equip}>
          ${busy ? 'Equipando…' : 'Equipar'}
        <//>
      </div>
    </div>
  <//>`;
}

module.exports = { SlotDialog };
