/*
 * GameLink — liga/desliga a ESCUTA do jogo (data/fork/escuta.py, roda como admin → UAC) e sincroniza a conta.
 *
 *   [● Ouvindo o jogo · login 02/10/2026 14:32]  [!]  [Sincronizar]  [Parar]        (desligada: [Ouvir o jogo])
 *
 * [!] = RELATÓRIO (sem texto solto na barra — Eduardo, 2026-10-01): o que a sincronização e os eventos ao vivo
 * fizeram e os avisos; aviso pode ser ignorado PARA SEMPRE (chave estável, guardada no localStorage). O botão só
 * aparece com algo no relatório; em amarelo com aviso ativo, vermelho com erro.
 *
 * A escuta escreve em Documents/FribbelsOptimizerSaves/escuta/ (lib/gameSync.js); aqui só lemos:
 *   estado.json  batimento a cada 2 s (sem batimento há > 6 s = desligada)
 *   eventos.jsonl  login novo → sincroniza SOZINHO (o Eduardo quer a base sempre igual ao jogo; desliga em Configurações)
 * Parar = criar o arquivo `parar` (o app não é admin; não pode matar o processo).
 * Eventos ao vivo (up, vender, extrair, equipar, tirar) → lib/gameLive.js; peça upada entra numa vaga do lote.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { html, useState, useEffect, useRef } = require('../../h.js');
const { Button, Glyph } = require('../../components/index.js');
const { useApp } = require('../../state/app.js');
const gameSync = require('../../../lib/gameSync.js');
const gameLive = require('../../../lib/gameLive.js');
const B = require('../gear/batchState.js');

const LIVE = new Set(['up', 'removidas', 'equipou', 'tirou', 'novas']);
const paths = require('../../../lib/forkPaths.js');

const hhmm = (t) => (t ? new Date(t * 1000).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '');
/* "02/10/2026 18:47": data completa junto da hora do último login (Eduardo, 2026-10-02) */
const dateTime = (t) => (t ? `${new Date(t * 1000).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })} ${hhmm(t)}` : '');

function readJson(f) { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return null; } }

/*
 * O `python` daqui é atalho da Microsoft Store (WindowsApps): o Windows não pede administrador para ele direto
 * (Start-Process -Verb RunAs falhava calado). Pede para o cmd.exe, que chama o python — mesmo caminho do capturar-up.cmd.
 * Devolve uma Promise: resolve quando o Windows respondeu; rejeita com o motivo (recusou, erro).
 */
function startListener() {
  const script = path.join(paths.dataDir(), 'fork', 'escuta.py');
  const q = (x) => x.replace(/'/g, "''");
  const ps = `try { Start-Process -FilePath cmd.exe -ArgumentList '/c python "${q(script)}"' -Verb RunAs -WindowStyle Hidden -ErrorAction Stop } catch { Write-Error $_.Exception.Message; exit 1 }`;
  return new Promise((resolve, reject) => {
    const p = spawn('powershell', ['-NoProfile', '-Command', ps], { windowsHide: true });
    let err = '';
    p.stderr.on('data', (d) => { err += d; });
    p.on('error', reject);
    p.on('close', (code) => {
      if (!code) return resolve();
      reject(new Error(/cancel/i.test(err) ? 'Permissão de administrador recusada.' : (err.trim().split(/\r?\n/)[0] || 'falhou ao abrir')));
    });
  });
}

/* relatório: { key, kind: 'info' | 'warn' | 'bad', text, at }; aviso com a mesma chave substitui o anterior */
const IGN = 'fork.gameLink.ignored';
const readIgnored = () => { try { return new Set(JSON.parse(localStorage.getItem(IGN) || '[]')); } catch (e) { return new Set(); } };
const writeIgnored = (s) => { try { localStorage.setItem(IGN, JSON.stringify([...s])); } catch (e) { /* sem storage: só nesta sessão */ } };

function syncEntries(r) {
  const parts = [`${r.pecas} peças`, `${r.herois} heróis`];
  if (r.novas) parts.push(`${r.novas} novas`);
  if (r.removidas) parts.push(`${r.removidas} saíram`);
  if (r.bonus) parts.push(`${r.bonus} com imprint/EE/artefato atualizados`);
  const out = [{ key: 'sync', kind: 'info', text: 'Sincronizado: ' + parts.join(' · ') }];
  if (r.builds.length) out.push({ key: 'sync-builds', kind: 'info', text: 'Builds antigas guardadas: ' + r.builds.join(', ') });
  if (r.semNivel) out.push({ key: `semNivel:${r.semNivel}`, kind: 'warn', text: `${r.semNivel} peça(s) sem nível conhecido (filtro Nível 0)` });
  r.artefatoPresumido.forEach((a) => out.push({ key: `art:${a}`, kind: 'warn', text: `Nível de artefato presumido — ${a}` }));
  r.heroisDesconhecidos.forEach((c) => out.push({ key: `hero:${c}`, kind: 'warn', text: `Herói ${c} ainda não existe no app (atualizar do upstream)` }));
  return out;
}

function Report({ log, ignored, onIgnore, onClose }) {
  const ref = useRef(null);
  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.parentNode.contains(e.target)) onClose(); };
    const k = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', h); document.addEventListener('keydown', k);
    return () => { document.removeEventListener('mousedown', h); document.removeEventListener('keydown', k); };
  }, []);
  const shown = log.filter((x) => !ignored.has(x.key));
  return html`<div className="ui-pop gl-pop" ref=${ref} role="dialog" aria-label="Relatório da escuta do jogo">
    ${shown.length ? shown.map((x) => html`<div key=${x.key} className=${'gl-row ' + x.kind}>
      <span className="gl-at tnum">${hhmm(x.at)}</span>
      <span className="gl-txt">${x.text}</span>
      ${x.kind !== 'info' ? html`<button type="button" className="gl-ign" onClick=${() => onIgnore(x.key)}>Ignorar</button>` : ''}
    </div>`) : ''}
  </div>`;
}

