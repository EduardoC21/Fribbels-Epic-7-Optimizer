package com.fribbels.fork;

import com.fribbels.model.HeroStats;

/**
 * FORK — resultado de uma build.
 *   ok       calculou
 *   matched  os stats recalculados pelo backend batem EXATAMENTE com os pedidos
 *   stats    tudo que o StatCalculator devolve (cp, ehp, hpps, ehpps, dmg, dmgps,
 *            mcdmg, mcdmgps, dmgh, dmgd, s1, s2, s3, score, bs…)
 */
public class ForkCalcResult {
    public String key;
    public boolean ok;
    public boolean matched;
    public String error;
    public HeroStats stats;
}
