/*
 * Icon — todos os ícones vêm dos ASSETS DO JOGO já existentes no projeto
 * (app/assets), via lib/assets.js. Nada de letra dentro de caixinha.
 * Se o asset faltar, cai num placeholder neutro em vez de quebrar a tela.
 */
'use strict';
const { html } = require('../h.js');
const assets = require('../../lib/assets.js');

function Img({ src, size, round, title, className }) {
  const px = size || 14;
  const style = { width: px, height: px };
  if (!src) {
    return html`<span className=${['ui-ico', 'ph', round ? 'round' : '', className || ''].filter(Boolean).join(' ')}
      style=${style} title=${title}></span>`;
  }
  return html`<img className=${['ui-ico', round ? 'round' : '', className || ''].filter(Boolean).join(' ')}
    style=${style} src=${src} alt="" title=${title} loading="lazy" decoding="async"
    onError=${(e) => { e.target.style.visibility = 'hidden'; }} />`;
}

/* Dica só quando passada: o código cru ("atk", "SpeedSet", "Weapon") não diz nada a quem joga (Eduardo, 2026-10-02).
   Set é a exceção: o ícone costuma vir sozinho, então a dica é o nome do set. */
const SLOT_NAME = { Weapon: 'Arma', Helmet: 'Capacete', Armor: 'Armadura', Necklace: 'Colar', Ring: 'Anel', Boots: 'Bota' };
/* atributo (atk/hp/def/spd/chc/chd/eff/efr) */
const StatIcon = ({ stat, size, title }) => html`<${Img} src=${assets.statIcon(stat)} size=${size || 13} title=${title} />`;
/* set do equipamento */
const SetIcon = ({ set, size, title }) => html`<${Img} src=${assets.setIcon(set)} size=${size || 14} title=${title || (set ? String(set).replace(/Set$/, '') : undefined)} />`;
/* elemento do herói (fogo/gelo/vento/luz/trevas) */
const ElementIcon = ({ element, size, title }) => html`<${Img} src=${assets.element(element)} size=${size || 14} round=${true} title=${title} />`;
/* classe do herói */
const ClassIcon = ({ role, size, title }) => html`<${Img} src=${assets.klass(role)} size=${size || 14} title=${title} />`;
/* tipo de peça (Weapon/Helmet/Armor/Necklace/Ring/Boots) */
const GearIcon = ({ slot, size, title }) => html`<${Img} src=${assets.gearIcon(slot)} size=${size || 22} title=${title || SLOT_NAME[slot]} />`;
/* retrato do herói (redondo, com borda escura) */
const Portrait = ({ code, size, title }) => html`<${Img} src=${assets.portrait(code)} size=${size || 38} round=${true} title=${title} className="ui-portrait" />`;

/*
 * Símbolo do jogo monocromático (artifact, ee, imprint, modified — ver lib/assets.js):
 * máscara sobre currentColor, então segue a cor do texto em volta.
 */
function GameGlyph({ name, size, title, className }) {
  const src = assets.gameGlyph(name);
  const px = size || 12;
  const style = { width: px, height: px, WebkitMaskImage: src ? `url(${src})` : 'none' };
  return html`<span className=${'ui-gg' + (className ? ' ' + className : '')} style=${style}
    role=${title ? 'img' : undefined} aria-label=${title || undefined} aria-hidden=${title ? undefined : 'true'} title=${title}></span>`;
}

/* estrelas de raridade — neutras, como o asset do jogo */
function Stars({ count, size }) {
  const n = Math.max(0, Math.min(6, Number(count) || 0));
  return html`<span className="ui-stars" aria-label=${`${n} estrelas`}>
    ${Array.from({ length: n }).map((_, i) => html`<i key=${i} style=${{ width: size || 8, height: size || 8 }}></i>`)}
  </span>`;
}

module.exports = { Img, GameGlyph, StatIcon, SetIcon, ElementIcon, ClassIcon, GearIcon, Portrait, Stars };