function GameLink() {
  const app = useApp();
  const dir = gameSync.escutaDir();
  const [st, setSt] = useState({ on: false, login: null, waiting: false });
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState([]);     // relatório (mais novo em cima)
  const [ignored, setIgnored] = useState(readIgnored);
  const [open, setOpen] = useState(false);
  const seen = useRef(null);              // tamanho do eventos.jsonl já lido
  const report = (entries) => {
    const at = Date.now() / 1000;
    setLog((l) => {
      const keys = new Set(entries.map((x) => x.key));
      return entries.map((x) => ({ ...x, at })).concat(l.filter((x) => !keys.has(x.key))).slice(0, 40);
    });
  };
  const ignore = (key) => setIgnored((s) => { const n = new Set(s); n.add(key); writeIgnored(n); return n; });

  const doSync = () => {
    if (busy) return;
    setBusy(true);
    app.runItemJob(() => gameSync.sync())
      .then((r) => report(syncEntries(r)), (e) => report([{ key: 'sync-erro', kind: 'bad', text: 'Não sincronizou: ' + e.message }]))
      .finally(() => setBusy(false));
  };
  const syncRef = useRef(doSync);
  syncRef.current = doSync;
  const autoRef = useRef(app.autoSync);   // tela Configurações: "Sincronizar no login"
  autoRef.current = app.autoSync;

  // up / vender / extrair / equipar / tirar: grava na hora; peça upada entra numa vaga do lote (ordem da grade do jogo)
  const doLive = (evs) => {
    app.runItemJob((api) => gameLive.apply(evs, api, dir, app.heroesById))
      .then((r) => {
        if (r.upIds.length) app.setGearBatch((s) => B.place(B.clearSaved(s, r.upIds), r.upIds));
        if (r.changedIds.length) app.setGearBatch((s) => B.clearSaved(s, r.changedIds));
        const parts = [];
        if (r.novas) parts.push(`${r.novas} peça(s) nova(s)`);
        if (r.ups) parts.push(`${r.ups} up${r.ups > 1 ? 's' : ''}`);
        if (r.changed) parts.push(`${r.changed} peça(s) alterada(s)`);
        if (r.removed) parts.push(`${r.removed} peça(s) saíram`);
        if (r.equips) parts.push(`${r.equips} troca(s) de peça`);
        const out = parts.length ? [{ key: 'live:' + Date.now(), kind: 'info', text: 'Ao vivo: ' + parts.join(' · ') }] : [];
        if (r.unknown) out.push({ key: 'live-unknown:' + Date.now(), kind: 'warn', text: `${r.unknown} up(s) de peça que a escuta não viu chegar (ganha com a escuta desligada) — reabra o jogo para sincronizar` });
        if (out.length) report(out);
      }, (e) => report([{ key: 'live-erro:' + Date.now(), kind: 'bad', text: 'Evento do jogo não aplicado: ' + e.message }]));
  };
  const liveRef = useRef(doLive);
  liveRef.current = doLive;

  useEffect(() => {
    const tick = () => {
      const e = readJson(path.join(dir, 'estado.json'));
      const on = !!(e && !e.fim && Date.now() / 1000 - e.agora < 6);
      const inv = path.join(dir, 'inventario.json');
      const login = fs.existsSync(inv) ? fs.statSync(inv).mtimeMs / 1000 : null;
      setSt((s) => ({ on, login, waiting: s.waiting && !on }));
      // eventos novos desde a última leitura (a 1ª leitura só marca onde está)
      const f = path.join(dir, 'eventos.jsonl');
      const size = fs.existsSync(f) ? fs.statSync(f).size : 0;
      if (seen.current == null || size < seen.current) { seen.current = size; return; }
      if (size === seen.current) return;
      const fd = fs.openSync(f, 'r');
      const buf = Buffer.alloc(size - seen.current);
      fs.readSync(fd, buf, 0, buf.length, seen.current); fs.closeSync(fd);
      const end = buf.lastIndexOf(10);   // só linhas completas (a escuta pode estar no meio de uma escrita)
      if (end < 0) return;
      seen.current += end + 1;
      const evs = buf.slice(0, end).toString('utf8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch (x) { return null; } }).filter(Boolean);
      const aviso = evs.find((x) => x.tipo === 'aviso');
      if (aviso) report([{ key: 'aviso:' + aviso.texto, kind: 'bad', text: 'Escuta: ' + aviso.texto }]);
      if (autoRef.current && evs.some((x) => x.tipo === 'login')) syncRef.current();
      const live = evs.filter((x) => LIVE.has(x.tipo));
      if (live.length) liveRef.current(live);
    };
    tick();
    const t = setInterval(tick, 2000);
    return () => clearInterval(t);
  }, []);

  const start = () => {
    setSt((s) => ({ ...s, waiting: true }));
    startListener().catch((e) => { setSt((s) => ({ ...s, waiting: false })); report([{ key: 'start-erro', kind: 'bad', text: 'Não abriu a escuta: ' + e.message }]); });
    // aceitou o Windows mas a escuta não deu sinal em 20 s: mostra o erro que ela deixou (escuta/erro.log)
    setTimeout(() => setSt((s) => {
      if (s.on || !s.waiting) return s;
      let why = 'A escuta não respondeu.';
      try { why = fs.readFileSync(path.join(dir, 'erro.log'), 'utf8').trim().split(/\r?\n/).slice(-1)[0] || why; } catch (e) { /* */ }
      report([{ key: 'start-erro', kind: 'bad', text: 'Escuta não ligou: ' + why }]);
      return { ...s, waiting: false };
    }), 20000);
  };
  const stop = () => { try { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, 'parar'), ''); } catch (e) { /* */ } };

  const label = st.on ? 'Ouvindo o jogo' : st.waiting ? 'Abrindo a escuta… (confirme no Windows)' : 'Jogo desligado';
  const active = log.filter((x) => x.kind !== 'info' && !ignored.has(x.key));
  const bad = active.some((x) => x.kind === 'bad');
  return html`<span className="game-link">
    <span className=${'shell-status' + (st.on ? ' ok' : '')} role="status"
      title=${st.on ? (app.autoSync ? 'Login no jogo sincroniza sozinho. Nada sai do PC.' : 'Login no jogo não sincroniza sozinho. Nada sai do PC.')
        : 'A escuta lê o tráfego do jogo neste PC (nada sai daqui). Ligar pede permissão de administrador.'}>
      <span className=${'gl-dot' + (st.on ? ' on' : '')} aria-hidden="true"></span>${label}${st.login ? ` · login ${dateTime(st.login)}` : ''}
    </span>
    ${active.length || log.length ? html`<span className="gl-rep-wrap">
      <button type="button" className=${'gl-rep' + (bad ? ' bad' : active.length ? ' warn' : '')} aria-expanded=${open}
        aria-label=${`Relatório da escuta${active.length ? `: ${active.length} aviso(s)` : ''}`}
        title=${active.length ? `${active.length} aviso(s)` : 'Relatório'} onClick=${() => setOpen((o) => !o)}>
        <${Glyph} name="alert" size=${15} />${active.length ? html`<span className="gl-n tnum">${active.length}</span>` : ''}
      </button>
      ${open ? html`<${Report} log=${log} ignored=${ignored} onIgnore=${ignore} onClose=${() => setOpen(false)} />` : ''}
    </span>` : ''}
    ${st.login ? html`<${Button} disabled=${busy} onClick=${doSync}
      title="Aplica o último login. Build trocada vira build salva com a data.">
      ${busy ? 'Sincronizando…' : 'Sincronizar'}<//>` : ''}
    ${st.on ? html`<${Button} onClick=${stop}>Parar<//>` : html`<${Button} disabled=${st.waiting} onClick=${start}>Ouvir o jogo<//>`}
  </span>`;
}

module.exports = { GameLink };
