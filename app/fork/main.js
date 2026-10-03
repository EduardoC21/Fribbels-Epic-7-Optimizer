/*
 * main.js — ponto de entrada da janela do fork.
 *
 * Front novo, escrito do zero: React + htm via require (sem passo de build).
 * Do app clássico vem SÓ constante, asset e dado — nunca componente.
 *   lib/   → motor (dados e cálculo)
 *   ui/    → interface (tokens, componentes burros, telas)
 */
'use strict';
const { ReactDOM, html } = require('./ui/h.js');
const { AppProvider } = require('./ui/state/app.js');
const { AppShell } = require('./ui/features/shell/AppShell.js');

// dica do sistema no lugar da caixa branca do Windows (todo `title` do app)
require('./ui/tooltip.js').install(document);

ReactDOM.render(
  html`<${AppProvider}><${AppShell} /><//>`,
  document.getElementById('root')
);
