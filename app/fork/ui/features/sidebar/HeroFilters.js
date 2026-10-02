/*
 * HeroFilters — cabeçalho da barra lateral: busca + filtros.
 * Elemento, classe e estrela são ícones que ligam/desligam (vários ao mesmo
 * tempo = OU). Arquétipo, favorito, equipável e buildado ficam na MESMA linha;
 * os três últimos são só símbolo e começam desligados.
 */
'use strict';
const { html } = require('../../h.js');
const { Glyph, ElementIcon, ClassIcon, GearIcon, Dropdown, ArchetypeSymbol } = require('../../components/index.js');
const archetypes = require('../../../lib/archetypes.js');
const { ELEMENTS, ROLES, STARS } = require('./order.js');

const toggleIn = (arr, v) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

function Tog({ on, title, onClick, children }) {
  return html`<button type="button" className=${'hf-tog' + (on ? ' on' : '')}
    title=${title} aria-label=${title} aria-pressed=${!!on} onClick=${onClick}>${children}</button>`;
}

function HeroFilters({ filters, onChange, total, shown }) {
  const set = (patch) => onChange({ ...filters, ...patch });

  const archOpts = [{ value: '__none__', label: 'Sem arquétipo' }]
    .concat(archetypes.list().map((a) => ({ value: a.id, label: a.name || 'Sem nome', icon: html`<${ArchetypeSymbol} symbol=${a.symbol} size=${16} />` })));

  return html`<div className="hf">
    <div className="hf-title">
      <b>Heróis</b>
      <span className="sub tnum">${shown === total ? total : `${shown} de ${total}`}</span>
    </div>

    <label className="hf-search">
      <${Glyph} name="search" size=${14} />
      <input aria-label="Buscar herói" placeholder="Buscar herói…" value=${filters.q}
        onChange=${(e) => set({ q: e.target.value })} />
      ${filters.q ? html`<button type="button" className="hf-clear" aria-label="limpar busca"
        onClick=${() => set({ q: '' })}><${Glyph} name="close" size=${12} /></button>` : ''}
    </label>

    <div className="hf-row">
      <span className="hf-lab">Elemento</span>
      <span className="hf-group">
        ${ELEMENTS.map((e) => html`<${Tog} key=${e.key} title=${e.label}
          on=${filters.elements.includes(e.key)}
          onClick=${() => set({ elements: toggleIn(filters.elements, e.key) })}>
          <${ElementIcon} element=${e.key} size=${16} />
        <//>`)}
      </span>
    </div>

    <div className="hf-row">
      <span className="hf-lab">Classe</span>
      <span className="hf-group">
        ${ROLES.map((r) => html`<${Tog} key=${r.key} title=${r.label}
          on=${filters.roles.includes(r.key)}
          onClick=${() => set({ roles: toggleIn(filters.roles, r.key) })}>
          <${ClassIcon} role=${r.key} size=${16} />
        <//>`)}
      </span>
    </div>

    <div className="hf-row">
      <span className="hf-lab">Estrelas</span>
      <span className="hf-group">
        ${STARS.map((n) => html`<button type="button" key=${n}
          className=${'hf-star' + (filters.stars.includes(n) ? ' on' : '')}
          aria-pressed=${filters.stars.includes(n)}
          onClick=${() => set({ stars: toggleIn(filters.stars, n) })}>
          <span className="tnum">${n}</span><${Glyph} name="star" size=${10} />
        </button>`)}
      </span>
    </div>

    <div className="hf-row">
      <span className="hf-lab">Arquétipo</span>
      <span className="hf-arch">
        <${Dropdown} options=${archOpts} value=${filters.archetype}
          placeholder="Todos"
          onChange=${(v) => set({ archetype: v === filters.archetype ? null : v })} />
      </span>
      <${Tog} title="Só favoritos" on=${filters.favorite}
        onClick=${() => set({ favorite: !filters.favorite })}>
        <${Glyph} name="star" size=${14} />
      <//>
      <${Tog} title="Só equipáveis" on=${filters.equipavel}
        onClick=${() => set({ equipavel: !filters.equipavel })}>
        <${Glyph} name="gear" size=${14} />
      <//>
      <${Tog} title="Só com equipamento" on=${filters.built}
        onClick=${() => set({ built: !filters.built })}>
        <${GearIcon} slot="Armor" size=${17} />
      <//>
    </div>
  </div>`;
}

module.exports = { HeroFilters };
