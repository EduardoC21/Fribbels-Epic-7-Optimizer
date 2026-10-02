/*
 * GearFilters — a barra de filtros da tela Equipamentos, EM CIMA da lista
 * (quebra em mais linhas quando a janela estreita):
 *
 *   linha 1: PEÇA (6 ícones) · SET (ícones)                     ··· N de M peças · Limpar filtros · Up em lote →
 *   linha 2: Principal · Substatus · Raridade · Nível · Aprimoramento · Dono · 🔒 🔓 ◆ ··· Para · Régua ≥ · Máx. heróis · Pedra
 * (painel com borda; ferramenta fica sempre à DIREITA, mesmo quando a linha quebra; todo controle da linha 2
 * tem 30px, a altura do dropdown). Cada dropdown tem o × que limpa só ele; Dono e Para têm busca.
 * `interest` (opcional) = { value, onChange, limit, onLimit, gemMode, onGemMode, targets, codeOf }: o filtro
 * "Para" (UM arquétipo ou UM herói: a lista mostra só as peças que interessam a ele, com o rank e o
 * potencial dele), o corte GLOBAL de interesse, o máximo de heróis e o modo da PEDRA simulada no potencial por
 * perfil (Sem troca · Sem perda · Com perda · Perda permanente — regra no Java, ForkItemRatings.gemMode).
 *
 * Ícone = liga/desliga (vários ao mesmo tempo = qualquer um). Os dropdowns mostram
 * o próprio nome enquanto vazios. Substatus: a peça precisa ter TODOS os marcados.
 * `slotLocked` (diálogo do espaço vazio): o tipo de peça é fixo e some da barra.
 */
'use strict';
const { html } = require('../../h.js');
const { Glyph, GameGlyph, GearIcon, SetIcon, StatIcon, Dropdown, Button, ArchetypeSymbol, Portrait, InterestCut, NumberField } = require('../../components/index.js');
const itemStats = require('../../../lib/itemStats.js');
const itemRatings = require('../../../lib/itemRatings.js');
const { SLOT_PT } = require('../top/GearCard.js');
const G = require('./gearList.js');

const toggleIn = (arr, v) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

function Tog({ on, title, onClick, children }) {
  return html`<button type="button" className=${'hf-tog eq-tog' + (on ? ' on' : '')}
    title=${title} aria-label=${title} aria-pressed=${!!on} onClick=${onClick}>${children}</button>`;
}

const statOpt = (t) => ({ value: t, label: `${G.NAME[t]}`, icon: html`<${StatIcon} stat=${itemStats.info(t).icon} size=${13} />` });
/* modo da pedra simulada (o dono da peça vê a troca no editor) */
const GEM_OPTS = itemRatings.GEM_MODES.map((m) => ({ value: m, label: itemRatings.GEM_MODE_LABEL[m], icon: html`<${GameGlyph} name="modify" size=${13} />` }));
const GEM_TIP = itemRatings.GEM_MODE_TIP;
const ENH_OPTS = G.ENH_BUCKETS.map((b) => ({ value: b, label: b === 15 ? '+15' : `+${b} a +${b + 2}` }));

/* "Para": arquétipos primeiro (símbolo), depois heróis (retrato); herói gêmeo de arquétipo diz de quem */
const targetOpts = (targets, codeOf) => (targets || []).map((t) => ({
  value: t.key,
  label: t.via ? `${t.name} · ${t.via.name}` : t.name,
  icon: t.kind === 'a' ? html`<${ArchetypeSymbol} symbol=${t.symbol} size=${16} />` : html`<${Portrait} code=${codeOf ? codeOf(t.name) : null} size=${16} />`,
}));

