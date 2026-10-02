package com.fribbels.fork;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * FORK — converte as peças CRUAS do jogo (login decifrado pela escuta, nota 07) no formato de item do app,
 * fazendo o que o Lambda do Fribbels (/getItems) completava: TIPO, NÍVEL e valor do MAIN no nível atual.
 * O resto segue o scanner.js do clássico (convertSubStats/convertEnhance), para o merge do upstream ver o mesmo item.
 *
 *   tipo  = letra w/h/a/n/r/b no fim de um pedaço do código ("ecw6w", "ere_sp_a", "eot3n_u3", "ecs26r2")
 *   nível = código terminado em "_u" → 90 (reforjada); senão a FAMÍLIA (código sem a letra do tipo) pela tabela
 *           aprendida (gameCodes.json) ou por uma peça da mesma família cujo main base é inconfundível
 *           (ATQ 100 = 85 …; a tabela não tem 90, que só existe reforjada); sem como saber → 0 (o merge mantém o nível)
 *   main  = base × MAIN_MULT[+N] (prints do Eduardo, 2026-10-01): % arredonda, VEL e fixos para baixo
 *
 * ponytail: no LOGIN o +N vem da contagem de substatus (como o clássico) — +4/+7/+10/+13 (sucesso crítico) ficam
 * +3/+6/+9/+12 até o próximo up ao vivo (que manda `enhanced`); fixo com base quebrada (88/90 no meio) não conferido (floor).
 */
public final class ForkGameImport {

    /** multiplicador do main sobre a base, +0…+15 */
    static final double[] MAIN_MULT = {1, 1.2, 1.4, 1.6, 1.8, 2.0, 2.2, 2.4, 2.6, 2.8, 3.0, 3.3, 3.6, 3.9, 4.2, 5.0};

    private static final Map<Character, String> GEAR = new HashMap<>();
    private static final Map<String, String> STAT = new HashMap<>();
    private static final Map<String, String> SET = new HashMap<>();
    private static final String[] RANK = {"Unknown", "Normal", "Good", "Rare", "Heroic", "Epic"};
    private static final int[] COUNT_BY_RANK = {0, 5, 6, 7, 8, 9};
    private static final int[] OFFSET_BY_RANK = {0, 0, 1, 2, 3, 4};

    static {
        GEAR.put('w', "Weapon"); GEAR.put('h', "Helmet"); GEAR.put('a', "Armor");
        GEAR.put('n', "Necklace"); GEAR.put('r', "Ring"); GEAR.put('b', "Boots");
        String[][] s = {{"att_rate", "AttackPercent"}, {"max_hp_rate", "HealthPercent"}, {"def_rate", "DefensePercent"},
                {"att", "Attack"}, {"max_hp", "Health"}, {"def", "Defense"}, {"speed", "Speed"},
                {"res", "EffectResistancePercent"}, {"cri", "CriticalHitChancePercent"},
                {"cri_dmg", "CriticalHitDamagePercent"}, {"acc", "EffectivenessPercent"}, {"coop", "DualAttackChancePercent"}};
        for (String[] x : s) STAT.put(x[0], x[1]);
        String[][] t = {{"set_acc", "HitSet"}, {"set_att", "AttackSet"}, {"set_coop", "UnitySet"}, {"set_counter", "CounterSet"},
                {"set_cri_dmg", "DestructionSet"}, {"set_cri", "CriticalSet"}, {"set_def", "DefenseSet"},
                {"set_immune", "ImmunitySet"}, {"set_max_hp", "HealthSet"}, {"set_penetrate", "PenetrationSet"},
                {"set_rage", "RageSet"}, {"set_res", "ResistSet"}, {"set_revenge", "RevengeSet"}, {"set_scar", "InjurySet"},
                {"set_speed", "SpeedSet"}, {"set_vampire", "LifestealSet"}, {"set_shield", "ProtectionSet"},
                {"set_torrent", "TorrentSet"}, {"set_revenant", "ReversalSet"}, {"set_riposte", "RiposteSet"},
                {"set_chase", "PursuitSet"}, {"set_opener", "WarfareSet"}, {"set_weak", "WeakeningSet"}, {"set_might", "FervorSet"}};
        for (String[] x : t) SET.put(x[0], x[1]);
    }

