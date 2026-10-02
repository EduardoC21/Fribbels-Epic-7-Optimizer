/*
 * pick.js — o que acontece ao clicar numa linha da lista de builds (Principal e
 * Comunidade):
 *   pública/marcada          → BUILD-ALVO do topo (comparativo, target/TargetTop.js)
 *   salva e NÃO equipada      → o topo mostra ESSA build no formato normal (peças e
 *                               com quem cada uma está; HeroTop) — equipar é pelo menu
 *   equipada (ou salva = equipada) → o topo volta para a build do próprio herói
 * Sobe a tela até o topo para mostrar o resultado.
 */
'use strict';

function pickHandler(app, hero) {
  return (r) => {
    if (r.origin === 'pro' || r.origin === 'community' || (r.origin === 'saved' && !r.inUse)) app.selectTarget(hero.name, r);
    else app.clearTarget();
    const main = document.querySelector('.hero-main');
    if (main && main.scrollTo) main.scrollTo({ top: 0, behavior: 'smooth' });
  };
}

module.exports = { pickHandler };
