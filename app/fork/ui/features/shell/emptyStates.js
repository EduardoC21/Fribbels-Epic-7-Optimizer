/*
 * emptyStates — os estados "sem dados" que se repetem entre telas (padrão em components/EmptyState.js).
 * Telas que dependem da conta chamam `noAccount(app.account)`: devolve o bloco (carregando / sem conta) ou null.
 */
'use strict';
const { html } = require('../../h.js');
const { EmptyState, Glyph, GearIcon } = require('../../components/index.js');

const LOADING = html`<${Glyph} name="download" size=${28} />`;

function noAccount(account, compact) {
  if (account.ready) return null;
  if (account.loading) return html`<${EmptyState} icon=${LOADING} title="Carregando…" compact=${compact} />`;
  return html`<${EmptyState} icon=${html`<${Glyph} name="alert" size=${30} />`} title="Sem conta" compact=${compact}
    tip=${`O backend não respondeu (${account.error || 'fora do ar'}). Abra o app principal.`} />`;
}

/* herói da lista que não está na conta importada (abas Principal, Otimizador, Cobertura) */
const offAccount = () => html`<${EmptyState} compact=${true} icon=${html`<${Glyph} name="people" size=${30} />`}
  title="Herói fora da conta" tip="Este herói não está na conta sincronizada" />`;

const inventoryIcon = () => html`<${GearIcon} slot="Armor" size=${40} />`;

module.exports = { noAccount, offAccount, inventoryIcon };
