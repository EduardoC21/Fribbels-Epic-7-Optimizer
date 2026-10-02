package com.fribbels.fork;

import com.fribbels.db.ArtifactStatsDb;
import com.fribbels.db.HeroDb;
import com.fribbels.model.ArtifactStats;
import com.fribbels.model.Hero;

import org.apache.commons.lang3.StringUtils;

/**
 * FORK — grava imprint / EE / artefato de um herói da conta, compondo os campos
 * aei* no BACKEND (antes era montado no front, em heroBonus.buildBonusPayload).
 *
 * Os aei* GUARDADOS já somam imprint + EE + artefato. Para trocar qualquer um,
 * subtrai a contribuição ATUAL e soma a NOVA — senão os bônus acumulam. Os valores
 * ATUAIS vêm do próprio herói guardado (imprintNumber, eeNumber, artifactName/Level);
 * os stats do artefato saem da tabela do backend (ArtifactStatsDb), não de fórmula copiada.
 *
 * O front manda o estado completo desejado e diz só EM QUAL campo aei o imprint/EE
 * entram (dado do herodata que o backend não tem) — nenhuma fórmula de stat aqui.
 */
public class ForkBonusWriter {

    private final HeroDb heroDb;
    private final ArtifactStatsDb artifactStatsDb;

    public ForkBonusWriter(final HeroDb heroDb, final ArtifactStatsDb artifactStatsDb) {
        this.heroDb = heroDb;
        this.artifactStatsDb = artifactStatsDb;
    }

    public ForkBonusResult write(final ForkBonusRequest req) {
        final ForkBonusResult out = new ForkBonusResult();
        try {
            if (req == null || req.heroId == null) throw new IllegalArgumentException("heroId é obrigatório");
            final Hero hero = heroDb.getHeroById(req.heroId);
            if (hero == null) throw new IllegalArgumentException("herói não encontrado: " + req.heroId);

            // ---- artefato: subtrai o atual, soma o novo ----
            final ArtifactStats oldArt = artifactStatsDb.getArtifactStats(hero.artifactName, parseLevel(hero.artifactLevel));
            final boolean hasArt = req.artifactName != null && !"None".equals(req.artifactName);
            final int newLevel = req.artifactLevel == null ? 0 : req.artifactLevel;
            final ArtifactStats newArt = hasArt
                    ? artifactStatsDb.getArtifactStats(req.artifactName, newLevel)
                    : ArtifactStats.builder().attack(0f).health(0f).defense(0f).build();
            hero.aeiAtk += newArt.getAttack() - oldArt.getAttack();
            hero.aeiHp += newArt.getHealth() - oldArt.getHealth();
            hero.aeiDef += newArt.getDefense() - oldArt.getDefense();
            hero.artifactName = hasArt ? req.artifactName : "None";
            hero.artifactLevel = String.valueOf(hasArt ? newLevel : 0);
            hero.artifactAttack = newArt.getAttack();
            hero.artifactHealth = newArt.getHealth();
            hero.artifactDefense = newArt.getDefense();

            // ---- imprint: o TIPO (campo aei) é fixo por herói, serve p/ tirar e pôr ----
            final float oldImp = num(hero.imprintNumber);
            final float newImp = req.imprintValue == null ? 0f : req.imprintValue;
            if (req.imprintField != null) addField(hero, req.imprintField, newImp - oldImp);
            hero.imprintNumber = req.imprintValue == null ? "None" : trim(req.imprintValue);

            // ---- EE ----
            final float oldEe = num(hero.eeNumber);
            final float newEe = req.eeValue == null ? 0f : req.eeValue;
            if (req.eeField != null) addField(hero, req.eeField, newEe - oldEe);
            hero.eeNumber = req.eeValue == null ? "None" : trim(req.eeValue);

            round(hero);
            out.ok = true;
        } catch (final RuntimeException e) {
            out.ok = false;
            out.error = e.getMessage() == null ? e.toString() : e.getMessage();
        }
        return out;
    }

    /* soma `delta` no campo aei* nomeado (os mesmos que /heroes/setBonusStats grava) */
    private static void addField(final Hero h, final String field, final float delta) {
        switch (field) {
            case "aeiAtk": h.aeiAtk += delta; break;
            case "aeiDef": h.aeiDef += delta; break;
            case "aeiHp": h.aeiHp += delta; break;
            case "aeiAtkPercent": h.aeiAtkPercent += delta; break;
            case "aeiDefPercent": h.aeiDefPercent += delta; break;
            case "aeiHpPercent": h.aeiHpPercent += delta; break;
            case "aeiSpeed": h.aeiSpeed += Math.round(delta); break;
            case "aeiCr": h.aeiCr += delta; break;
            case "aeiCd": h.aeiCd += delta; break;
            case "aeiEff": h.aeiEff += delta; break;
            case "aeiRes": h.aeiRes += delta; break;
            default: throw new IllegalArgumentException("campo de bônus desconhecido: " + field);
        }
    }

    private static void round(final Hero h) {
        h.aeiAtk = r(h.aeiAtk); h.aeiDef = r(h.aeiDef); h.aeiHp = r(h.aeiHp);
        h.aeiAtkPercent = r(h.aeiAtkPercent); h.aeiDefPercent = r(h.aeiDefPercent); h.aeiHpPercent = r(h.aeiHpPercent);
        h.aeiCr = r(h.aeiCr); h.aeiCd = r(h.aeiCd); h.aeiEff = r(h.aeiEff); h.aeiRes = r(h.aeiRes);
    }

    private static float r(final float v) { return Math.round(v * 10) / 10f; }

    private static int parseLevel(final String s) {
        return StringUtils.isNumeric(s) ? Integer.parseInt(s) : 0;
    }

    private static float num(final String s) {
        if (s == null || "None".equals(s)) return 0f;
        try { return Float.parseFloat(s); } catch (final NumberFormatException e) { return 0f; }
    }

    /* 21.0 -> "21", 7.5 -> "7.5" (imprintNumber/eeNumber são String no Hero) */
    private static String trim(final float v) {
        return v == Math.rint(v) ? String.valueOf((long) v) : String.valueOf(v);
    }
}
