/*
 * GearCard — uma peça equipada, no formato aprovado no mockup:
 *
 *   [ícone da peça] [nível 85/88/90] [🔒 se travada]   [retrato de quem usa]
 *   ─────────────────────────────────────────────────────────────
 *   [ícone] MAIN                                          valor
 *   ─────────────────────────────────────────────────────────────
 *   [ícone] sub   ›››                                     valor   ×4, espalhados
 *   ─────────────────────────────────────────────────────────────
 *   [set] +15                    SCORE · RANK DA PEÇA · RANK PARA O DONO (sem dono: só os 2)
 *
 * Borda = raridade (épico vermelho, heroico roxo, raro azul…).
 * › = 1 UP no substatus (só os 5 aprimoramentos; o roll inicial não conta —
 * itemStats.upgradeCounts), cor pela quantidade: cinza→verde→azul→roxo→vermelho.
 */
'use strict';
const { html } = require('../../h.js');
const { StatIcon, SetIcon, GearIcon, Portrait, RankBadge, Glyph, GameGlyph, Delta } = require('../../components/index.js');
const itemStats = require('../../../lib/itemStats.js');
const itemRank = require('../../../lib/itemRank.js');
const interest = require('../../../lib/interest.js');
const theme = require('../../theme.js');
const { useApp } = require('../../state/app.js');

const RARITY = { Epic: 'epic', Heroic: 'heroic', Rare: 'rare', Good: 'good', Normal: 'normal' };
const SLOT_PT = { Weapon: 'Arma', Helmet: 'Capacete', Armor: 'Armadura', Necklace: 'Colar', Ring: 'Anel', Boots: 'Bota' };

function Ups({ n }) {
  if (!n) return html`<span className="gc-ups zero" aria-label="sem up">·</span>`;
  return html`<span className="gc-ups" style=${{ color: theme.upColor(n) }} aria-label=${`${n} up`}>${'›'.repeat(n)}</span>`;
}

function GearCard({ slot, item, ownerCode, onOpen, gemMode }) {
  const app = useApp();
  if (!item) {
    // espaço vazio: só o símbolo da peça que falta, grande no centro.
    // Com onOpen (herói da conta) abre o SlotDialog: equipar ou cadastrar.
    const add = typeof onOpen === 'function';
    const tip = `${SLOT_PT[slot]} vazio${add ? ' · equipar ou cadastrar' : ''}`;
    return html`<div className=${'gc empty' + (add ? ' clickable' : '')} title=${tip}
      role=${add ? 'button' : undefined} tabIndex=${add ? 0 : undefined}
      onClick=${add ? onOpen : undefined}
      onKeyDown=${add ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(); } } : undefined}>
      <${GearIcon} slot=${slot} size=${64} title=${tip} />
    </div>`;
  }
  const main = itemStats.info(item.main && item.main.type);
  const ups = itemStats.upgradeCounts(item);
  const score = itemRank.scoreOf(item);
  const pot = itemRank.potentialOf(item);
  const rank = itemRank.rankFor(pot);
  const tip = `Potencial ${pot == null ? '—' : itemRank.pctInt(pot) + '%'} · Pontos de Equipamento ${score == null ? '—' : score}`;
  const rar = RARITY[item.rank] || 'normal';
  // nota para o DONO = a mesma do cabeçalho do editor (barras do Otimizador dele; set/main que não aceita = "—")
  const owner = item.equippedByName || null;
  const hp = owner && app && app.ratingProfiles ? interest.profileFor(app.ratingProfiles, 'h:' + owner) : null;
  // `gemMode` = o modo da pedra da tela que mostra o card (herói: o do herói; sem = o da tela Equipamentos)
  const hpot = hp && interest.fits(item, hp) ? itemRank.potentialOf(item, hp.id, gemMode) : null;
  const pctTxt = (v) => (v == null ? '—' : itemRank.pctInt(v) + '%');

  // só vira "botão" quando houver ação (popout do item) — clicável que não faz nada engana
  const interactive = typeof onOpen === 'function';
  return html`<div className=${'gc' + (interactive ? ' clickable' : '')} style=${{ borderColor: `var(--${rar})` }}
    title=${`${SLOT_PT[slot]} · ${item.rank} · ${item.name || ''}`}
    role=${interactive ? 'button' : undefined} tabIndex=${interactive ? 0 : undefined}
    onClick=${interactive ? onOpen : undefined}
    onKeyDown=${interactive ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(); } } : undefined}>
    <span className="gc-head">
      <${GearIcon} slot=${slot} size=${26} />
      <span className="gc-lvl tnum" title="Nível">${item.level}</span>
      ${item.locked ? html`<${Glyph} name="lock" size=${12} className="gc-lock" title="Travada" />` : ''}
      <span className="spacer"></span>
      <${Portrait} code=${ownerCode} size=${26} title=${item.equippedByName || ''} />
    </span>
    <span className="gc-div"></span>
    <span className="gc-main">
      <${StatIcon} stat=${main.icon} size=${14} />
      <span className="gc-mn">${itemStats.label(item.main && item.main.type)}</span>
      <${Delta} v=${item.main ? Number(item.main.value) : null} className="gc-mv tnum">${itemStats.fmt(item.main && item.main.type, item.main && item.main.value)}<//>
    </span>
    <span className="gc-div"></span>
    <span className="gc-subs">
      ${(item.substats || []).map((s, i) => {
        const inf = itemStats.info(s.type);
        return html`<span key=${i} className="gc-sub">
          <${StatIcon} stat=${inf.icon} size=${12} />
          <span className="gc-sn">${itemStats.label(s.type)}${s.modified ? html`<span> <${GameGlyph} name="modified" size=${10} title="Modificado (gema)" className="gc-mod" /></span>` : ''}</span>
          <${Ups} n=${ups[i]} />
          <${Delta} v=${Number(s.value)} className="gc-sv tnum">${itemStats.fmt(s.type, s.value)}<//>
        </span>`;
      })}
    </span>
    <span className="gc-div"></span>
    <span className="gc-foot">
      <${SetIcon} set=${item.set} size=${17} />
      <span className="gc-enh tnum">+${item.enhance}</span>
      <span className="spacer"></span>
      <span className="gc-notes">
        <${Delta} v=${score}><span className="gc-score tnum" title=${`Pontos de Equipamento ${score == null ? '—' : score}`}>${score == null ? '—' : score}</span><//>
        <span className="gc-dot" aria-hidden="true">·</span>
        <${Delta} v=${pot}><${RankBadge} rank=${rank} title=${tip} /><//>
        ${owner ? html`<span className="gc-dot" aria-hidden="true">·</span>
          ${hpot != null ? html`<${Delta} v=${hpot}><${RankBadge} rank=${itemRank.rankFor(hpot)} title=${`Para ${owner}: potencial ${pctTxt(hpot)}`} /><//>`
            : html`<span className="gc-none" title=${`Sem nota para ${owner} (sem barras ou set/main fora)`}>—</span>`}` : ''}
      </span>
    </span>
  </div>`;
}

module.exports = { GearCard, Ups, SLOT_PT, RARITY };
