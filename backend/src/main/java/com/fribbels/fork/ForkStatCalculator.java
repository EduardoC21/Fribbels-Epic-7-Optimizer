package com.fribbels.fork;

import com.fribbels.core.StatCalculator;
import com.fribbels.db.ArtifactStatsDb;
import com.fribbels.db.BaseStatsDb;
import com.fribbels.db.HeroDb;
import com.fribbels.enums.Set;
import com.fribbels.handler.OptimizationRequestHandler;
import com.fribbels.model.ArtifactStats;
import com.fribbels.model.BaseStats;
import com.fribbels.model.Hero;
import com.fribbels.model.HeroStats;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * FORK — calcula os stats derivados (CP, vida efetiva, danos, S1–S3, BS) de uma build
 * dada só pelos stats FINAIS + sets, usando o StatCalculator do próprio backend.
 *
 * Não reimplementa nenhuma fórmula. O truque:
 *   1. roda o StatCalculator com as 6 peças VAZIAS -> onde o herói fica com base + sets;
 *   2. mede quanto 1 ponto de peça vale em ATK/HP/DEF (os multiplicadores do herói);
 *   3. monta UMA peça virtual com exatamente o que falta para chegar nos stats finais;
 *   4. roda de novo: os stats batem com os pedidos e o resto sai da fórmula do backend.
 * Se o upstream mudar a fórmula de set, bônus ou dano, isto acompanha sozinho.
 *
 * gearNeeded() é o caminho inverso: com os bônus SIMULADOS (imprint/EE/artefato),
 * quanto as 6 peças precisam somar para chegar nos stats de uma build-alvo.
 *
 * Classes do upstream usadas só por chamada (nenhuma é alterada):
 *   StatCalculator.setBaseValues / addAccumulatorArrsToHero, BaseStatsDb, HeroDb,
 *   ArtifactStatsDb, Hero.builder, Set, OptimizationRequestHandler.SET_COUNT.
 * Posições do acumulador (StatCalculator.buildStatAccumulatorArr):
 *   0 atk · 1 hp · 2 def · 6 cr · 7 cd · 8 eff · 9 res · 10 spd · 11 score
 */
public class ForkStatCalculator {

    private static final float PROBE = 100000f;
    private static final float EPS = 0.01f;   // o backend trunca (int): garante não cair 1 abaixo
    private static final int MAX_FIX = 3;

    private final BaseStatsDb baseStatsDb;
    private final HeroDb heroDb;
    private final ArtifactStatsDb artifactStatsDb;

    public ForkStatCalculator(final BaseStatsDb baseStatsDb, final HeroDb heroDb, final ArtifactStatsDb artifactStatsDb) {
        this.baseStatsDb = baseStatsDb;
        this.heroDb = heroDb;
        this.artifactStatsDb = artifactStatsDb;
    }

    public ForkCalcResult calculate(final ForkBuildInput in) {
        final ForkCalcResult out = new ForkCalcResult();
        out.key = in.key;
        try {
            if (in.heroName == null || in.stats == null) throw new IllegalArgumentException("heroName e stats são obrigatórios");
            final int stars = in.stars > 0 ? in.stars : 6;
            final HeroStats base = baseStatsDb.getBaseStatsByName(in.heroName, stars);
            if (base == null) throw new IllegalArgumentException("herói sem base no backend: " + in.heroName);

            final Hero hero = cleanHero(in, stars, false);
            final int[] sets = setsArr(in.sets);
            final StatCalculator calc = new StatCalculator();
            calc.setBaseValues(base, hero);

            final float[][] accs = new float[6][15];
            final HeroStats zero = run(calc, base, accs, sets, hero);

            // quanto 1 ponto de peça vale no stat final (bônus máximo do herói, multiplicadores)
            accs[0][0] = PROBE; accs[0][1] = PROBE; accs[0][2] = PROBE;
            final HeroStats probe = run(calc, base, accs, sets, hero);
            final float mAtk = (probe.atk - zero.atk) / PROBE;
            final float mHp = (probe.hp - zero.hp) / PROBE;
            final float mDef = (probe.def - zero.def) / PROBE;

            final ForkStats t = in.stats;
            final float[] gear = new float[15];
            gear[0] = (t.atk - zero.atk) / mAtk + EPS;
            gear[1] = (t.hp - zero.hp) / mHp + EPS;
            gear[2] = (t.def - zero.def) / mDef + EPS;
            gear[6] = t.cr - zero.cr + EPS;
            gear[7] = t.cd - zero.cd + EPS;
            gear[8] = t.eff - zero.eff + EPS;
            gear[9] = t.res - zero.res + EPS;
            gear[10] = t.spd - zero.spd + EPS;
            gear[11] = in.score;

            HeroStats r = null;
            for (int i = 0; i <= MAX_FIX; i++) {
                final float[][] a = new float[6][15];
                a[0] = gear.clone();
                r = run(calc, base, a, sets, hero);
                if (matches(r, t)) break;
                gear[0] += (t.atk - r.atk) / mAtk;
                gear[1] += (t.hp - r.hp) / mHp;
                gear[2] += (t.def - r.def) / mDef;
                gear[6] += t.cr - r.cr;
                gear[7] += t.cd - r.cd;
                gear[8] += t.eff - r.eff;
                gear[9] += t.res - r.res;
                gear[10] += t.spd - r.spd;
            }
            out.matched = matches(r, t);
            out.stats = r;
            out.ok = true;
        } catch (final RuntimeException e) {
            out.ok = false;
            out.error = e.getMessage() == null ? e.toString() : e.getMessage();
        }
        return out;
    }

