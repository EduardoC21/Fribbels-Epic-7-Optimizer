/*
 * statInfo.js (fork) — metadados dos dois blocos de stats da tela de herói.
 * Bloco 1 = stats como o JOGO mostra. Bloco 2 = derivados que o FRIBBELS calcula.
 * Cada entrada: k (campo no objeto herói/build), label, icon (chave curta p/ assets.statIcon
 * ou null), pct (mostra % / é percentual), tip (texto do tooltip ao passar o mouse).
 */
'use strict';

// Bloco 1 — stats do jogo, na ordem PADRÃO do projeto: ATK, DEF, HP, SPD, CC, CD, EFF, RES
// (atk/def/hp/spd inteiros; cr/cd/eff/res/dac em % inteiro)
const GAME = [
  { k: 'atk', label: 'Ataque', icon: 'atk', pct: false, tip: 'Ataque total. Base do dano da maioria das habilidades.' },
  { k: 'def', label: 'Defesa', icon: 'def', pct: false, tip: 'Defesa total. Reduz o dano recebido segundo a curva de mitigação.' },
  { k: 'hp', label: 'Vida', icon: 'hp', pct: false, tip: 'Pontos de vida totais (HP).' },
  { k: 'spd', label: 'Velocidade', icon: 'spd', pct: false, tip: 'Define a ordem e a frequência dos turnos. É o stat mais escasso e valioso.' },
  { k: 'cr', label: 'Chance Crítica', icon: 'chc', pct: true, tip: 'Chance de acerto crítico. Teto útil em 100%.' },
  { k: 'cd', label: 'Dano Crítico', icon: 'chd', pct: true, tip: 'Multiplicador de dano nos acertos críticos.' },
  { k: 'eff', label: 'Eficácia', icon: 'eff', pct: true, tip: 'Effectiveness — aumenta a chance de aplicar efeitos/debuffs no alvo.' },
  { k: 'res', label: 'Resistência', icon: 'efr', pct: true, tip: 'Effect Resistance — chance de resistir a debuffs recebidos.' },
];

/*
 * Bloco 2 — derivados que o Fribbels calcula.
 *
 * NOMENCLATURA CORRIGIDA pelo Eduardo (não reinterpretar). Os erros que eu
 * tinha cometido, para não repetir:
 *   - o sufixo "S" é por VELOCIDADE (ponderado pelo SPD), NÃO "por segundo";
 *   - "Mcd" é Dano Crítico, NÃO penetração;
 *   - "DmgH" é dano ESCALADO COM VIDA, NÃO "dano em heróis";
 *   - "DmgD" é dano ESCALADO COM DEFESA, NÃO "dano em chefes";
 *   - "GS"/"BS" são pontuações de equipamento, a segunda relativa ao arquétipo.
 * `code` é a sigla usada nos cabeçalhos das tabelas (mesma da grade do otimizador).
 * A ORDEM desta lista é a ordem oficial de exibição.
 */
const FRIBBELS = [
  { k: 'hpps', code: 'HpS', label: 'Vida / Velocidade', tip: 'Vida ponderada pela velocidade.' },
  { k: 'ehp', code: 'Ehp', label: 'Vida Efetiva', tip: 'Vida contando a mitigação da defesa.' },
  { k: 'ehpps', code: 'EhpS', label: 'Vida Efetiva / Velocidade', tip: 'Vida efetiva ponderada pela velocidade.' },
  { k: 'dmg', code: 'Dmg', label: 'Dano Médio', tip: 'Média entre acerto normal e crítico.' },
  { k: 'dmgps', code: 'DmgS', label: 'Dano Médio / Velocidade', tip: 'Dano médio ponderado pela velocidade.' },
  { k: 'mcdmg', code: 'Mcd', label: 'Dano Crítico', tip: 'Dano assumindo acerto crítico.' },
  { k: 'mcdmgps', code: 'McdS', label: 'Dano Crítico / Velocidade', tip: 'Dano crítico ponderado pela velocidade.' },
  { k: 'dmgh', code: 'DmgH', label: 'Dano escalado com Vida', tip: 'Dano de habilidades que escalam com a VIDA do herói.' },
  { k: 'dmgd', code: 'DmgD', label: 'Dano escalado com Defesa', tip: 'Dano de habilidades que escalam com a DEFESA do herói.' },
  { k: 'score', code: 'GS', label: 'Pontuação de Equipamentos', tip: 'Soma ponderada dos substatus das 6 peças.' },
  { k: 'bs', code: 'BS', label: 'Pontuação de Equipamentos no Arquétipo', tip: 'Pesada pelas prioridades do arquétipo.' },
];

const fmtInt = (v) => (v == null || isNaN(v) ? '—' : Math.round(v).toLocaleString('pt-BR'));
function fmtGame(entry, v) {
  if (v == null || isNaN(v)) return '—';
  return entry.pct ? Math.round(v) + '%' : fmtInt(v);
}

module.exports = { GAME, FRIBBELS, fmtInt, fmtGame };
