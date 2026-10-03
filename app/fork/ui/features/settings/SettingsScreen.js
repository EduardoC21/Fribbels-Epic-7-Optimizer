/*
 * SettingsScreen — tela Configurações (engrenagem dentada na barra do topo). Só o que é GLOBAL (vale para o app
 * todo) e as ações de manutenção; o que é de uma tela (filtro, modo de visualização, Máx. de Equipamentos) fica nela.
 *
 *   PADRÕES     Régua · Pedra                 (relevance.interestMin / profileGemMode; a Cobertura só simula)
 *   COMUNIDADE  RTA · Builds · Validade        (herói nunca baixado; dias até o Baixar pedir de novo)
 *   JOGO        Sincronizar no login           (GameLink)
 *   VERSÕES     Backend · App · Heróis
 *   PASTA       a pasta dos saves · Abrir · Trocar… (copia + confere, aponta o settings.ini, reinicia o app)
 *
 * Sem frase solta: a explicação de cada linha está no `title`. Lista vazia = em branco.
 */
'use strict';
const { html, useState } = require('../../h.js');
const { Box, Button, Checkbox, Dropdown, NumberField, InterestCut, Modal, Glyph } = require('../../components/index.js');
const { useApp } = require('../../state/app.js');
const interest = require('../../../lib/interest.js');
const itemRatings = require('../../../lib/itemRatings.js');
const officialStats = require('../../../lib/officialStats.js');
const communityBuilds = require('../../../lib/communityBuilds.js');
const rtaTiers = require('../../../lib/rtaTiers.js');
const { GEM_OPTS } = require('../coverage/coverageText.js');
const fmt = require('../../format.js');

const TIER_OPTS = officialStats.TIERS.map((t) => ({ value: t.code, label: t.label }));
const COUNT_OPTS = communityBuilds.COUNT_OPTIONS.map((n) => ({ value: n, label: fmt.int(n) }));
const DEFAULT_DAYS = communityBuilds.CACHE_TTL_MS / 864e5;
const tierLabel = (c) => (officialStats.TIERS.find((t) => t.code === c) || {}).label || c;

function remote() { return require('@electron/remote'); }   // eslint-disable-line global-require

function Row({ label, title, children }) {
  return html`<div className="cfg-row" title=${title}>
    <span className="cfg-lab">${label}</span>
    <span className="cfg-ctl">${children}</span>
  </div>`;
}

function Section({ title, children, className }) {
  return html`<${Box} className=${'cfg-box' + (className ? ' ' + className : '')}>
    <div className="eqd-head"><span className="label">${title}</span></div>
    <div className="cfg-rows">${children}</div>
  <//>`;
}

/* confirmação da troca de pasta: de/para e o que vai junto (ou "usa o save de lá") */
function SwitchDialog({ from, to, plan, onConfirm, onClose }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const go = async () => {
    setBusy(true); setErr(null);
    try { await onConfirm(); } catch (e) { setErr(e.message); setBusy(false); }
  };
  return html`<${Modal} title="Trocar a pasta dos saves?" onClose=${busy ? undefined : onClose} width="520px">
    <div className="bd">
      <dl className="cfg-dl">
        <dt>De</dt><dd title=${from}>${from}</dd>
        <dt>Para</dt><dd title=${to}>${to}</dd>
        <dt>${plan.mode === 'use' ? 'Save' : 'Leva'}</dt>
        <dd className="cfg-wrap">${plan.mode === 'use' ? 'o que já está na pasta nova' : plan.entries.join(' · ')}</dd>
      </dl>
      ${err ? html`<p className="bd-text cfg-err" role="alert">${err}</p>` : ''}
      <div className="bd-foot">
        <${Button} onClick=${onClose} disabled=${busy}>Cancelar<//>
        <${Button} variant="accent" disabled=${busy} onClick=${go}>${busy ? 'Copiando…' : 'Trocar e reiniciar'}<//>
      </div>
    </div>
  <//>`;
}