    private static HeroStats run(final StatCalculator calc, final HeroStats base, final float[][] accs, final int[] sets, final Hero hero) {
        return calc.addAccumulatorArrsToHero(base, accs, sets, hero, 0, 0, 0, 0);
    }

    private static boolean matches(final HeroStats r, final ForkStats t) {
        return r.atk == t.atk && r.hp == t.hp && r.def == t.def && r.spd == t.spd
                && r.cr == t.cr && r.cd == t.cd && r.eff == t.eff && r.res == t.res;
    }

    public ForkGearResult gearNeeded(final ForkBuildInput in) {
        final ForkGearResult out = new ForkGearResult();
        out.key = in.key;
        try {
            if (in.heroName == null || in.stats == null) throw new IllegalArgumentException("heroName e stats são obrigatórios");
            final int stars = in.stars > 0 ? in.stars : 6;
            final HeroStats base = baseStatsDb.getBaseStatsByName(in.heroName, stars);
            if (base == null) throw new IllegalArgumentException("herói sem base no backend: " + in.heroName);

            final Hero hero = cleanHero(in, stars, true);
            final int[] sets = setsArr(in.sets);
            final StatCalculator calc = new StatCalculator();
            calc.setBaseValues(base, hero);

            final float[][] accs = new float[6][15];
            final HeroStats zero = run(calc, base, accs, sets, hero);
            accs[0][0] = PROBE; accs[0][1] = PROBE; accs[0][2] = PROBE;
            final HeroStats probe = run(calc, base, accs, sets, hero);
            final float mAtk = (probe.atk - zero.atk) / PROBE;
            final float mHp = (probe.hp - zero.hp) / PROBE;
            final float mDef = (probe.def - zero.def) / PROBE;

            final ForkStats t = in.stats;
            final Map<String, Float> flat = new LinkedHashMap<>();
            flat.put("atk", (t.atk - zero.atk) / mAtk);
            flat.put("def", (t.def - zero.def) / mDef);
            flat.put("hp", (t.hp - zero.hp) / mHp);
            flat.put("spd", (float) (t.spd - zero.spd));
            flat.put("cr", (float) (t.cr - zero.cr));
            flat.put("cd", (float) (t.cd - zero.cd));
            flat.put("eff", (float) (t.eff - zero.eff));
            flat.put("res", (float) (t.res - zero.res));

            // mains fixos (arma/capacete/armadura) já garantidos: saem do que falta
            final Map<String, Float> fixed = in.fixedMains;
            final float fAtk = fixed != null && fixed.get("atk") != null ? fixed.get("atk") : 0;
            final float fHp = fixed != null && fixed.get("hp") != null ? fixed.get("hp") : 0;
            final float fDef = fixed != null && fixed.get("def") != null ? fixed.get("def") : 0;

            // CC acima de 100% não faz diferença no StatCalculator (critRate trava em 1)
            final float crCap = Math.max(0, 100 - zero.cr);

            final Map<String, Float> need = new LinkedHashMap<>();
            need.put("atk", pos((flat.get("atk") - fAtk) / base.atk * 100));
            need.put("def", pos((flat.get("def") - fDef) / base.def * 100));
            need.put("hp", pos((flat.get("hp") - fHp) / base.hp * 100));
            need.put("spd", pos(flat.get("spd")));
            need.put("cr", Math.min(pos(flat.get("cr")), crCap));
            need.put("cd", pos(flat.get("cd")));
            need.put("eff", pos(flat.get("eff")));
            need.put("res", pos(flat.get("res")));

            out.need = need;
            out.needFlat = flat;
            out.crCap = crCap;
            out.base = base;
            out.noGear = zero;
            out.artifact = ArtifactStats.builder()
                    .attack(hero.artifactAttack).health(hero.artifactHealth).defense(hero.artifactDefense).build();
            out.ok = true;
        } catch (final RuntimeException e) {
            out.ok = false;
            out.error = e.getMessage() == null ? e.toString() : e.getMessage();
        }
        return out;
    }