function GearFilters({ filters, onChange, opts, total, shown, slotLocked, interest, batch }) {
  const set = (patch) => onChange({ ...filters, ...patch });
  const f = filters;
  const ownerOpts = [{ value: '__eq', label: 'Equipadas' }, { value: '__free', label: 'Soltas (sem herói)' }]
    .concat(opts.heroes.map((h) => ({ value: h.id, label: h.name })));

  // `batch` (opcional) = { count, pending, onOpen }: botão do up em lote, sempre à vista
  return html`<div className="eq-bar" role="search" aria-label="Filtros de peças">
    <div className="eq-row">
      ${slotLocked ? '' : html`<span className="eq-group" role="group" aria-label="Tipo de peça">
        <span className="eq-lab" aria-hidden="true">Peça</span>
        ${G.SLOTS.map((s) => html`<${Tog} key=${s} title=${SLOT_PT[s]} on=${f.slots.includes(s)}
          onClick=${() => set({ slots: toggleIn(f.slots, s) })}><${GearIcon} slot=${s} size=${18} /><//>`)}
      </span>`}
      <span className="eq-group eq-sets" role="group" aria-label="Set">
        <span className="eq-lab" aria-hidden="true">Set</span>
        ${opts.sets.map((s) => html`<${Tog} key=${s} title=${s.replace(/Set$/, '')} on=${f.sets.includes(s)}
          onClick=${() => set({ sets: toggleIn(f.sets, s) })}><${SetIcon} set=${s} size=${17} title=${s.replace(/Set$/, '')} /><//>`)}
      </span>
      <span className="eq-tools">
        <span className="eq-count sub tnum" aria-live="polite">${shown === total ? `${total} peças` : `${shown} de ${total} peças`}</span>
        <${Button} variant="ghost" className="eq-clear" disabled=${G.isEmpty(f)} onClick=${() => onChange(G.EMPTY_FILTERS)}>
          <${Glyph} name="close" size=${11} /> Limpar filtros<//>
        ${batch ? html`<${Button} className="eq-batch" onClick=${batch.onOpen}
          title=${batch.count ? `${batch.count} de 16 no lote${batch.pending ? ` · ${batch.pending} com up não gravado` : ''}` : 'Peças upadas no jogo entram com a escuta ligada'}>
          Up em lote${batch.count ? html`<span className=${'eq-batch-n tnum' + (batch.pending ? ' warn' : '')}>${batch.count}</span>` : ''}
          <${Glyph} name="arrow-right" size=${12} /><//>` : ''}
      </span>
    </div>

    <div className="eq-row">
      <span className="eq-group eq-dds">
        <span className="eq-dd"><${Dropdown} multiple=${true} label="Principal" placeholder="Principal"
          options=${opts.mains.map(statOpt)} value=${f.mains} onChange=${(v) => set({ mains: v })} /></span>
        <span className="eq-dd" title="Tem todos os marcados"><${Dropdown} multiple=${true} label="Substatus" placeholder="Substatus"
          options=${G.SUB_TYPES.map(statOpt)} value=${f.subs} onChange=${(v) => set({ subs: v })} /></span>
        <span className="eq-dd"><${Dropdown} multiple=${true} label="Raridade" placeholder="Raridade"
          options=${G.RARITIES} value=${f.ranks} onChange=${(v) => set({ ranks: v })} /></span>
        <span className="eq-dd sm"><${Dropdown} multiple=${true} label="Nível" placeholder="Nível"
          options=${opts.levels.map((n) => ({ value: n, label: String(n) }))} value=${f.levels} onChange=${(v) => set({ levels: v })} /></span>
        <span className="eq-dd"><${Dropdown} multiple=${true} label="Aprimoramento" placeholder="Aprimoramento"
          options=${ENH_OPTS} value=${f.enh} onChange=${(v) => set({ enh: v })} /></span>
        <span className="eq-dd"><${Dropdown} label="Dono" placeholder="Dono" clearable=${true} search="buscar herói"
          options=${ownerOpts} value=${f.owner} onChange=${(v) => set({ owner: v === f.owner ? null : v })} /></span>
      </span>
      <span className="eq-group" role="group" aria-label="Estado">
        <${Tog} title="Só travadas" on=${f.lock === 'on'} onClick=${() => set({ lock: f.lock === 'on' ? null : 'on' })}>
          <${Glyph} name="lock" size=${13} /><//>
        <${Tog} title="Só destravadas" on=${f.lock === 'off'} onClick=${() => set({ lock: f.lock === 'off' ? null : 'off' })}>
          <${Glyph} name="unlock" size=${13} /><//>
        <${Tog} title="Só modificadas" on=${f.modified} onClick=${() => set({ modified: !f.modified })}>
          <${GameGlyph} name="modified" size=${14} /><//>
      </span>
      ${interest ? html`<span className="eq-tools eq-eval" role="group" aria-label="Interesse">
        <span className="eq-dd eq-target" title="Só peças que interessam a ele; Rank e Pot. viram os dele">
          <${Dropdown} label="Para" placeholder="Para: todos" clearable=${true} search="buscar arquétipo ou herói"
            options=${targetOpts(interest.targets, interest.codeOf)}
            value=${f.target} onChange=${(v) => set({ target: v === f.target ? null : v })} /></span>
        <span className="eq-int" title="Régua padrão">
          <${InterestCut} lead="Régua ≥" label="Régua padrão" value=${interest.value} onChange=${interest.onChange} />
        </span>
        <span className="eq-int" title="Máximo de heróis interessados (favoritos e equipáveis sempre aparecem)">
          <span className="eq-int-lab">Máx.</span>
          <${NumberField} className="eq-int-num sm" label="Máximo de heróis interessados" value=${interest.limit} min=${0} max=${99}
            onChange=${(v) => interest.onLimit(v == null ? null : v)} />
        </span>
        <span className="eq-dd eq-gem" title=${GEM_TIP[interest.gemMode] || ''}>
          <${Dropdown} label="Pedra simulada no rank para heróis e arquétipos" options=${GEM_OPTS} value=${interest.gemMode}
            onChange=${interest.onGemMode} /></span>
      </span>` : ''}
    </div>
  </div>`;
}

module.exports = { GearFilters };
