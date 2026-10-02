/*
 * HeroTop — o topo do herói, COMUM às três abas (fica acima delas):
 *   barra do herói
 *   [1 Bônus] [2 Status no jogo] [3 Calculado] [4 Equipamentos]
 *
 * Os cabeçalhos das 4 colunas têm ALTURA FIXA (inclusive o do bloco 4, que tem
 * o menu ⋯) para as caixas começarem todas na mesma linha. O rodapé de cada card
 * mostra score · rank da peça · rank para o dono (o seletor Rank/Score saiu).
 *
 * Build escolhida na lista:
 *   pública/marcada → TargetTop (comparativo)
 *   SALVA           → este mesmo layout, com os stats e as peças DELA (o retrato de
 *                     cada card diz com quem a peça está agora); equipar é pelo menu
 *                     de clique direito da lista. "Minha build" volta.
 * "⋯" em Equipamentos: modo da pedra na NOTA PARA O HERÓI (Sem troca · Sem perda · Com perda · Perda permanente;
 * padrão Sem troca = peça como está; por herói, só até fechar o app — independente da tela Equipamentos) e,
 * na build equipada, desequipar/travar/destravar as 6.
 */
'use strict';
const { html, useState } = require('../../h.js');
const { MenuButton } = require('../../components/index.js');
const { useApp } = require('../../state/app.js');
const itemRatings = require('../../../lib/itemRatings.js');
const { savedBuildView } = require('../builds/buildRows.js');
const { HeroBar } = require('./HeroBar.js');
const { BonusColumn } = require('./BonusColumn.js');
const { GameStats, DerivedStats } = require('./StatColumns.js');
const { GearGrid } = require('./GearGrid.js');
const { TargetTop } = require('../target/TargetTop.js');
const { ItemPopout } = require('../item/ItemPopout.js');
const { SlotDialog } = require('../gear/SlotDialog.js');

function ColHead({ children, right }) {
  return html`<div className="colh"><span className="label">${children}</span>${right ? html`<span className="spacer"></span>` : ''}${right || ''}</div>`;
}

function HeroTop({ hero }) {
  const app = useApp();
  // popout de item: { itemId } (peça existente) ou { newSlot } (cadastro). Espaço VAZIO
  // abre antes o SlotDialog: equipar peça existente ou cadastrar (Eduardo, 2026-09-29).
  const [popout, setPopout] = useState(null);
  const [emptySlot, setEmptySlot] = useState(null);
  const acc = app.accountHero(hero.name);
  // trocar de herói/build MONTA de novo as colunas: o destaque subiu/desceu (Delta) é só para recálculo
  const view = hero.name + '|' + (app.target && app.target.row ? app.target.row.key : '');

  // build-alvo pública escolhida na lista: o topo passa a mostrar ELA (ver target/TargetTop.js)
  const t = app.target;
  if (t && t.row.origin !== 'saved') return html`<${TargetTop} key=${t.row.key} hero=${hero} row=${t.row} initialGear=${t.gear} />`;
  const saved = t ? t.row : null;
  const shown = saved ? savedBuildView(saved, app.account.itemsById) : acc;
  const hasGear = !!(acc && Object.keys(acc.equipment || {}).some((s) => acc.equipment[s]));
  const heroMode = app.heroGemMode(hero.name);
  const gearMenu = [{ heading: 'Nota para o herói' }].concat(itemRatings.GEM_MODES.map((m) => ({
    label: itemRatings.GEM_MODE_LABEL[m], title: itemRatings.GEM_MODE_TIP[m], checked: m === heroMode,
    onClick: () => app.setHeroGemMode(hero.name, m),
  }))).concat(!saved && hasGear ? [
    { heading: 'Peças equipadas' },
    { label: 'Desequipar tudo', icon: 'unequip', onClick: () => app.gearAll(hero.name, 'unequip') },
    { label: 'Travar tudo', icon: 'lock', onClick: () => app.gearAll(hero.name, 'lock') },
    { label: 'Destravar tudo', icon: 'unlock', onClick: () => app.gearAll(hero.name, 'unlock') },
  ] : []);

  return html`<div className="ht">
    <${HeroBar} hero=${hero} badge=${saved ? `Salva · ${saved.name}` : null} onExit=${saved ? app.clearTarget : null} />
    ${app.saveError ? html`<div className="pt-err">Não foi possível gravar: ${app.saveError}</div>` : ''}

    <div className="pt-grid">
      <section className="pt-col c1">
        <${ColHead}>Bônus<//>
        <${BonusColumn} hero=${hero} />
      </section>
      <section className="pt-col c2">
        <${ColHead}>Status no jogo<//>
        <${GameStats} key=${view} hero=${hero} acc=${shown} />
      </section>
      <section className="pt-col c3">
        <${ColHead}>Calculado<//>
        <${DerivedStats} key=${view} acc=${shown} />
      </section>
      <section className="pt-col c4">
        <${ColHead} right=${html`<span className="colh-tools">
          ${acc ? html`<${MenuButton} label="Nota para o herói e ações nas peças" items=${gearMenu} />` : ''}
        </span>`}>Equipamentos<//>
        ${acc
          ? html`<${GearGrid} key=${view} equipment=${shown.equipment} gemMode=${heroMode}
              onOpenItem=${(it) => setPopout({ itemId: it.id })}
              onNewItem=${saved ? undefined : setEmptySlot} />`
          : html`<div className="pt-noacc" title="Herói fora da conta importada"></div>`}
      </section>
    </div>
    ${popout ? html`<${ItemPopout} key=${popout.itemId || popout.newSlot} itemId=${popout.itemId} newSlot=${popout.newSlot} gemMode=${heroMode}
      ownerName=${hero.name} onClose=${() => setPopout(null)} />` : ''}
    ${emptySlot ? html`<${SlotDialog} hero=${hero} slot=${emptySlot} onClose=${() => setEmptySlot(null)}
      onCreate=${(slot) => { setEmptySlot(null); setPopout({ newSlot: slot }); }} />` : ''}
  </div>`;
}

module.exports = { HeroTop };
