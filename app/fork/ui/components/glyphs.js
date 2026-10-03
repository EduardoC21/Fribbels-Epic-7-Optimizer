/*
 * glyphs.js — os ícones da NOSSA interface (setas, chevrons, check, lupa…).
 * Não confundir com ui/components/Icon.js, que traz os assets do JOGO
 * (stat, set, elemento, classe, retrato).
 *
 * Regra do traço, para o conjunto parecer uma família só:
 *   viewBox 24×24 · stroke currentColor · width 1.9 · cap e join redondos.
 * Glifos sólidos (estrela, pontinhos de arrastar) declaram `fill: true`.
 *
 * Nada de caractere de texto fazendo papel de ícone (← ▾ ◀ ✕): eles herdam a
 * métrica da fonte, desalinham e cada sistema desenha de um jeito.
 */
'use strict';
const { React, html } = require('../h.js');
const F = React.Fragment;

const G = {
  'chevron-down':  () => html`<path d="M6 9.5l6 6 6-6" />`,
  'chevron-up':    () => html`<path d="M6 14.5l6-6 6 6" />`,
  'chevron-left':  () => html`<path d="M14.5 6l-6 6 6 6" />`,
  'chevron-right': () => html`<path d="M9.5 6l6 6-6 6" />`,

  /* aplicar: leva o valor para a esquerda (para o personagem) */
  'arrow-left':    () => html`<${F}><path d="M20 12H5" /><path d="M11 6l-6 6 6 6" /><//>`,
  'arrow-right':   () => html`<${F}><path d="M4 12h15" /><path d="M13 6l6 6-6 6" /><//>`,
  /* "deste tier pra cima" */
  'arrow-up':      () => html`<${F}><path d="M12 20V5" /><path d="M6 11l6-6 6 6" /><//>`,
  /* aplicar tudo de uma vez */
  /* centrado no quadro 24×24 (as duas setas ocupam 5,5 → 18,5) */
  'arrow-left-all':  () => html`<${F}><path d="M11.5 6l-6 6 6 6" /><path d="M18.5 6l-6 6 6 6" /><//>`,

  'check':  () => html`<path d="M5 12.5l4.5 4.5L19 7" />`,
  'close':  () => html`<${F}><path d="M6.5 6.5l11 11" /><path d="M17.5 6.5l-11 11" /><//>`,
  'search': () => html`<${F}><circle cx="11" cy="11" r="7" /><path d="M20.5 20.5l-4.2-4.2" /><//>`,
  'download': () => html`<${F}><path d="M12 3.5v11" /><path d="M7.5 10l4.5 4.5L16.5 10" /><path d="M4.5 20h15" /><//>`,
  'gear':   () => html`<${F}><circle cx="12" cy="12" r="3.2" />
    <path d="M12 2.6v2.6M12 18.8v2.6M2.6 12h2.6M18.8 12h2.6M5.4 5.4l1.9 1.9M16.7 16.7l1.9 1.9M18.6 5.4l-1.9 1.9M7.3 16.7l-1.9 1.9" /><//>`,
  /* origem das builds: salva por você · comunidade · pros (o "buildado"/equipada
     usa o asset de armadura do próprio jogo, via GearIcon) */
  /* configurações: engrenagem DENTADA (a 'gear' de raios é o Equipável) */
  'settings': () => html`<${F}><path d="M10.6 4.9L10.8 2.5L13.2 2.5L13.4 4.9L16.0 6.0L17.9 4.4L19.6 6.1L18.0 8.0L19.1 10.6L21.5 10.8L21.5 13.2L19.1 13.4L18.0 16.0L19.6 17.9L17.9 19.6L16.0 18.0L13.4 19.1L13.2 21.5L10.8 21.5L10.6 19.1L8.0 18.0L6.1 19.6L4.4 17.9L6.0 16.0L4.9 13.4L2.5 13.2L2.5 10.8L4.9 10.6L6.0 8.0L4.4 6.1L6.1 4.4L8.0 6.0z" /><circle cx="12" cy="12" r="3.2" /><//>`,
  'folder':   () => html`<path d="M3.5 6.5a1.5 1.5 0 0 1 1.5-1.5h4.2l2 2.2H19a1.5 1.5 0 0 1 1.5 1.5v9.3a1.5 1.5 0 0 1-1.5 1.5H5a1.5 1.5 0 0 1-1.5-1.5z" />`,
  'save':   () => html`<${F}><path d="M5 3.5h11l3.5 3.5v12a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 19V5A1.5 1.5 0 0 1 5 3.5z" /><path d="M7.5 3.5v5h8v-5" /><path d="M7.5 20.5v-6h9v6" /><//>`,
  'people': () => html`<${F}><circle cx="9" cy="8" r="3.2" /><path d="M3 20c0-3.3 2.7-5.8 6-5.8s6 2.5 6 5.8" /><path d="M15.5 4.9a3.2 3.2 0 0 1 0 6.2" /><path d="M17.5 14.5c2 .7 3.5 2.8 3.5 5.5" /><//>`,
  'crown':  () => html`<${F}><path d="M3.5 8l4.3 4 4.2-7 4.2 7 4.3-4-1.7 10.5H5.2z" /><path d="M5.2 21h13.6" /><//>`,
  /* ataque em dupla — o jogo não tem asset para ele: dois golpes */
  'dual':   () => html`<${F}><path d="M4 15.5l9-9" /><path d="M8.5 6.5H13V11" /><path d="M11 20.5l9-9" /><path d="M15.5 11.5H20V16" /><//>`,
  'sort':   () => html`<${F}><path d="M8 10l-3-3-3 3" /><path d="M5 7v10" /><path d="M16 14l3 3 3-3" /><path d="M19 17V7" /><//>`,

  /* popout de item */
  /* gema de modificação de substatus */
  'gem':      () => html`<${F}><path d="M12 3l7 6-7 12-7-12z" /><path d="M5 9h14" /><//>`,
  'copy':     () => html`<${F}><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3" /><//>`,
  'trash':    () => html`<${F}><path d="M4 7h16" /><path d="M9 7V4h6v3" /><path d="M6 7l1 13h10l1-13" /><//>`,
  /* tirar do herói: sai para fora, até a borda */
  'unequip':  () => html`<${F}><path d="M4 12h11" /><path d="M11 6l6 6-6 6" /><path d="M20 4v16" /><//>`,
  'edit':     () => html`<${F}><path d="M4 20h4L19 9l-4-4L4 16z" /><path d="M13.5 6.5l4 4" /><//>`,
  /* relatório com aviso (barra do jogo): círculo com "!" */
  'alert':    () => html`<${F}><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5v5.5" /><path d="M12 16.4v.1" /><//>`,
  'lock':     () => html`<${F}><rect x="5" y="10.5" width="14" height="10" rx="2" /><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" /><//>`,
  /* o mesmo cadeado com a alça aberta para o lado */
  'unlock':   () => html`<${F}><rect x="5" y="10.5" width="14" height="10" rx="2" /><path d="M8 10.5V7.5a4 4 0 0 1 7.6-1.8" /><//>`,
  /* equipar: entra no herói (espelho do "unequip") */
  'equip':    () => html`<${F}><path d="M20 12H9" /><path d="M13 6l-6 6 6 6" /><path d="M4 4v16" /><//>`,
  'plus':     () => html`<${F}><path d="M12 5v14" /><path d="M5 12h14" /><//>`,

  /* sólidos */
  /* ganho sobre a base (o ▲ laranja da tela do herói no jogo) */
  'gain':   () => html`<path d="M12 5.5l7.5 12h-15z" />`,
  'star':   () => html`<path d="M12 2.6l2.85 6.05 6.65.72-4.95 4.45 1.35 6.53L12 17.1l-5.9 3.25 1.35-6.53L2.5 9.37l6.65-.72z" />`,
  'drag':   () => html`<${F}>
    <circle cx="9" cy="5" r="1.6" /><circle cx="15" cy="5" r="1.6" />
    <circle cx="9" cy="12" r="1.6" /><circle cx="15" cy="12" r="1.6" />
    <circle cx="9" cy="19" r="1.6" /><circle cx="15" cy="19" r="1.6" /><//>`,
  /* "mais ações" (⋯) */
  'more':   () => html`<${F}><circle cx="5.5" cy="12" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="18.5" cy="12" r="1.8" /><//>`,
};

const SOLID = new Set(['star', 'drag', 'gain', 'more']);

/*
 * <Glyph name="arrow-left" /> — herda a cor de quem o contém (currentColor),
 * então o mesmo glifo serve em botão claro, escuro ou accent sem variante nova.
 */
function Glyph({ name, size, strokeWidth, title, className, style }) {
  const draw = G[name];
  if (!draw) return null;
  const px = size || 14;
  const solid = SOLID.has(name);
  return html`<svg className=${['ui-glyph', className || ''].filter(Boolean).join(' ')}
    style=${style} width=${px} height=${px} viewBox="0 0 24 24" aria-hidden=${title ? undefined : 'true'}
    role=${title ? 'img' : undefined} aria-label=${title || undefined} data-tip=${title || undefined}
    fill=${solid ? 'currentColor' : 'none'}
    stroke=${solid ? 'none' : 'currentColor'}
    strokeWidth=${solid ? undefined : (strokeWidth || 1.9)}
    strokeLinecap="round" strokeLinejoin="round">
    ${draw()}
  </svg>`;
}

const GLYPH_NAMES = Object.keys(G);

module.exports = { Glyph, GLYPH_NAMES };
