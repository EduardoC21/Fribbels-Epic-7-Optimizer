/*
 * useVirtualRows — lista VIRTUAL com teclado, comum às tabelas longas
 * (BuildTable: até 3.000 builds; ItemTable: o inventário inteiro).
 *
 * - Acima de `min` linhas só as visíveis (+ `overscan`) viram DOM; quem desenha
 *   põe um espaço de from*rowH antes e (n−to)*rowH depois, então a barra de
 *   rolagem e o cabeçalho preso continuam iguais. Linha de altura FIXA (rowH).
 * - Teclado: a tabela é UMA parada de Tab (a linha ativa); ↑/↓/PgUp/PgDn/Home/End
 *   andam (rolando a lista até a linha existir no DOM) e Enter/Espaço escolhem.
 *   Opcionais: `onMove(row)` a cada linha navegada (seleção segue o foco) e `onEnter(row)`
 *   (Enter faz outra coisa que o Espaço — ex.: tabela de peças: Espaço seleciona, Enter abre).
 *   Cada linha precisa de `data-key` = key(row).
 */
'use strict';
const { useState, useRef, useEffect } = require('../h.js');

function useVirtualRows({ rows, rowH, keyOf, onPick, pickedKey, min, overscan, onMove, onEnter }) {
  const MIN = min == null ? 150 : min;
  const OVER = overscan == null ? 15 : overscan;
  const key = keyOf || ((r) => r.key);
  const scrollRef = useRef(null);
  const [range, setRange] = useState({ from: 0, to: 60 });
  const measure = () => {
    const el = scrollRef.current;
    if (!el) return;
    const from = Math.max(0, Math.floor(el.scrollTop / rowH) - OVER);
    const to = Math.ceil((el.scrollTop + el.clientHeight) / rowH) + OVER;
    setRange((r) => (r.from === from && r.to === to ? r : { from, to }));
  };
  useEffect(() => {
    measure();
    const el = scrollRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [!!rows.length]);   // a tabela pode nascer vazia e ganhar linhas depois

  const virtual = rows.length > MIN;
  const from = virtual ? Math.min(range.from, Math.max(0, rows.length - 1)) : 0;
  const to = virtual ? Math.min(rows.length, Math.max(range.to, from + 1)) : rows.length;
  const slice = virtual ? rows.slice(from, to) : rows;

  // linha ativa = a última navegada, senão a escolhida; fora do DOM → a 1ª visível
  const [activeKey, setActiveKey] = useState(null);
  const pendingFocus = useRef(null);
  useEffect(() => {
    const k = pendingFocus.current;
    const box = scrollRef.current;
    if (!k || !box) return;
    const el = Array.from(box.querySelectorAll('[data-key]')).find((x) => x.dataset.key === k);
    if (!el) return;                       // ainda não renderizou: tenta no próximo render
    pendingFocus.current = null;
    el.focus({ preventScroll: true });
    el.scrollIntoView({ block: 'nearest' });
  });
  const pref = activeKey || pickedKey;
  const stopKey = slice.some((r) => key(r) === pref) ? pref : (slice[0] && key(slice[0]));

  const onRowKey = (e, r) => {
    if (e.target !== e.currentTarget) return;           // controle dentro da linha cuida de si
    if (e.key === 'Enter' && onEnter) { e.preventDefault(); onEnter(r); return; }
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPick(r); return; }
    const i = rows.findIndex((x) => key(x) === key(r));
    const box = scrollRef.current;
    const page = box ? Math.max(1, Math.floor(box.clientHeight / rowH) - 1) : 10;
    const dest = { ArrowDown: i + 1, ArrowUp: i - 1, PageDown: i + page, PageUp: i - page, Home: 0, End: rows.length - 1 }[e.key];
    if (dest == null) return;
    e.preventDefault();
    const j = Math.max(0, Math.min(rows.length - 1, dest));
    if (j === i) return;
    const k = key(rows[j]);
    pendingFocus.current = k;
    setActiveKey(k);
    if (onMove) onMove(rows[j]);
    if (virtual && box && (j < from || j >= to)) {
      box.scrollTop = Math.max(0, j * rowH - box.clientHeight / 2);
      measure();
    }
  };

  return { scrollRef, measure, virtual, from, to, slice, stopKey, onRowKey };
}

module.exports = { useVirtualRows };
