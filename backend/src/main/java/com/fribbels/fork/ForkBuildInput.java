package com.fribbels.fork;

import java.util.Map;

/**
 * FORK — uma build a calcular.
 *   key          devolvido como veio (para o front casar a resposta)
 *   heroName     nome do herói (base e habilidades vêm do backend)
 *   heroId       opcional: herói da conta — usa as opções de skill dele para S1–S3
 *   stars        5 ou 6 (padrão 6)
 *   stats        stats FINAIS da build
 *   sets         nº de PEÇAS por set, ex.: {"SpeedSet":4,"TorrentSet":2}
 *   score        gear score conhecido (vai direto para a coluna GS)
 *   artifactName / artifactLevel  calculateStats: só entra no BS (o backend desconta o artefato);
 *                gearNeeded: o artefato EQUIPADO na simulação (soma ATK/HP/DEF dele)
 *   aei          gearNeeded: bônus de imprint/EE simulados, nos campos do backend
 *                (aeiAtkPercent, aeiSpeed, aeiCd…) — ver Hero.aei*
 *   fixedMains   gearNeeded: flat dos mains FIXOS já garantidos {atk, hp, def}
 *                (arma/capacete/armadura) — descontado do que as peças precisam
 */
public class ForkBuildInput {
    public String key;
    public String heroName;
    public String heroId;
    public int stars;
    public ForkStats stats;
    public Map<String, Integer> sets;
    public int score;
    public String artifactName;
    public int artifactLevel;
    public Map<String, Float> aei;
    public Map<String, Float> fixedMains;
}
