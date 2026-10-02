/*
 * EditFields — "Editar campos", recolhido por padrão (modelo C2):
 * peça · set · raridade · nível base (85 ou 88) · aprimoramento · origem ·
 * otimizador (Travado, Não modificável — o cabeçalho mostra só o símbolo quando ligados).
 * Aberto, a ficha também fica editável (atributos e valores) — é o que o diálogo
 * de edição do app clássico permitia.
 *
 * Não existe peça NATIVA de nível 90: a 90 é a 85 reforjada (botão Reforjar).
 * Descer a 90 para 85/88 DESFAZ a reforja (itemEdit.unreforge: valores de antes);
 * sem isso ela ficava com os valores de 90 e a reforja seguinte somava de novo.
 */
'use strict';
const { html } = require('../../h.js');
const { Glyph, Dropdown, Segmented, Stepper, GearIcon, SetIcon, Collapse, Checkbox } = require('../../components/index.js');
const IE = require('../../../lib/itemEdit.js');
const gameData = require('../../../lib/gameData.js');
const { SLOT_PT } = require('../top/GearCard.js');

const SLOT_OPTS = IE.SLOTS.map((s) => ({ value: s, label: SLOT_PT[s], icon: html`<${GearIcon} slot=${s} size=${15} />` }));
const RANK_OPTS = IE.RANKS.map((r) => ({ value: r, label: IE.RANK_PT[r] }));
const ORIGIN_OPTS = [{ value: 'Hunt', label: 'Caça' }, { value: 'Conversion', label: 'Conversão' }, { value: 'Unknown', label: 'Desconhecida' }];

function Field({ label, children }) {
  // <div>, não <label>: clicar no rótulo acionaria o 1º botão de dentro (o "diminuir" do aprimoramento)
  return html`<div className="ip-field" role="group" aria-label=${label}><span className="ip-lbl">${label}</span>${children}</div>`;
}

function EditFields({ open, onToggle, draft, setDraft, onEnhance }) {
  const set = (patch) => setDraft((d) => {
    if (patch.level != null && Number(d.level) === 90 && patch.level !== 90) return IE.unreforge(d, patch.level);
    const n = { ...IE.clone(d), ...patch };
    // trocou a raridade: muda quantos substatus são iniciais, os rolls marcados deixam de valer (o clássico reestima)
    if (patch.rank && patch.rank !== d.rank) n.substats = n.substats.map((s) => { const c = { ...s }; delete c.rolls; return c; });
    // trocou o tipo de peça: o main precisa existir naquele tipo
    if (patch.gear && !IE.mainTypes(patch.gear).includes(n.main.type)) n.main = { type: IE.mainTypes(patch.gear)[0], value: null };
    return n;
  });
  const lv = Number(draft.level);
  // 90 só existe reforjando; nível fora do padrão (peça de evento, 71, 78…) fica como opção para não se perder
  const levelOpts = IE.BASE_LEVELS.map((l) => ({ value: l, label: String(l) }))
    .concat(lv && !IE.BASE_LEVELS.includes(lv) ? [{ value: lv, label: lv === 90 ? '90 (reforjada)' : String(lv) }] : []);
  const setOpts = IE.sets().map((s) => ({ value: s, label: gameData.shortName(s), icon: html`<${SetIcon} set=${s} size=${15} />` }));

  return html`<div className=${'ip-edit' + (open ? ' open' : '')}>
    <button type="button" className="ip-edit-h" aria-expanded=${open} onClick=${onToggle}>
      <${Glyph} name="edit" size=${13} />
      <span className="ip-edit-t">Editar campos</span>
      <span className="spacer"></span>
      <${Glyph} name=${open ? 'chevron-up' : 'chevron-down'} size=${13} />
    </button>
    <${Collapse} open=${open}><div className="ip-edit-grid">
      <${Field} label="Peça"><${Dropdown} options=${SLOT_OPTS} value=${draft.gear} onChange=${(g) => set({ gear: g })} /><//>
      <${Field} label="Set"><${Dropdown} options=${setOpts} value=${draft.set} onChange=${(s) => set({ set: s })} /><//>
      <${Field} label="Raridade"><${Dropdown} options=${RANK_OPTS} value=${draft.rank} onChange=${(r) => set({ rank: r })} /><//>
      <${Field} label="Nível base">
        <${Segmented} label="Nível base" value=${lv} onChange=${(l) => set({ level: l })} options=${levelOpts} />
      <//>
      <${Field} label="Aprimoramento">
        <${Stepper} value=${Number(draft.enhance) || 0} min=${0} max=${15} format=${(v) => '+' + v}
          onChange=${(v) => (onEnhance ? onEnhance(v) : set({ enhance: v }))}
          title="Baixar desfaz os ups dados aqui" />
      <//>
      <${Field} label="Origem">
        <${Dropdown} options=${ORIGIN_OPTS} value=${draft.material || 'Unknown'} onChange=${(m) => set({ material: m })} />
      <//>
      <${Field} label="Otimizador">
        <span className="ip-checks">
          <label className="ip-check" title="O otimizador não mexe nela">
            <${Checkbox} checked=${!!draft.locked} label="Travado" onChange=${(on) => set({ locked: on })} />Travado
          </label>
          <label className="ip-check" title="Sem pedra no otimizador e nas notas">
            <${Checkbox} checked=${!!draft.disableMods} label="Não modificável" onChange=${(on) => set({ disableMods: on })} />Não modificável
          </label>
        </span>
      <//>
    </div><//>
  </div>`;
}

module.exports = { EditFields };
