package com.fribbels.fork;

/**
 * FORK — estado DESEJADO dos bônus de um herói (imprint + EE + artefato), para
 * POST /fork/setBonus. O front manda o estado completo dos três; o backend faz a
 * conta (subtrai o atual, soma o novo) e grava.
 *
 *   heroId        herói da conta a alterar
 *   imprintField  em qual campo aei o imprint entra (ex.: "aeiAtkPercent") — dado do
 *                 herodata, não fórmula; null se o herói não tem imprint
 *   imprintValue  valor do imprint desejado (null = sem imprint)
 *   eeField       idem para o EE
 *   eeValue       valor do EE desejado (null = sem EE)
 *   artifactName  artefato desejado (null / "None" = sem artefato)
 *   artifactLevel nível do artefato (0–30)
 *
 * Boxed (Float/Integer/String) de propósito: ausente/null tem sentido próprio.
 */
public class ForkBonusRequest {
    public String heroId;
    public String imprintField;
    public Float imprintValue;
    public String eeField;
    public Float eeValue;
    public String artifactName;
    public Integer artifactLevel;
}
