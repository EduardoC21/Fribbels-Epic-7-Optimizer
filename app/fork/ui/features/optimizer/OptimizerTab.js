/*
 * OptimizerTab — a aba Otimizador:
 *
 *   [ Personagem                                    ] [ Comunidade         ]
 *   arquétipo │ stat | prioridade (-1..3) | mín | máx   ← | mín | máx | recom.
 *   set 1..3  │  (8 linhas)                              (8 linhas, alinhadas)
 *   mains     │
 * Os campos de seleção ficam numa coluna À ESQUERDA das barras (antes ficavam em
 * cima): o cabeçalho das duas caixas encolhe, a aba cabe sem rolar e a caixa
 * Comunidade (que só tem números) fica estreita.
 *
 * "Personagem" É o pedido do otimizador do próprio herói (hero.optimizationRequest):
 * o que se edita aqui aparece igual no otimizador clássico, e vice-versa. Cada
 * mudança é gravada ~0,6 s depois de parar de mexer (e salva no autosave.json).
 * "Otimizador →" grava e abre o otimizador da janela principal no herói.
 *
 * "Comunidade" = os arquétipos da aba Estatísticas e depois as builds marcadas (ver
 * recommend.js); o ← de uma linha copia Mín → mínimo e Máx → máximo do stat do
 * personagem; o "todos" copia só o Mín dos stats com barra > 0.
 * As duas caixas têm o mesmo cabeçalho e as mesmas 8 linhas, alinhadas.
 *
 * GÊMEO (Eduardo, 2026-10-02): herói com barras + sets + mains iguais aos de um arquétipo é gêmeo dele (atribuído
 * sozinho; régua e pedra contam como atributos: sem valor próprio = as do arquétipo). TODA edição que tiraria o herói da
 * semelhança — barra, set, main, régua ou pedra — pergunta antes (mín/máx não contam); confirmar = vira VARIANTE.
 * Atribuído e diferente = selo de alerta. `useTwinAsk` + `ruleHandlers` também servem a aba Cobertura do herói.
 * "Pedra" = a pedra FIXADA do herói (Cobertura e nota para o herói); vazio = a do arquétipo ou a padrão.
 */
'use strict';
const { html, useState, useMemo } = require('../../h.js');
const { Box, Button, Dropdown, Glyph, SetIcon, ArchetypeSymbol, InterestCut, Modal } = require('../../components/index.js');
const { ProfileSplit, useAutoSave, withStat } = require('./profileEditor.js');
const { useApp } = require('../../state/app.js');
const { offAccount } = require('../shell/emptyStates.js');
const statInfo = require('../../../lib/statInfo.js');
const archetypes = require('../../../lib/archetypes.js');
const OP = require('../../../lib/optimizerProfile.js');
const targetBuild = require('../../../lib/targetBuild.js');
const R = require('./recommend.js');
const F = require('../community/filters.js');
const { useCommunity } = require('../community/useCommunity.js');
const fmt = require('../../format.js');
const interest = require('../../../lib/interest.js');
const itemRatings = require('../../../lib/itemRatings.js');
const { GEM_OPTS } = require('../coverage/coverageText.js');

/* o arquétipo de que o perfil é gêmeo (barras + sets + mains + régua/pedra; mín/máx livres), ou null */
const isTwin = interest.isTwinOf;
function twinOf(list, profile, preferId, own, rel) {
  const all = list.filter((a) => isTwin(a, profile, own, rel));
  return all.find((a) => a.id === preferId) || all[0] || null;
}

/* pergunta "Deixar de ser gêmeo de X?" antes de aplicar a mudança: { request(nomeDoArquétipo, aplicar), dialog } */
function useTwinAsk() {
  const [ask, setAsk] = useState(null);
  const request = (archName, apply) => setAsk({ archName, apply });
  const dialog = ask ? html`<${Modal} title=${`Deixar de ser gêmeo de ${ask.archName || 'Sem nome'}?`} onClose=${() => setAsk(null)} width="380px">
    <div className="bd"><div className="bd-foot">
      <${Button} onClick=${() => setAsk(null)}>Cancelar<//>
      <${Button} variant="accent" onClick=${() => { ask.apply(); setAsk(null); }}>Deixar de ser gêmeo<//>
    </div></div>
  <//>` : '';
  return { request, dialog };
}

/*
 * régua/pedra do herói com a regra do gêmeo: `twin` = { name, min, gem } (as EFETIVAS do arquétipo) ou null.
 * Gêmeo: voltar ao valor do arquétipo (ou limpar) = herda, sem pergunta; outro valor = pergunta e vira variante.
 */
