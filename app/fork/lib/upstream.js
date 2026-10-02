/*
 * upstream.js (fork) — PONTE para reusar os módulos do app clássico.
 *
 * Regra do projeto: não reimplementar o que já existe fora do nosso código.
 * Esses módulos esperam alguns objetos em `global` (o app clássico monta isso no
 * init.js). Aqui a gente injeta só o mínimo e devolve os módulos prontos para uso.
 *
 * Dependências reais (conferidas por grep):
 *   reforge.js       -> Utils
 *   itemSimulator.js -> Reforge
 *   itemAugmenter.js -> Reforge
 *   mainStatFixer.js -> nada (tabela de main por nível, do OCR)
 *
 * Se algum require falhar (ex.: build empacotada diferente), tudo devolve null e
 * quem chama deve ter um caminho alternativo — nunca quebrar a tela por isso.
 */
'use strict';

let _loaded = null;

function load() {
  if (_loaded) return _loaded;
  const out = { Utils: null, Reforge: null, ItemSimulator: null, ItemAugmenter: null, MainStatFixer: null, Constants: null, errors: [] };
  const tryReq = (name, p) => {
    try { return require(p); } catch (e) { out.errors.push(`${name}: ${e.message}`); return null; }
  };

  out.Constants = tryReq('constants', '../../js/lib/constants.js');
  if (out.Constants && !global.Constants) global.Constants = out.Constants;

  out.Utils = tryReq('utils', '../../js/lib/utils.js');
  if (out.Utils && !global.Utils) global.Utils = out.Utils;

  out.Reforge = tryReq('reforge', '../../js/lib/reforge.js');
  if (out.Reforge && !global.Reforge) global.Reforge = out.Reforge;

  out.ItemSimulator = tryReq('itemSimulator', '../../js/lib/itemSimulator.js');
  out.ItemAugmenter = tryReq('itemAugmenter', '../../js/lib/itemAugmenter.js');
  out.MainStatFixer = tryReq('mainStatFixer', '../../js/lib/mainStatFixer.js');

  _loaded = out;
  return out;
}

// nível do item -> "tier" de rolagem usado pelo app clássico (71 / 85 / 88)
function rollTier(item) {
  const lv = Number(item && item.level) || 0;
  if (lv === 88) return 88;
  if (lv < 72) return 71;
  return 85;   // 85 e 90 usam a mesma tabela; o 90 é o 85 reforjado
}
// item de nível 85 +15 pode ser reforjado para 90
function isReforgeable(item) {
  const { Reforge } = load();
  try { if (Reforge && Reforge.isReforgeable) return !!Reforge.isReforgeable(item); } catch (e) { /* */ }
  return !!(item && item.level === 85 && item.enhance === 15);
}
// "de outro mundo": material Conversion (borda roxa; só rola valores altos)
function isConversion(item) { return !!(item && item.material === 'Conversion'); }

function report() {
  const u = load();
  return {
    constants: !!u.Constants, utils: !!u.Utils, reforge: !!u.Reforge,
    itemSimulator: !!u.ItemSimulator, itemAugmenter: !!u.ItemAugmenter,
    errors: u.errors,
  };
}

module.exports = { load, rollTier, isReforgeable, isConversion, report };
