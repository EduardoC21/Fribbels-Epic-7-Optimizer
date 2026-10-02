/*
 * ItemHeader — faixa de identidade do popout de item (modelo C2 aprovado):
 *
 *   [ícone da peça, borda da raridade]  Capacete [set] Destruction    PEÇA   HERÓI  | [retrato] equipado por ▾ | ✕
 *                                       Épico · nível 85 · +15 · Caça     A 62   —      |
 *
 * Duas notas, do que está GRAVADO (backend /fork/itemRatings via lib/itemRank.js):
 * PEÇA = rank D→SSS+ + potencial % (score do jogo no hover) e HERÓI = o mesmo para o
 * herói que usa a peça (pelas barras do Otimizador dele; sem barras = "—").
 * Com alteração pendente as notas ficam apagadas (valem ao Salvar).
 * "equipado por" é um botão: troca o herói (entra no rascunho; vale ao Salvar).
 */
'use strict';
const { html, useState, useRef, useEffect, useMemo } = require('../../h.js');
const { GearIcon, SetIcon, Portrait, RankBadge, Glyph, GameGlyph, Delta, useListKeys, keepFocus } = require('../../components/index.js');
const { useApp } = require('../../state/app.js');
const itemRank = require('../../../lib/itemRank.js');
const interest = require('../../../lib/interest.js');
const itemRatings = require('../../../lib/itemRatings.js');
const IE = require('../../../lib/itemEdit.js');
const gameData = require('../../../lib/gameData.js');
const { SLOT_PT, RARITY } = require('../top/GearCard.js');

const MATERIAL_PT = { Hunt: 'Caça', Conversion: 'Conversão', Unknown: 'origem desconhecida' };

/* quem usa a peça: botão + lista com busca (a conta pode ter centenas de heróis).
   Teclado: o foco fica na busca; ↑↓ Home End andam, Enter escolhe, Esc fecha só a lista. */
