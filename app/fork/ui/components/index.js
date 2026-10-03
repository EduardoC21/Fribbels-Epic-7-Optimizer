/*
 * index.js — ponto único de import da biblioteca de componentes.
 * Uso: const { Button, Tabs, Dropdown } = require('../components/index.js');
 */
'use strict';
module.exports = Object.assign(
  {},
  require('./Box.js'),
  require('./Button.js'),
  require('./Tabs.js'),
  require('./Dropdown.js'),
  require('./Chip.js'),
  require('./Checkbox.js'),
  require('./NumberField.js'),
  require('./Bar.js'),
  require('./RankBadge.js'),
  require('./StatRow.js'),
  require('./Icon.js'),
  require('./glyphs.js'),
  require('./Scroll.js'),
  require('./Segmented.js'),
  require('./Modal.js'),
  require('./Menu.js'),
  require('./Collapse.js'),
  require('./ArchetypeSymbol.js'),
  require('./useVirtualRows.js'),
  require('./HoverCard.js'),
  require('./InterestCut.js'),
  require('./Delta.js'),
  require('./EmptyState.js')
);
