/*
 * format.js — formatação de número para exibição, igual em todas as telas.
 * Separador de milhar pt-BR (134.474); percentuais como inteiro + "%".
 */
'use strict';

const DASH = '—';

function int(v) {
  if (v == null || v === '' || !isFinite(Number(v))) return DASH;
  return Math.round(Number(v)).toLocaleString('pt-BR');
}

function pct(v) {
  if (v == null || v === '' || !isFinite(Number(v))) return DASH;
  return Math.round(Number(v)) + '%';
}

/* uma casa decimal só quando existir (7 → "7", 7.5 → "7,5") */
function dec1(v) {
  if (v == null || v === '' || !isFinite(Number(v))) return DASH;
  const n = Math.round(Number(v) * 10) / 10;
  return n.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
}

/*
 * compacto, para tabela larga: até 9.999 inteiro com milhar; daí em diante
 * "18,9k" / "1,2M". O valor exato vai no tooltip da célula.
 */
function compact(v) {
  if (v == null || v === '' || !isFinite(Number(v))) return DASH;
  const n = Number(v);
  const a = Math.abs(n);
  const one = (x) => (Math.round(x * 10) / 10).toLocaleString('pt-BR', { maximumFractionDigits: 1 });
  if (a < 10000) return int(n);
  if (a < 1e6) return one(n / 1000) + 'k';
  return one(n / 1e6) + 'M';
}

module.exports = { DASH, int, pct, dec1, compact };