function SettingsScreen() {
  const app = useApp();
  const rel = app.rel;
  const [ask, setAsk] = useState(null);   // { to, plan }

  const pickFolder = () => {
    const r = remote();
    const got = r.dialog.showOpenDialogSync(r.getCurrentWindow(), {
      title: 'Pasta dos saves', defaultPath: app.savesDir, properties: ['openDirectory', 'createDirectory'],
    });
    if (!got || !got[0]) return;
    const plan = app.planSavesFolder(got[0]);
    if (plan.mode !== 'same') setAsk({ to: got[0], plan });
  };
  const doSwitch = async () => {
    await app.switchSavesFolder(ask.to);
    const r = remote();
    r.app.relaunch();
    r.app.exit(0);
  };
  const openFolder = () => require('electron').shell.openPath(app.savesDir);   // eslint-disable-line global-require

  let appVersion = '';
  try { appVersion = remote().app.getVersion(); } catch (e) { /* fora do electron (sonda) */ }

  return html`<div className="cfg">
    <div className="cfg-col">
      <${Section} title="Padrões">
        <${Row} label="Régua" title="Régua padrão dos perfis: herói e arquétipo sem régua própria usam esta">
          <${InterestCut} label="Régua padrão" value=${rel.interestMin} inherited=${interest.DEFAULT_MIN}
            onChange=${app.setGlobalInterest} />
        <//>
        <${Row} label="Pedra" title=${'Pedra padrão dos perfis: herói e arquétipo sem pedra própria usam esta · '
          + (itemRatings.GEM_MODE_TIP[app.profileGemMode] || '')}>
          <span className=${'eq-dd eq-gem' + (rel.profileGemMode == null ? ' inherited' : '')}>
            <${Dropdown} label="Pedra padrão dos perfis" options=${GEM_OPTS} value=${rel.profileGemMode || null} clearable=${true}
              placeholder=${itemRatings.GEM_MODE_LABEL[interest.DEFAULT_PROFILE_GEM]} onChange=${app.setProfileGemMode} /></span>
        <//>
      <//>

      <${Section} title="Comunidade">
        <${Row} label="RTA" title="Herói nunca baixado: RTA deste tier pra cima">
          <${Dropdown} label="Tier padrão do RTA" options=${TIER_OPTS} value=${rel.communityTier || null} clearable=${true}
            placeholder=${tierLabel(rtaTiers.DEFAULT_TIER)} onChange=${(v) => app.setSetting('communityTier', v)} />
        <//>
        <${Row} label="Builds" title="Herói nunca baixado: quantas builds de maior gear score">
          <${Dropdown} label="Quantidade padrão de builds" options=${COUNT_OPTS} value=${rel.communityCount || null} clearable=${true}
            placeholder=${fmt.int(rtaTiers.DEFAULT_COUNT)} onChange=${(v) => app.setSetting('communityCount', v)} />
        <//>
        <${Row} label="Validade" title="Baixado há mais dias que isto: o botão Baixar ganha um ponto amarelo">
          <${NumberField} className="eq-int-num sm" label="Validade em dias" value=${rel.communityDays == null ? null : rel.communityDays}
            placeholder=${String(DEFAULT_DAYS)} min=${1} max=${365} onChange=${(v) => app.setSetting('communityDays', v)} />
          <span className="cfg-unit">dias</span>
        <//>
      <//>

      <${Section} title="Jogo">
        <${Row} label="Sincronizar no login" title="Com a escuta ligada, um login no jogo sincroniza a conta sozinho">
          <${Checkbox} label="Sincronizar no login" checked=${app.autoSync}
            onChange=${(on) => app.setSetting('autoSync', on ? null : false)} />
        <//>
      <//>

      <${Section} title="Versões" className="cfg-ver">
        <${Row} label="Backend" title="Versão do fork no backend Java (ForkHandler.VERSION)">
          <span className="tnum">${app.forkVersion ? 'v' + app.forkVersion : ''}</span>
        <//>
        <${Row} label="App"><span className="tnum">${appVersion}</span><//>
        <${Row} label="Heróis" title="Heróis na base do jogo (sobe a cada patch puxado do upstream)">
          <span className="tnum">${app.heroes.length || ''}</span>
        <//>
      <//>
    </div>

    <div className="cfg-col">
      <${Section} title="Pasta dos saves">
        <div className="cfg-path-row">
          <${Glyph} name="folder" size=${15} />
          <span className="cfg-path" title=${app.savesDir}>${app.savesDir}</span>
        </div>
        <div className="cfg-acts">
          <${Button} onClick=${openFolder} title="Abrir no Explorer">Abrir<//>
          <${Button} onClick=${pickFolder} title="Copia os saves para outra pasta, confere e reinicia o app">Trocar…<//>
        </div>
      <//>
    </div>

    ${ask ? html`<${SwitchDialog} from=${app.savesDir} to=${ask.to} plan=${ask.plan} onConfirm=${doSwitch}
      onClose=${() => setAsk(null)} />` : ''}
  </div>`;
}

module.exports = { SettingsScreen, SwitchDialog };
