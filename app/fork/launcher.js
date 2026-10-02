/*
 * launcher.js — injeta um botão flutuante no app clássico que abre a janela nova
 * (parte do fork). Evita editar app.html: o botão é criado via DOM.
 * Registrado por 1 linha em app/js/lib/inputHandler.js.
 */
'use strict';
const path = require('path');

let win = null;

function openWindow() {
  // eslint-disable-next-line global-require
  const remote = require('@electron/remote');
  const { BrowserWindow } = remote;
  if (win && !win.isDestroyed()) { win.focus(); return; }
  win = new BrowserWindow({
    width: 1200, height: 820,
    // piso do layout: barra lateral 340 + respiro 36 + topo em 3 colunas
    // (148+200+240+vãos) ≈ 990px. Em DIP: um notebook 1366×768 com escala de 125%
    // tem ~1093×580 úteis — o piso precisa caber nele (a janela abre maximizada).
    // A altura rola por dentro (.hero-main), então o piso vertical é baixo.
    minWidth: 1000, minHeight: 560,
    show: false,
    title: 'Comunidade — E7 (fork)',
    backgroundColor: '#1a1917',   // = --bg (tokens.css): sem flash de outra cor ao abrir
    webPreferences: { nodeIntegration: true, contextIsolation: false, devTools: false },
  });
  try {
    // permite que a janela nova use @electron/remote (getPath('documents') etc.)
    remote.require('@electron/remote/main').enable(win.webContents);
  } catch (e) {
    console.warn('Fork: enable remote na janela nova falhou (usando fallback):', e);
  }
  win.setMenuBarVisibility(false);
  // garante que o DevTools não abra sozinho (o app clássico abre em modo dev)
  win.webContents.on('devtools-opened', () => { try { win.webContents.closeDevTools(); } catch (e) {} });
  win.once('ready-to-show', () => { win.maximize(); win.show(); });
  win.loadFile(path.join(__dirname, 'index.html'));
  win.on('closed', () => { win = null; });
}

module.exports = {
  initialize() {
    if (typeof document === 'undefined') return;
    if (document.getElementById('forkLauncherBtn')) return;
    const btn = document.createElement('button');
    btn.id = 'forkLauncherBtn';
    btn.textContent = '🔧 Comunidade';
    Object.assign(btn.style, {
      position: 'fixed', right: '14px', bottom: '14px', zIndex: 99999,
      background: '#f84c48', color: '#fff', border: 'none', borderRadius: '8px',
      padding: '8px 14px', cursor: 'pointer', fontSize: '13px',
      boxShadow: '0 2px 8px rgba(0,0,0,.4)',
    });
    btn.addEventListener('click', openWindow);
    document.body.appendChild(btn);
  },
  openWindow,
};
