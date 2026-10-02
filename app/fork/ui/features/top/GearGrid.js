/*
 * GearGrid — as 6 peças em grade 2×3: em cima Arma, Capacete e Armadura;
 * embaixo Colar, Anel e Bota (a mesma disposição do mockup aprovado).
 */
'use strict';
const { html } = require('../../h.js');
const { useApp } = require('../../state/app.js');
const { GearCard } = require('./GearCard.js');

const SLOTS = ['Weapon', 'Helmet', 'Armor', 'Necklace', 'Ring', 'Boots'];

function GearGrid({ equipment, onOpenItem, onNewItem, gemMode }) {
  const app = useApp();
  const eq = equipment || {};
  return html`<div className="gg">
    ${SLOTS.map((slot) => {
      const item = eq[slot] || null;
      const owner = item && item.equippedByName ? app.byName[item.equippedByName] : null;
      return html`<${GearCard} key=${slot} slot=${slot} item=${item} gemMode=${gemMode}
        ownerCode=${owner ? owner.code : null}
        onOpen=${item ? (onOpenItem ? () => onOpenItem(item) : undefined) : (onNewItem ? () => onNewItem(slot) : undefined)} />`;
    })}
  </div>`;
}

module.exports = { GearGrid, SLOTS };
