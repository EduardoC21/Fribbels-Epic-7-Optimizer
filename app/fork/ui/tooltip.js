/*
 * tooltip.js — a dica do sistema no lugar da caixa branca do Windows, para o app INTEIRO, sem mexer nas telas:
 * qualquer elemento com `title` (ou `data-tip`) mostra a dica no estilo da casa ao parar o mouse em cima.
 *
 * Como: ao passar o mouse, o `title` vira `data-tip` (o nativo não chega a aparecer); o texto aparece numa
 * caixa só (.ui-tip, ui/components.css) depois de TIP_DELAY, embaixo do elemento (ou em cima, se não couber),
 * sempre dentro da janela, largura máxima em CSS. Some ao sair, clicar, rolar ou apertar tecla.
 * Acessibilidade: elemento sem nome (sem aria-label e sem texto) ganha o `title` como aria-label.
 * Não usar com o HoverCard (components/HoverCard.js): ele já é a dica rica dele.
 */
'use strict';

const TIP_DELAY = 350;   // ms parado em cima antes de mostrar
const EDGE = 8;
const GAP = 6;

function install(doc) {
  const box = doc.createElement('div');
  box.className = 'ui-tip';
  box.setAttribute('role', 'tooltip');
  box.hidden = true;
  doc.body.appendChild(box);
  let timer = null;
  let cur = null;

  const hide = () => { clearTimeout(timer); timer = null; cur = null; box.hidden = true; };
  const place = (el) => {
    const a = el.getBoundingClientRect();
    box.hidden = false;
    const r = box.getBoundingClientRect();
    let top = a.bottom + GAP;
    if (top + r.height > window.innerHeight - EDGE) top = Math.max(EDGE, a.top - GAP - r.height);
    const left = Math.max(EDGE, Math.min(a.left + a.width / 2 - r.width / 2, window.innerWidth - r.width - EDGE));
    box.style.left = `${Math.round(left)}px`;
    box.style.top = `${Math.round(top)}px`;
  };

  // tira o `title` nativo do elemento E DE TODOS OS ANCESTRAIS: senão o Windows mostra o do pai (ex.: × dentro
  // de uma caixa com dica). O texto fica em `data-tip` (o React só regrava o title se ele mudar — aí isto roda de novo)
  const strip = (from) => {
    for (let n = from; n && n.nodeType === 1; n = n.parentNode) {
      const t = n.getAttribute('title');
      if (t == null) continue;
      n.removeAttribute('title');
      n.setAttribute('data-tip', t);
      if (!n.getAttribute('aria-label') && !(n.textContent || '').trim()) n.setAttribute('aria-label', t);
    }
  };
  doc.addEventListener('mouseover', (e) => {
    if (!e.target || !e.target.closest) return;
    strip(e.target);
    const el = e.target.closest('[data-tip]');
    if (!el) { if (cur) hide(); return; }
    if (el === cur) return;
    hide();
    const text = el.getAttribute('data-tip');
    if (!text) return;
    cur = el;
    timer = setTimeout(() => {
      if (cur !== el || !el.isConnected) return;
      box.textContent = text;
      place(el);
    }, TIP_DELAY);
  });
  doc.addEventListener('mouseout', (e) => { if (cur && !cur.contains(e.relatedTarget)) hide(); });
  ['mousedown', 'keydown', 'wheel'].forEach((ev) => doc.addEventListener(ev, hide, true));
  window.addEventListener('scroll', hide, true);
  window.addEventListener('blur', hide);
}

module.exports = { install };
