/*
 * useCommunity — o que as abas Estatísticas e Construções compartilham:
 * lê os dados públicos do herói (SÓ o cache em disco; a rede é o botão "Baixar"),
 * relendo quando o tier do RTA do herói muda, e as telas de "sem dados".
 */
'use strict';
const { html, useEffect } = require('../../h.js');
const { Button, Glyph, EmptyState } = require('../../components/index.js');
const { useApp } = require('../../state/app.js');

function useCommunity(hero) {
  const app = useApp();
  const entry = app.community[hero.name];
  const tier = app.rtaTierOf(hero.name);
  useEffect(() => {
    if (!entry) { app.loadCommunity(hero.name); return; }
    // trocou o tier no seletor: relê o RTA daquele tier (cache, sem rede)
    if (entry.rtaStatus !== 'loading' && entry.tier && entry.tier !== tier) app.loadRta(hero.name);
  }, [hero.name, tier]);
  return {
    app, entry, tier,
    summary: entry && entry.summary,
    official: entry && entry.official,
    computed: entry && entry.computed,
  };
}

/* null quando há dados; senão a caixa que explica o que falta */
function missing({ app, entry, summary }, hero) {
  if (!entry || (entry.status === 'loading' && !summary)) {
    return html`<${EmptyState} compact=${true} icon=${html`<${Glyph} name="download" size=${28} />`} title="Lendo os dados…" />`;
  }
  if (entry.status === 'error' && !summary) {
    return html`<${EmptyState} compact=${true} icon=${html`<${Glyph} name="alert" size=${30} />`} title="Não foi possível ler os dados"
      tip=${entry.error} action=${html`<${Button} onClick=${() => app.downloadCommunity(hero.name)}>
        <${Glyph} name="download" size=${14} /> Baixar de novo<//>`} />`;
  }
  if (summary) return null;
  return html`<${EmptyState} compact=${true} icon=${html`<${Glyph} name="download" size=${28} />`} title="Nada baixado"
    tip="Builds de maior gear score e RTA oficial; só o nome do herói sai do computador"
    action=${html`<${Button} variant="accent" onClick=${() => app.downloadCommunity(hero.name)}>
      <${Glyph} name="download" size=${14} /> Baixar<//>`} />`;
}

/*
 * O "Baixar" falhou mas há builds de um download ANTERIOR no cache: elas continuam na
 * tela, então o erro TEM de aparecer (antes ficava escondido e a lista velha passava
 * por nova — foi assim que o bug do filtro do RTA ficou invisível em 2026-09-28).
 */
function downloadWarn({ entry, summary }) {
  if (!entry || entry.status !== 'error' || !summary) return '';
  const when = summary.generatedAt ? new Date(summary.generatedAt).toLocaleDateString('pt-BR') : '?';
  return html`<div className="cm-warn" role="alert">Não foi possível baixar as builds: ${entry.error}. O que aparece aqui é o download de ${when}.</div>`;
}

module.exports = { useCommunity, missing, downloadWarn };
