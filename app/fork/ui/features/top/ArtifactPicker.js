/*
 * ArtifactPicker — escolhe o artefato do herói. Mostra os da classe dele + os
 * universais, com busca. A arte vem da CDN oficial (a mesma do app clássico),
 * com fallback no epic7db.
 */
'use strict';
const { html, useState, useMemo } = require('../../h.js');
const { Modal, Glyph, Scrollable, Stars } = require('../../components/index.js');
const heroBonus = require('../../../lib/heroBonus.js');

const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

function ArtImg({ name, code, size }) {
  const px = size || 30;
  return html`<img className="ap-img" style=${{ width: px, height: px }} alt=""
    src=${heroBonus.artifactIcon(code) || heroBonus.artifactIconFallback(name)}
    onError=${(e) => {
      const fb = heroBonus.artifactIconFallback(name);
      if (fb && e.target.src !== fb) e.target.src = fb; else e.target.style.visibility = 'hidden';
    }} />`;
}

function ArtifactPicker({ role, current, onPick, onClose }) {
  const [q, setQ] = useState('');
  const list = useMemo(() => heroBonus.artifactList(role), [role]);
  const shown = useMemo(() => {
    const k = norm(q.trim());
    return k ? list.filter((a) => norm(a.name).includes(k)) : list;
  }, [q, list]);

  return html`<${Modal} title="Escolher artefato" width=${460} onClose=${onClose}>
    <label className="ap-search">
      <${Glyph} name="search" size=${14} />
      <input autoFocus=${true} aria-label="Buscar artefato" placeholder="Buscar artefato…" value=${q} onChange=${(e) => setQ(e.target.value)} />
    </label>
    <${Scrollable} className="ap-list">
      <button type="button" className=${'ap-row' + (!current ? ' on' : '')} onClick=${() => onPick('None')}>
        <span className="ap-img ap-none"></span><span className="ap-name">Sem artefato</span>
      </button>
      ${shown.map((a) => html`<button type="button" key=${a.name}
        className=${'ap-row' + (current === a.name ? ' on' : '')} onClick=${() => onPick(a.name)}>
        <${ArtImg} name=${a.name} code=${a.code} />
        <span className="ap-name ellipsis">${a.name}</span>
        <${Stars} count=${a.rarity} size=${8} />
      </button>`)}
    <//>
  <//>`;
}

module.exports = { ArtifactPicker, ArtImg };