function ruleHandlers(app, heroName, twin, request) {
  const set = (field, v, archV, write) => {
    if (!twin) return write(v);
    if (v == null || v === archV) return write(null);
    request(twin.name, () => write(v));
  };
  return {
    onCut: (v) => set('min', v, twin && twin.min, (x) => app.setHeroInterest(heroName, x)),
    onGem: (v) => set('gem', v, twin && twin.gem, (x) => app.setHeroGem(heroName, x)),
  };
}

const ORIGIN_PT = { arche: 'Arquétipo', pro: 'Marcada', community: 'Marcada' };

/* ---------------- Personagem ---------------- */
function CharacterBox({ hero, profile, change, setRaw, flush, request }) {
  const app = useApp();
  const archId = (app.profileOf(hero.name) || {}).archetypeId || null;
  const all = archetypes.list();
  const arch = all.find((a) => a.id === archId) || null;
  const [opening, setOpening] = useState(false);
  const archOpts = all.map((a) => ({ value: a.id, label: a.name || 'Sem nome', icon: html`<${ArchetypeSymbol} symbol=${a.symbol} size=${18} />` }));
  const ghost = (k) => (arch ? arch.stats[k].priority : null);

  // escolher um arquétipo SUBSTITUI a configuração do herói pela dele; escolher o mesmo de novo só desliga o vínculo
  const pickArch = (id) => {
    const next = id === archId ? null : id;
    app.setArchetype(hero.name, next);
    if (next) setRaw(OP.applyArchetype(profile, all.find((a) => a.id === next)));   // escolher = vira gêmeo: sem pergunta
  };
  const own = app.profileOf(hero.name) || {};
  const twin = twinOf(all, profile, archId, own, app.rel);
  const ruleArch = twin || arch;   // de quem herda régua/pedra
  const rule = ruleHandlers(app, hero.name, twin && { name: twin.name, min: interest.archMin(twin, app.rel), gem: interest.archGem(twin, app.rel) }, request);
  const open = async () => { setOpening(true); await app.openOptimizer(hero.name, flush()); setOpening(false); };

  return html`<${Box} className="op-box">
    <div className="op-head">
      <div className="op-hrow">
        <span className="label" title="Configuração do otimizador deste herói">Personagem</span>
        <span className="spacer"></span>
        <${Button} variant="accent" disabled=${opening} onClick=${open}
          title="Abre no otimizador clássico">
          ${opening ? 'Abrindo…' : html`<span className="contents">Otimizador <${Glyph} name="arrow-right" size=${13} /></span>`}<//>
      </div>
    </div>
    <${ProfileSplit} profile=${profile} change=${change} ghost=${ghost}
      lead=${html`<span className="contents"><div className="op-frow">
        <span className="op-lab" title="Substitui barras, sets, mains, mín e máx">Arquétipo</span>
        <span className="op-grow"><${Dropdown} options=${archOpts} value=${arch ? archId : null} placeholder="nenhum" onChange=${pickArch} /></span>
        ${arch && !isTwin(arch, profile, own, app.rel) ? html`<span className="op-diff" title="Diferente do arquétipo" aria-label="Diferente do arquétipo"><${Glyph} name="alert" size=${14} /></span>` : ''}
      </div>
      <div className="op-frow">
        <span className="op-lab" title="Régua do herói. Vazio = a do arquétipo ou a padrão">Régua</span>
        <span className="op-grow eq-int">
          <${InterestCut} label="Régua deste herói" value=${own.interestMin}
            inherited=${interest.archMin(ruleArch, app.rel)} onChange=${rule.onCut} />
        </span>
      </div>
      <div className="op-frow">
        <span className="op-lab" title="Pedra da Cobertura e da nota para o herói. Vazio = a do arquétipo ou a padrão">Pedra</span>
        <span className="op-grow">
          <${Dropdown} label="Pedra deste herói" options=${GEM_OPTS} value=${own.gemMode || null} clearable=${true}
            placeholder=${itemRatings.GEM_MODE_LABEL[interest.archGem(ruleArch, app.rel)]} onChange=${rule.onGem} />
        </span>
      </div></span>`} />
  <//>`;
}

/* ---------------- Comunidade ---------------- */
/* onApply({ k: { min?, max? } }) — copia para o mínimo/máximo do personagem.
   `priorities` = {k: prioridade} do personagem: o "todos" só leva os stats com barra > 0 */
