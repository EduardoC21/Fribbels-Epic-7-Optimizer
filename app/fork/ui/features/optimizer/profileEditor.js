/*
 * profileEditor — o editor de um PERFIL DO OTIMIZADOR (lib/optimizerProfile.js):
 * sets 1..3, mains de colar/anel/bota e, por stat, prioridade (−1..3) · mín · máx.
 *
 * Usado igual em dois lugares: a caixa Personagem da aba Otimizador do herói e a
 * tela de Arquétipos (um arquétipo tem o mesmo formato — lib/archetypes.js).
 *
 *   ProfileSplit({ profile, change, ghost, lead })
 *     change(next)  recebe o perfil inteiro novo
 *     ghost(k)      valor original a marcar na barra (ou null)
 *     lead          linha extra no topo da coluna de campos (ex.: o seletor de arquétipo)
 *   useAutoSave(initial, save, source)  perfil local que grava sozinho ~0,6 s depois de parar
 *                               de mexer; ao desmontar, grava o que ficou pendente. `source` (o pedido gravado):
 *                               se mudar por FORA (ex.: o arquétipo levou o gêmeo junto) e não houver edição
 *                               pendente, o perfil local passa a ser ele
 */
'use strict';
const { html, useState, useEffect, useRef } = require('../../h.js');
const { Dropdown, SetIcon, StatIcon, NumberField, PriorityBar } = require('../../components/index.js');
const statInfo = require('../../../lib/statInfo.js');
const gameData = require('../../../lib/gameData.js');
const gameRules = require('../../../lib/gameRules.js');
const itemStats = require('../../../lib/itemStats.js');
const OP = require('../../../lib/optimizerProfile.js');
const interest = require('../../../lib/interest.js');

const SAVE_MS = 600;
const SLOT_PT = { Necklace: 'Colar', Ring: 'Anel', Boots: 'Bota' };

const SET_OPTS = gameData.setNames().map((s) => ({
  value: s, label: gameData.shortName(s), icon: html`<${SetIcon} set=${s} size=${15} />`,
}));
function mainOpts(slot) {
  const bySlot = (gameRules.load() || {}).mainStatsBySlot || {};
  return (bySlot[slot] || []).map((m) => {
    const info = itemStats.info(m);
    return { value: m, label: itemStats.label(m), icon: info.icon ? html`<${StatIcon} stat=${info.icon} size=${13} />` : null };
  });
}

function useAutoSave(initial, save, source) {
  const [profile, setProfile] = useState(initial);
  const timer = useRef(null);
  const latest = useRef(initial);
  const saveRef = useRef(save);
  saveRef.current = save;
  // trocar de herói/arquétipo antes dos 0,6 s não perde a última mudança
  useEffect(() => () => { if (timer.current) { clearTimeout(timer.current); saveRef.current(latest.current); } }, []);
  const change = (next) => {
    latest.current = next;
    setProfile(next);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => { timer.current = null; saveRef.current(next); }, SAVE_MS);
  };
  useEffect(() => {
    if (timer.current || JSON.stringify(initial) === JSON.stringify(latest.current)) return;
    latest.current = initial;
    setProfile(initial);
  }, [source]);
  const flush = () => { clearTimeout(timer.current); timer.current = null; return latest.current; };
  return [profile, change, flush];
}

const withStat = (p, k, patch) => Object.assign({}, p, { stats: Object.assign({}, p.stats, { [k]: Object.assign({}, p.stats[k], patch) }) });

function ProfileSplit({ profile, change, ghost, lead }) {
  const setSet = (i, v) => { const sets = profile.sets.slice(); sets[i] = v; change(Object.assign({}, profile, { sets })); };
  const setErr = interest.setRule(profile.sets).error;   // combinação que o otimizador recusa
  const setMain = (slot, v) => change(Object.assign({}, profile, { mains: Object.assign({}, profile.mains, { [slot]: v }) }));
  return html`<div className="op-split">
    <div className="op-fields">
      ${lead || null}
      ${[0, 1, 2].map((i) => html`<div key=${'s' + i} className="op-frow">
        <span className="op-lab">Set ${i + 1}</span>
        <span className="op-grow"><${Dropdown} multiple=${true} label=${`Set ${i + 1}`} placeholder="qualquer"
          options=${SET_OPTS} value=${profile.sets[i]} onChange=${(v) => setSet(i, v)} /></span>
      </div>`)}
      ${setErr ? html`<div className="op-setwarn" role="alert">${setErr} Enquanto isso, este perfil fica fora das notas de peça.</div>` : ''}
      ${OP.MAIN_SLOTS.map((slot) => html`<div key=${slot} className="op-frow">
        <span className="op-lab">${SLOT_PT[slot]}</span>
        <span className="op-grow"><${Dropdown} multiple=${true} label=${SLOT_PT[slot]} placeholder="qualquer main"
          options=${mainOpts(slot)} value=${profile.mains[slot]} onChange=${(v) => setMain(slot, v)} /></span>
      </div>`)}
    </div>
    <div className="op-statcol">
      <div className="op-cols op-lcols"><span>Stat</span><span>Prioridade</span><span className="c">Mín</span><span className="c">Máx</span></div>
      <div className="op-body">
        ${statInfo.GAME.map((e) => {
          const s = profile.stats[e.k];
          const g = ghost ? ghost(e.k) : null;
          return html`<div key=${e.k} className="op-row op-lrow">
            <span className="op-stat"><${StatIcon} stat=${e.icon} size=${14} />${e.label}</span>
            <span className="op-prio" title=${`Prioridade ${s.priority}${g != null ? ` · arquétipo ${g}` : ''}`}>
              <${PriorityBar} label=${`Prioridade de ${e.label}`} min=${OP.PRIORITY_MIN} max=${OP.PRIORITY_MAX} value=${s.priority} ghost=${g}
                onChange=${(v) => change(withStat(profile, e.k, { priority: v }))} />
              <b className="tnum">${s.priority}</b>
            </span>
            <${NumberField} className="op-num" value=${s.min} min=${0} title=${`${e.label} mínimo`}
              onChange=${(v) => change(withStat(profile, e.k, { min: v }))} />
            <${NumberField} className="op-num" value=${s.max} min=${0} title=${`${e.label} máximo`}
              onChange=${(v) => change(withStat(profile, e.k, { max: v }))} />
          </div>`;
        })}
      </div>
    </div>
  </div>`;
}

module.exports = { ProfileSplit, useAutoSave, withStat, SLOT_PT };