    private static float pos(final float v) {
        return Math.max(0, Math.round(v * 10) / 10f);
    }

    /*
     * Herói "limpo": sem imprint/EE/bônus (eles já estão dentro dos stats finais pedidos).
     * Só entram o que muda a FÓRMULA e não os stats: habilidades (S1–S3) e o artefato (BS).
     * Habilidades: as do herói da conta, se houver (respeita as opções de skill do usuário);
     * senão, as da base do jogo.
     * withBonuses (gearNeeded): aplica os bônus SIMULADOS — aei* de imprint/EE e o artefato,
     * que o backend soma nos aei* de ATK/HP/DEF (é assim que o app grava o artefato).
     */
    private Hero cleanHero(final ForkBuildInput in, final int stars, final boolean withBonuses) {
        final Hero.HeroBuilder b = Hero.builder().name(in.heroName).stars(stars);
        final Hero acc = in.heroId != null ? heroDb.getHeroById(in.heroId) : null;
        if (acc != null) {
            b.damageMultipliers(acc.getDamageMultipliers());
        } else {
            final BaseStats bs = baseStatsDb.getBaseStatsByName(in.heroName);
            if (bs != null) b.skills(bs.getSkills());
        }
        final Hero hero = b.build();
        if (in.artifactName != null) {
            final ArtifactStats art = artifactStatsDb.getArtifactStats(in.artifactName, in.artifactLevel);
            if (art != null) {
                hero.artifactAttack = art.getAttack();
                hero.artifactHealth = art.getHealth();
                hero.artifactDefense = art.getDefense();
                if (withBonuses) {
                    hero.aeiAtk += art.getAttack();
                    hero.aeiHp += art.getHealth();
                    hero.aeiDef += art.getDefense();
                }
            }
        }
        if (withBonuses && in.aei != null) applyAei(hero, in.aei);
        return hero;
    }

    /* campos aei* do Hero (os mesmos que /heroes/setBonusStats grava) */
    private static void applyAei(final Hero h, final Map<String, Float> aei) {
        for (final Map.Entry<String, Float> e : aei.entrySet()) {
            final float v = e.getValue() == null ? 0 : e.getValue();
            switch (e.getKey()) {
                case "aeiAtk": h.aeiAtk += v; break;
                case "aeiDef": h.aeiDef += v; break;
                case "aeiHp": h.aeiHp += v; break;
                case "aeiAtkPercent": h.aeiAtkPercent += v; break;
                case "aeiDefPercent": h.aeiDefPercent += v; break;
                case "aeiHpPercent": h.aeiHpPercent += v; break;
                case "aeiSpeed": h.aeiSpeed += Math.round(v); break;
                case "aeiCr": h.aeiCr += v; break;
                case "aeiCd": h.aeiCd += v; break;
                case "aeiEff": h.aeiEff += v; break;
                case "aeiRes": h.aeiRes += v; break;
                default: throw new IllegalArgumentException("campo de bônus desconhecido: " + e.getKey());
            }
        }
    }

    /* {"SpeedSet":4,"TorrentSet":2} -> nº de PEÇAS por índice de set (como StatCalculator.buildSetsArr) */
    private static int[] setsArr(final Map<String, Integer> pieces) {
        final int[] arr = new int[OptimizationRequestHandler.SET_COUNT];
        if (pieces == null) return arr;
        for (final Set s : Set.values()) {
            final Integer n = pieces.get(s.getName());
            if (n != null) arr[s.getIndex()] += n;
        }
        return arr;
    }
}
