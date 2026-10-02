package com.fribbels.fork;

import com.fribbels.model.ArtifactStats;
import com.fribbels.model.HeroStats;

import java.util.Map;

/**
 * FORK — resultado de POST /fork/gearNeeded: quanto as 6 peças precisam somar
 * para o herói (com os bônus simulados) chegar nos stats da build-alvo.
 *
 *   need      por stat, JÁ descontados os mains fixos:
 *             atk/hp/def em % da base do herói (a unidade dos substatus %),
 *             spd/cr/cd/eff/res em pontos. Nunca negativo.
 *   needFlat  o mesmo antes de converter/descontar (atk/hp/def em pontos flat)
 *   crCap     quanto de CC ainda faz diferença (acima de 100% o backend ignora)
 *   base      a base do herói que o backend usa
 *   noGear    o herói SEM peças: base + bônus + sets (o ponto de partida)
 *   artifact  ATK/HP/DEF do artefato simulado no nível pedido (tabela do backend)
 */
public class ForkGearResult {
    public String key;
    public boolean ok;
    public String error;
    public Map<String, Float> need;
    public Map<String, Float> needFlat;
    public float crCap;
    public HeroStats base;
    public HeroStats noGear;
    public ArtifactStats artifact;
}
