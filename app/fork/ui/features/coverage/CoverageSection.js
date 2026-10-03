/*
 * CoverageSection — a Cobertura de UM perfil (bloco do editor de arquétipo e aba Cobertura do herói):
 *
 *   COBERTURA  [Atendidos k/N — `showAtt`]  [gêmeo de X]                    [`rule`: Régua ≥ [rank][%] [Pedra]]
 *   [ uma linha por peça × set aceito + linhas de set | detalhe: números + funil ]
 *
 * Mesma conta e mesmos componentes da tela central (CoverageTable em modo `dispute`, CoverageDetail compacto: "Quem
 * pede" e "Perto da régua" seriam sempre o próprio perfil), com os perfis do app (régua/pedra APLICADAS). `profileId` =
 * 'a:<id>' | 'h:<nome>'; herói gêmeo → o perfil do arquétipo (`self` = 1: os outros gêmeos contam como disputa).
 * `rule` (aba do herói) = { value, inherited, onCut, gem, gemInherited, onGem }: régua e pedra EDITÁVEIS, as mesmas do
 * Otimizador do herói (gêmeo: outro valor pergunta e vira variante — OptimizerTab.ruleHandlers). Sem linhas: caixas em branco.
 */
'use strict';
const { html, useState, useMemo, useCallback } = require('../../h.js');
const { ArchetypeSymbol, Delta, Dropdown, InterestCut } = require('../../components/index.js');
const { useApp } = require('../../state/app.js');
const { CoverageTable } = require('./CoverageTable.js');
const { CoverageDetail } = require('./CoverageDetail.js');
const C = require('../../../lib/coverage.js');
const itemRatings = require('../../../lib/itemRatings.js');
const { GEM_OPTS } = require('./coverageText.js');

const ATT_TIP = 'Pela ordem dos heróis, cada um pega 1 peça válida por slot (a menos disputada); atendido = pegou nos 6';
const bySlot = (a, b) => C.SLOTS.indexOf(a.slot) - C.SLOTS.indexOf(b.slot) || (a.set || '').localeCompare(b.set || '');

function CoverageSection({ profileId, self, className, showAtt, rule }) {
  const app = useApp();
  const [sel, setSel] = useState(null);
  const items = useMemo(() => Object.values(app.account.itemsById || {}), [app.account.itemsById]);
  const ctx = useMemo(() => C.analyze(items, app.ratingProfiles), [items, app.ratingProfiles, app.ratingsVer]);
  const me = ctx.P.find((x) => x.p.id === profileId) || null;
  const rows = useMemo(() => (me ? C.rows(ctx, 'full', { profileId }).sort(bySlot).concat(C.rows(ctx, 'set', { profileId })) : []), [ctx, profileId, me]);
  const dispute = useMemo(() => (me ? C.contention(ctx, profileId, self == null ? me.w : self) : null), [ctx, profileId, self, me]);
  const at = useMemo(() => (me ? C.allocate(ctx, app.ranked).byProfile[profileId] || null : null), [ctx, app.ranked, profileId, me]);
  const codeOf = useCallback((name) => (name && app.byName[name] ? app.byName[name].code : null), [app.byName]);
  const pick = useCallback((r) => setSel(r.key), []);
  const row = rows.find((r) => r.key === sel) || rows[0] || null;
  const p = me && me.p;
  return html`<section className=${'cvs' + (className ? ' ' + className : '')} aria-label="Cobertura">
    <div className="cvs-head">
      <span className="label">Cobertura</span>
      ${showAtt && at && at.total ? html`<span className="cvs-att" title=${ATT_TIP}><span className="cvs-att-l">Atendidos</span>
        <${Delta} v=${at.served}><b className="tnum">${at.served}</b><//><span className="cvs-att-of tnum">de ${at.total}</span></span>` : ''}
      ${p && self != null && p.kind === 'a' ? html`<span className="cvs-via" title=${`Gêmeo de ${p.name}`}><${ArchetypeSymbol} symbol=${p.symbol} size=${18} />${p.name}</span>` : ''}
      <span className="spacer"></span>
      ${rule ? html`<span className="contents">
        <span className="eq-int" title="Régua do herói. Vazio = a do arquétipo ou a padrão">
          <${InterestCut} lead="Régua ≥" label="Régua deste herói" value=${rule.value} inherited=${rule.inherited}
            onChange=${rule.onCut} /></span>
        <span className="eq-dd eq-gem" title=${rule.gem ? itemRatings.GEM_MODE_TIP[rule.gem] : 'Pedra herdada'}>
          <${Dropdown} label="Pedra deste herói" options=${GEM_OPTS} value=${rule.gem} clearable=${true}
            placeholder=${itemRatings.GEM_MODE_LABEL[rule.gemInherited]} onChange=${rule.onGem} /></span>
      </span>` : ''}
    </div>
    <div className="eq-main cv-main cvs-main">
      <div className="eq-list"><${CoverageTable} rows=${rows} pickedKey=${row ? row.key : null} onPick=${pick} codeOf=${codeOf}
        dispute=${dispute || {}} empty=${me ? 'Nenhuma linha' : 'Sem prioridade no Otimizador'} /></div>
      <${CoverageDetail} key=${'cvd:' + (row ? row.key : '-')} ctx=${ctx} row=${row} codeOf=${codeOf} />
    </div>
  </section>`;
}

module.exports = { CoverageSection };
