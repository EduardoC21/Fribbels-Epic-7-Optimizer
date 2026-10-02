/*
 * Tabs — a barra de abas do topo. `right` recebe o que fica na ponta direita
 * (seletor de tier dos pros, botão de baixar dados da comunidade, etc).
 */
'use strict';
const { html } = require('../h.js');
const { Button } = require('./Button.js');

function Tabs({ items, value, onChange, right }) {
  return html`<div className="ui-tabs" role="tablist">
    ${(items || []).map((it) => html`<${Button} key=${it.id}
      active=${it.id === value}
      onClick=${() => onChange && onChange(it.id)}>${it.label}<//>`)}
    ${right ? html`<span className="spacer"></span>` : ''}
    ${right}
  </div>`;
}

module.exports = { Tabs };