    public static final class Request {
        public List<Map<String, Object>> equips;
        public Map<String, Integer> families;               // família → nível
        public Map<String, Map<String, Integer>> mainBase;  // tipo do jogo → base → nível (só valores inconfundíveis)
    }

    /** código → {tipo, família, reforjada}; `mainType` (do jogo) desempata códigos com duas letras ("econi_1n_a" = colar) */
    static String[] parse(final String code, final String mainType) {
        final List<String> t = new ArrayList<>(java.util.Arrays.asList(code.split("_", -1)));
        boolean reforged = false;
        if (t.size() > 1 && "u".equals(t.get(t.size() - 1))) { reforged = true; t.remove(t.size() - 1); }
        String[] first = null;
        for (int pass = 0; pass < 2; pass++) {
            for (int i = t.size() - 1; i >= 0; i--) {
                final String tok = pass == 0 ? t.get(i) : t.get(i).replaceAll("\\d+$", "");
                if (tok.isEmpty() || !GEAR.containsKey(tok.charAt(tok.length() - 1))) continue;
                final List<String> f = new ArrayList<>(t);
                f.set(i, tok.substring(0, tok.length() - 1) + (pass == 0 ? "" : t.get(i).substring(tok.length())));
                final String[] r = {GEAR.get(tok.charAt(tok.length() - 1)), String.join("_", f), reforged ? "1" : ""};
                if (first == null) first = r;
                if (fitsMain(r[0], mainType)) return r;
            }
        }
        return first != null ? first : new String[]{null, String.join("_", t), reforged ? "1" : ""};
    }

    /** arma = ATQ fixo, capacete = VIDA fixa, armadura = DEF fixa (main que não existe naquele tipo de peça) */
    static boolean fitsMain(final String gear, final String mainType) {
        if (mainType == null) return true;
        if ("Weapon".equals(gear)) return "att".equals(mainType);
        if ("Helmet".equals(gear)) return "max_hp".equals(mainType);
        if ("Armor".equals(gear)) return "def".equals(mainType);
        return true;
    }

    static String baseKey(final double v) {
        final double r = Math.round(v * 10000) / 10000.0;
        return r == Math.rint(r) ? String.valueOf((long) r) : String.valueOf(r);
    }

    static boolean isFlat(final String t) {
        return "max_hp".equals(t) || "speed".equals(t) || "att".equals(t) || "def".equals(t);
    }

    /** pedido do /fork/mainCurve: o main cru da peça (op[0] = tipo do jogo + valor no +0) */
    public static final class MainCurveRequest {
        public List<MainBase> mains;
    }

    public static final class MainBase {
        public String type;
        public double base;
    }

    /** main da peça em cada +N (0…15), mesma regra da sincronização — o up à mão no lote usa isto */
    public static List<int[]> mainCurves(final MainCurveRequest req) {
        final List<int[]> out = new ArrayList<>();
        if (req.mains == null) return out;
        for (final MainBase m : req.mains) {
            final int[] c = new int[16];
            for (int e = 0; e <= 15; e++) c[e] = m == null || m.type == null ? 0 : mainValue(m.type, m.base, e);
            out.add(c);
        }
        return out;
    }

    static int mainValue(final String type, final double base, final int enhance) {
        final double m = MAIN_MULT[Math.max(0, Math.min(15, enhance))];
        if (isFlat(type)) return (int) Math.floor(base * m + 1e-9);
        return (int) Math.round(base * 100 * m);
    }