function CommunityBox({ hero, onApply, priorities }) {
  const app = useApp();
  const { summary } = useCommunity(hero);   // os arquétipos da aba Estatísticas (só cache, sem rede)
  const marked = app.markedOf(hero.name);
  const list = useMemo(() => {
    let base = null;
    try { base = targetBuild.baseStats(hero.name); } catch (e) { base = null; }
    return R.sources(marked, summary ? F.archetypeGroups(summary, hero.name) : [], base);
  }, [hero.name, app.marks, summary]);
  const [i, setI] = useState(0);
  const idx = list.length ? Math.min(i, list.length - 1) : 0;
  const src = list[idx] || null;

  const apply = (k) => { const v = R.rowValues(src, k); if (v) onApply({ [k]: v }); };
  const allVals = R.applyAllValues(src, priorities);
  const applyAll = () => { if (Object.keys(allVals).length) onApply(allVals); };
  const f = (e, v) => (v == null ? fmt.DASH : (e.pct ? fmt.pct(v) : fmt.int(v)));

  return html`<${Box} className="op-box">
    <div className="op-head">
      <div className="op-hrow">
        <span className="label">Comunidade</span>
        ${src ? html`<span className="op-src ellipsis" title=${src.note}>
          <span className="op-chip">${ORIGIN_PT[src.kind] || src.kind}</span>
          <span className=${src.mixed ? 'cm-mixed' : 'op-sets'}>${(src.setIcons || []).map((ic, j) => html`<${SetIcon} key=${j} set=${ic.set} size=${15} />`)}</span>
          <span className="ellipsis op-src-name">${src.label}</span>
        </span>` : ''}
        <span className="spacer"></span>
        ${list.length ? html`<span className="op-nav">
          <button type="button" className="bx-arw" aria-label="anterior" disabled=${idx <= 0} onClick=${() => setI(idx - 1)}>
            <${Glyph} name="chevron-left" size=${13} /></button>
          <span className="tnum"><b>${idx + 1}</b>/${list.length}</span>
          <button type="button" className="bx-arw" aria-label="próxima" disabled=${idx >= list.length - 1} onClick=${() => setI(idx + 1)}>
            <${Glyph} name="chevron-right" size=${13} /></button>
        </span>` : ''}
      </div>
    </div>
    <div className="op-cols op-rcols">
      <span className="c">${src ? html`<button type="button" className="op-apply all" disabled=${!Object.keys(allVals).length}
        title="Mín dos stats com prioridade > 0 vira o mínimo"
        onClick=${applyAll}><${Glyph} name="arrow-left-all" size=${13} /></button>` : ''}</span>
      <span className="c">Mín</span><span className="c">Máx</span><span className="r">Recom.</span>
    </div>
    <div className="op-body">
      ${statInfo.GAME.map((e) => {
        const r = src ? src.stats[e.k] || {} : {};
        const can = src && R.rowValues(src, e.k) != null;
        return html`<div key=${e.k} className="op-row op-rrow">
          <span className="c">${can ? html`<button type="button" className="op-apply" title=${`${e.label}: mín ${f(e, r.lo)} · máx ${f(e, r.hi)}`}
            onClick=${() => apply(e.k)}><${Glyph} name="arrow-left" size=${13} /></button>` : ''}</span>
          <span className="c tnum sub">${f(e, r.lo)}</span>
          <span className="c tnum sub">${f(e, r.hi)}</span>
          <b className=${'r tnum' + (r.rec ? '' : ' muted')}>${f(e, r.rec)}</b>
        </div>`;
      })}
    </div>
  <//>`;
}

function OptimizerTab({ hero }) {
  const app = useApp();
  const acc = app.accountHero(hero.name);

  if (!acc) return offAccount();
  return html`<${OptimizerBoxes} key=${hero.name} hero=${hero} acc=${acc} />`;
}

/* dono do perfil: a caixa da esquerda edita, a da direita aplica recomendações nele */
function OptimizerBoxes({ hero, acc }) {
  const app = useApp();
  const [profile, setRaw, flush] = useAutoSave(OP.fromRequest(acc.optimizationRequest), (p) => app.saveOptimizer(hero.name, p), acc.optimizationRequest);
  const { request, dialog } = useTwinAsk();
  // toda mudança passa por aqui: se o herói é gêmeo e a mudança o tira da semelhança, pergunta antes (sempre)
  const change = (next) => {
    const own = app.profileOf(hero.name) || {};
    const t = twinOf(archetypes.list(), profile, own.archetypeId, own, app.rel);
    if (t && !isTwin(t, next, own, app.rel)) request(t.name, () => setRaw(next));
    else setRaw(next);
  };
  // vals = { k: { min?, max? } } — só o que veio muda
  const applyVals = (vals) => {
    let p = profile;
    Object.keys(vals).forEach((k) => { p = withStat(p, k, vals[k]); });
    change(p);
  };
  return html`<section className="op">
    <${CharacterBox} hero=${hero} profile=${profile} change=${change} setRaw=${setRaw} flush=${flush} request=${request} />
    <${CommunityBox} hero=${hero} onApply=${applyVals}
      priorities=${Object.fromEntries(R.KEYS.map((k) => [k, profile.stats[k].priority]))} />
    ${dialog}
  </section>`;
}

module.exports = { OptimizerTab, isTwin, twinOf, useTwinAsk, ruleHandlers };
