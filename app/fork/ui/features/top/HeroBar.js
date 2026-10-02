/*
 * HeroBar — identidade do herói no topo da aba Principal:
 * retrato, nome, elemento, classe e estrelas BASE (raridade), e no canto os
 * interruptores de favorito (★) e equipável (⚙) — só símbolo, ligado/desligado.
 * Herói fora da conta ganha um aviso discreto: a tela mostra só dados públicos.
 *
 * Com uma BUILD-ALVO escolhida: `badge` mostra de onde ela é (Pro / Comunidade)
 * e `onExit` põe o botão para voltar à build do próprio herói.
 */
'use strict';
const { html } = require('../../h.js');
const { Glyph, Portrait, ElementIcon, ClassIcon, Stars } = require('../../components/index.js');
const { useApp } = require('../../state/app.js');

function Toggle({ on, label, onClick, children }) {
  return html`<button type="button" className=${'hb-tog' + (on ? ' on' : '')}
    title=${label} aria-label=${label} aria-pressed=${!!on} onClick=${onClick}>${children}</button>`;
}

function HeroBar({ hero, badge, onExit }) {
  const app = useApp();
  const inAccount = !!app.accountHero(hero.name);
  const fav = app.isFavorite(hero.name);
  const eq = app.isEquipavel(hero.name);

  return html`<div className="hb ui-box">
    <${Portrait} code=${hero.code} size=${48} />
    <div className="hb-id">
      <span className="hb-name">${hero.name}</span>
      <${ElementIcon} element=${hero.attribute} size=${18} />
      <${ClassIcon} role=${hero.role} size=${18} />
      <${Stars} count=${hero.rarity} size=${11} />
      ${inAccount ? '' : html`<span className="hb-out" title="Fora da conta: só dados públicos">
        fora da conta</span>`}
      ${badge ? html`<span className="hb-badge">${badge}</span>` : ''}
    </div>
    <span className="spacer"></span>
    ${onExit ? html`<button type="button" className="hb-exit" onClick=${onExit}>
      <${Glyph} name="close" size=${12} /> Minha build</button>` : ''}
    <${Toggle} on=${fav} label=${fav ? 'Favorito — clique para remover' : 'Favoritar (marca equipável junto)'}
      onClick=${() => app.toggleFavorite(hero.name)}>
      <${Glyph} name="star" size=${16} />
    <//>
    <${Toggle} on=${eq} label=${eq ? 'Equipável — clique para remover' : 'Marcar como equipável'}
      onClick=${() => app.toggleEquipavel(hero.name)}>
      <${Glyph} name="gear" size=${16} />
    <//>
  </div>`;
}

module.exports = { HeroBar };