    @SuppressWarnings("unchecked")
    public static Map<String, Object> convert(final Request req) {
        final Map<String, Integer> families = new HashMap<>(req.families == null ? new HashMap<String, Integer>() : req.families);
        final Map<String, Map<String, Integer>> mainBase = req.mainBase == null ? new HashMap<String, Map<String, Integer>>() : req.mainBase;
        final List<Map<String, Object>> equips = req.equips == null ? new ArrayList<Map<String, Object>>() : req.equips;

        // 1º passe: família nova aprende o nível por uma peça dela de main inconfundível
        for (final Map<String, Object> e : equips) {
            if (e.get("f") == null || e.get("code") == null) continue;
            final List<Object> main = (List<Object>) ((List<Object>) e.get("op")).get(0);
            final String[] p = parse((String) e.get("code"), (String) main.get(0));
            if (!p[2].isEmpty() || families.containsKey(p[1])) continue;
            final Map<String, Integer> byBase = mainBase.get((String) main.get(0));
            final Integer lv = byBase == null ? null : byBase.get(baseKey(((Number) main.get(1)).doubleValue()));
            if (lv != null) families.put(p[1], lv);
        }

        final List<Map<String, Object>> items = new ArrayList<>();
        int noLevel = 0, noGear = 0;
        for (final Map<String, Object> e : equips) {
            if (e.get("f") == null || e.get("code") == null) continue;   // sem set = artefato/material
            final List<Object> op = (List<Object>) e.get("op");
            final String[] p = parse((String) e.get("code"), (String) ((List<Object>) op.get(0)).get(0));
            if (p[0] == null) { noGear++; continue; }
            final int g = ((Number) e.get("g")).intValue();
            final int level = !p[2].isEmpty() ? 90 : families.getOrDefault(p[1], 0);
            if (level == 0) noLevel++;

            final int count = Math.min(op.size() - 1, COUNT_BY_RANK[g]);
            // o up ao vivo manda o +N de verdade (`enhanced`, inclusive +4/+7… de sucesso crítico); o login não manda
            final int enhance = e.get("enhanced") instanceof Number ? ((Number) e.get("enhanced")).intValue()
                    : Math.max((count - OFFSET_BY_RANK[g]) * 3, 0);

            final List<Object> mainOp = (List<Object>) op.get(0);
            final String mainType = (String) mainOp.get(0);
            final Map<String, Object> main = new LinkedHashMap<>();
            main.put("type", STAT.get(mainType));
            main.put("value", mainValue(mainType, ((Number) mainOp.get(1)).doubleValue(), enhance));

            // substatus: igual ao convertSubStats do clássico (anotação 'c' = modificado; 'u' não conta roll)
            final Map<String, Map<String, Object>> acc = new LinkedHashMap<>();
            for (int i = 1; i < op.size(); i++) {
                final List<Object> o = (List<Object>) op.get(i);
                final String t = (String) o.get(0);
                final double raw = ((Number) o.get(1)).doubleValue();
                final double value = isFlat(t) ? raw : Math.round(raw * 1000) / 10.0;
                final String note = o.size() > 2 && o.get(2) != null ? String.valueOf(o.get(2)) : null;
                final String type = STAT.get(t);
                final Map<String, Object> s = acc.get(type);
                if (s == null) {
                    final Map<String, Object> n = new LinkedHashMap<>();
                    n.put("type", type); n.put("value", value); n.put("rolls", 1);
                    acc.put(type, n);
                } else {
                    s.put("value", Math.round((((Number) s.get("value")).doubleValue() + value) * 10) / 10.0);
                    if ("c".equals(note)) s.put("modified", true);
                    else if (!"u".equals(note)) s.put("rolls", ((Number) s.get("rolls")).intValue() + 1);
                }
            }

            final Map<String, Object> it = new LinkedHashMap<>();
            it.put("gear", p[0]);
            it.put("rank", RANK[Math.max(0, Math.min(5, g))]);
            it.put("set", SET.get((String) e.get("f")));
            it.put("name", "Unknown");
            it.put("level", level);
            it.put("enhance", enhance);
            it.put("main", main);
            it.put("substats", new ArrayList<>(acc.values()));
            it.put("ingameId", baseKey(((Number) e.get("id")).doubleValue()));
            it.put("ingameEquippedId", e.get("p") == null ? "undefined" : baseKey(((Number) e.get("p")).doubleValue()));
            it.put("op", op);
            it.put("code", e.get("code"));
            items.add(it);
        }
        final Map<String, Object> r = new HashMap<>();
        r.put("items", items);
        r.put("noLevel", noLevel);
        r.put("noGear", noGear);
        r.put("families", families);   // o front grava as famílias aprendidas
        return r;
    }

    private ForkGameImport() {
    }
}
