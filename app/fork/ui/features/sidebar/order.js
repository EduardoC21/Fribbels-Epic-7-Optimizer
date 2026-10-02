/*
 * order.js — ordem de EXIBIÇÃO de elementos e classes, a mesma do jogo.
 * As chaves são as do herodata (fire/ice/wind/light/dark; warrior…manauser).
 * Os nomes são só para tooltip/acessibilidade: na tela aparecem os ícones.
 */
'use strict';

const ELEMENTS = [
  { key: 'fire', label: 'Fogo' },
  { key: 'ice', label: 'Gelo' },
  { key: 'wind', label: 'Terra' },
  { key: 'light', label: 'Luz' },
  { key: 'dark', label: 'Trevas' },
];

const ROLES = [
  { key: 'warrior', label: 'Guerreiro' },
  { key: 'knight', label: 'Cavaleiro' },
  { key: 'assassin', label: 'Ladino' },
  { key: 'ranger', label: 'Arqueiro' },
  { key: 'mage', label: 'Mago' },
  { key: 'manauser', label: 'Tecelão de Almas' },
];

const STARS = [3, 4, 5];

module.exports = { ELEMENTS, ROLES, STARS };