function OwnerPicker({ ownerId, onChange }) {
  const app = useApp();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const wrap = useRef(null);
  const list = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const h = (e) => { if (wrap.current && !wrap.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);

  const heroes = useMemo(() => Object.values(app.heroesById)
    .sort((a, b) => String(a.name).localeCompare(String(b.name))), [app.heroesById]);
  const owner = ownerId ? app.heroesById[ownerId] : null;
  const code = (n) => (app.byName[n] ? app.byName[n].code : null);
  const qq = q.trim().toLowerCase();
  // 1ª opção = Ninguém (fora de herói)
  const shown = [null].concat((qq ? heroes.filter((h) => String(h.name).toLowerCase().includes(qq)) : heroes).slice(0, 200));
  const cur = shown.findIndex((h) => (h ? h.id : null) === (ownerId || null));

  function pick(id) { onChange(id); setOpen(false); setQ(''); }
  const keys = useListKeys({ open, setOpen, count: shown.length, popRef: list, start: cur,
    onPick: (i) => pick(shown[i] ? shown[i].id : null) });
  useEffect(() => { if (open) keys.setAct(qq ? 1 : Math.max(0, cur)); }, [qq]);   // buscou: o 1º herói achado fica ativo

  return html`<span className="ip-owner-wrap" ref=${wrap} onBlur=${keys.onBlur}>
    <button type="button" className="ip-owner" title="Trocar o dono" aria-haspopup="listbox" aria-expanded=${open}
      onClick=${() => setOpen((o) => !o)} onKeyDown=${keys.onKeyDown}>
      ${owner ? html`<${Portrait} code=${code(owner.name)} size=${32} />` : html`<span className="ip-owner-none"></span>`}
      <span className="ip-owner-txt">
        <span className="ip-cap">equipado por</span>
        <span className="ip-owner-name">${owner ? owner.name : 'ninguém'}</span>
      </span>
      <${Glyph} name="chevron-down" size=${11} className="caret" />
    </button>
    ${open ? html`<div className="ui-pop ip-owner-pop">
      <input className="ui-num ip-owner-q" autoFocus aria-label="Buscar herói dono da peça" placeholder="buscar herói" value=${q}
        role="combobox" aria-expanded="true" aria-controls=${keys.optId('lista')} aria-activedescendant=${keys.activeId}
        onChange=${(e) => setQ(e.target.value)} onKeyDown=${keys.onKeyDown} />
      <div className="ip-owner-list" role="listbox" id=${keys.optId('lista')} ref=${list} onMouseDown=${keepFocus}>
        ${shown.map((h, i) => html`<button type="button" key=${h ? h.id : '-'} id=${keys.optId(i)} data-i=${i} tabIndex=${-1}
          className=${'ui-opt' + (i === keys.act ? ' act' : '')} role="option" aria-selected=${i === cur}
          onMouseEnter=${() => keys.setAct(i)} onClick=${() => pick(h ? h.id : null)}>
          ${h ? html`<${Portrait} code=${code(h.name)} size=${20} /><span className="ellipsis">${h.name}</span>`
            : html`<span className="ip-owner-none sm"></span><span className="ellipsis">Ninguém (fora de herói)</span>`}
        </button>`)}
      </div>
    </div>` : ''}
  </span>`;
}

/* Travado / Não modificável: editados em "Editar campos"; aqui só o SÍMBOLO, quando ligado */
function Flags({ locked, noMods }) {
  if (!locked && !noMods) return null;
  return html`<span className="ip-flags">
    ${locked ? html`<span className="ip-flag" role="img" aria-label="Travada" title="Travada">
      <${Glyph} name="lock" size=${13} /></span>` : ''}
    ${noMods ? html`<span className="ip-flag nomod" role="img" aria-label="Não modificável"
      title="Não modificável"><${GameGlyph} name="modify" size=${14} /></span>` : ''}
  </span>`;
}

/*
 * Nota do HERÓI com escolha do modo da pedra: a caixinha abre as 4 notas (Sem troca · Sem perda · Com perda ·
 * Perda permanente, na ordem de permissão de troca); escolher uma mostra ela aqui e a troca na ficha (StatSheet).
 * Teclado igual às outras listas (↑↓ Home End Enter, Esc fecha só a lista).
 */
function HeroNote({ heroName, src, hp, mode, onMode }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef(null);
  const list = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const h = (e) => { if (wrap.current && !wrap.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);
  const ok = hp && src && interest.fits(src, hp);   // set/main que ele não aceita = sem nota
  const potIn = (m) => (ok ? itemRank.potentialOf(src, hp.id, m) : null);
  const modes = itemRatings.GEM_MODES;
  const cur = modes.indexOf(mode);
  const pick = (m) => { onMode(m); setOpen(false); };
  const keys = useListKeys({ open, setOpen, count: modes.length, popRef: list, start: cur, onPick: (i) => pick(modes[i]) });
  const hpot = potIn(mode);
  const pct = (v) => (v == null ? '' : itemRank.pctInt(v) + '%');
  const tip = hpot == null ? `Sem nota para ${heroName} (sem barras ou set/main fora)`
    : `Para ${heroName} · ${itemRatings.GEM_MODE_LABEL[mode]}`;
  return html`<span className="ip-hnote-wrap" ref=${wrap} onBlur=${keys.onBlur}>
    <button type="button" className=${'ip-score ip-hnote' + (open ? ' open' : '')} title=${tip} disabled=${!ok}
      aria-haspopup="listbox" aria-expanded=${open} aria-label=${`Nota para ${heroName}: ${itemRatings.GEM_MODE_LABEL[mode]}`}
      onClick=${() => setOpen((o) => !o)} onKeyDown=${keys.onKeyDown}>
      <span className="ip-cap">herói${mode !== 'none' ? html` <${GameGlyph} name="modify" size=${10} />` : ''}<${Glyph} name="chevron-down" size=${9} /></span>
      <span className="ip-score-v">${hpot != null ? html`<${Delta} v=${hpot}><${RankBadge} rank=${itemRank.rankFor(hpot)} className="lg" /><span className="tnum sub">${pct(hpot)}</span><//>` : html`<span className="muted">—</span>`}</span>
    </button>
    ${open ? html`<div className="ui-pop ip-hnote-pop" role="listbox" id=${keys.optId('lista')} ref=${list} onMouseDown=${keepFocus}
      aria-label=${`Nota para ${heroName} por modo da pedra`}>
      ${modes.map((m, i) => {
        const v = potIn(m);
        return html`<button type="button" key=${m} id=${keys.optId(i)} data-i=${i} tabIndex=${-1} role="option" aria-selected=${m === mode}
          className=${'ui-opt ip-hnote-opt' + (i === keys.act ? ' act' : '') + (m === mode ? ' on' : '')} title=${itemRatings.GEM_MODE_TIP[m]}
          onMouseEnter=${() => keys.setAct(i)} onClick=${() => pick(m)}>
          <span className="ui-menu-chk">${m === mode ? html`<${Glyph} name="check" size=${13} />` : ''}</span>
          <span className="ellipsis">${itemRatings.GEM_MODE_LABEL[m]}</span>
          ${v != null ? html`<${RankBadge} rank=${itemRank.rankFor(v)} /><span className="tnum sub">${pct(v)}</span>` : html`<span className="muted">—</span><span></span>`}
        </button>`;
      })}
    </div>` : ''}
  </span>`;
}

/* notas: do RASCUNHO assim que o backend responder (a edição reflete na hora); até lá, as do
   gravado, apagadas. "Herói" = o dono no rascunho; peça sem dono mostra só a nota da peça.
   `onClose` ausente (editor embutido na tela Equipamentos) = sem o X. */
function ItemHeader({ draft, stored, dirty, onOwner, onClose, noteMode, onNoteMode }) {
  const rar = RARITY[draft.rank] || 'normal';
  const live = itemRank.potentialOf(draft) != null;
  const src = live ? draft : stored;
  const score = src ? itemRank.scoreOf(src) : null;
  const pot = src ? itemRank.potentialOf(src) : null;
  const proj = src ? itemRank.scoreReforgedOf(src) : null;
  const heroName = draft.equippedByName || null;
  const app = useApp();
  const hp = heroName ? interest.profileFor(app.ratingProfiles, 'h:' + heroName) : null;   // herói gêmeo = perfil do arquétipo
  const stale = dirty && !live;
  const pct = (v) => (v == null ? '' : itemRank.pctInt(v) + '%');
  const lv = Number(draft.level);

  return html`<div className="ip-head">
    <span className="ip-gear" style=${{ borderColor: `var(--${rar})` }} title=${draft.name || ''}>
      <${GearIcon} slot=${draft.gear} size=${30} />
    </span>
    <span className="ip-id">
      <span className="ip-title">
        <b>${SLOT_PT[draft.gear] || draft.gear}</b>
        <${SetIcon} set=${draft.set} size=${16} />
        <span className="sub">${draft.set ? gameData.shortName(draft.set) : ''}</span>
        <${Flags} locked=${!!draft.locked} noMods=${!!draft.disableMods} />
      </span>
      <span className="ip-meta">
        <span style=${{ color: `var(--${rar})`, fontWeight: 700 }}>${IE.RANK_PT[draft.rank] || draft.rank}</span>${` · nível ${lv || '—'} · `}<b className="acc">+${draft.enhance}</b>${draft.material ? ` · ${MATERIAL_PT[draft.material] || draft.material}` : ''}
      </span>
    </span>
    <span className="spacer"></span>
    <span className=${'ip-scores' + (stale ? ' stale' : '')}>
      <span className="ip-score" title=${`Pontos de Equipamento${proj != null ? ` · reforjada ${proj}` : ''}`}>
        <span className="ip-cap">score</span>
        <span className="ip-score-v">${score != null ? html`<${Delta} v=${score}><b className="ip-score-n tnum">${score}</b><//>` : html`<span className="muted">—</span>`}
          ${proj != null ? html`<span className="tnum sub it-proj"><${GameGlyph} name="reforge" size=${11} />${proj}</span>` : ''}</span>
      </span>
      <span className="ip-score" title=${(stale ? 'Nota do gravado · ' : dirty ? 'Nota do rascunho · ' : '') + `Potencial ${pct(pot) || '—'}`}>
        <span className="ip-cap">peça</span>
        <span className="ip-score-v">${pot != null ? html`<${Delta} v=${pot}><${RankBadge} rank=${itemRank.rankFor(pot)} className="lg" /><span className="tnum sub">${pct(pot)}</span><//>` : html`<span className="muted">—</span>`}</span>
      </span>
      ${heroName ? html`<${HeroNote} heroName=${heroName} src=${src} hp=${hp} mode=${noteMode || 'none'} onMode=${onNoteMode || (() => {})} />` : ''}
    </span>
    <span className="ip-vr"></span>
    <${OwnerPicker} ownerId=${draft.equippedById || null} onChange=${onOwner} />
    ${onClose ? html`<button type="button" className="ip-x" aria-label="fechar" title="Fechar" onClick=${onClose}>
      <${Glyph} name="close" size=${13} />
    </button>` : ''}
  </div>`;
}

module.exports = { ItemHeader, OwnerPicker, MATERIAL_PT };
