package com.fribbels.fork;

import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeSet;

/**
 * FORK — notas de PEÇA (POST /fork/itemRatings). Toda a conta fica aqui (regra do fork:
 * nenhuma fórmula de jogo no front). As TABELAS vêm no pedido (data/fork/gameRules.json,
 * montadas pelo front em lib/itemRatings.js): ajustar número = editar o JSON, não o Java.
 *
 * score — Pontos de Equipamento do JOGO (ajustado nos 12 prints do Eduardo: todos batem com
 *   arredondamento NORMAL):
 *     Σ substatus × peso (fixo × poder da raridade: Heroica 0,95…)
 *     + mainFactor × mainPct[nível] × (main ÷ máximo do main no +15 DAQUELE nível)
 *
 * potential — PEÇA (0..1; só passa de 1 com roll concentrado ou VEL 5). TODA peça compete com a
 *   Épica 90 REFORJADA (Eduardo, 2026-09-30, 2ª regra):
 *     (Σ peso·valor·concentração + main) ÷ (melhor 90 com os mesmos rolls [+ os que a raridade não tem] + MAIN)
 *   melhor 90 = os rolls perfeitos [8 pontos: 8% = 5 CC = 4 VEL] + a maior reforja possível NA MESMA
 *   quantidade de rolls (bestRef) — fixo: peça perfeita fica em 97–100% conforme tipos/distribuição.
 *   scoreReforged: o score do jogo que a 85 +15 reforjável teria reforjada (a coluna Score mostra ao lado).
 *   85 reforjável (não Gaveleet): reforja SIMULADA nos rolls que já teve (e main ao da 90) → o % não
 *   muda ao reforjar. Nível < 85, 88 e Gaveleet: valores reais contra a mesma régua (perdem a reforja).
 *   Peça upando: só os rolls que já teve, na régua da 90.
 *   Concentração: o 3º, 4º e 5º up no MESMO substatus rendem +10/+15/+20% de um roll daquela linha
 *   (concentrationByUp). O 100% não muda.
 *   MAIN = o que o main cheio vale no score da 90 (26), ~25% da peça, pelo valor no +15 do nível da peça
 *   (85 reforjável = o da 90) contra o main da 90. Todo main vale igual (como no jogo), menos o FIXO
 *   num slot que tem a versão %: peso do score × fixo ÷ o % do mesmo stat.
 *
 * profiles — potencial PARA um arquétipo/herói = a MESMA régua da peça, com cada substatus
 *   multiplicado conforme serve a ele (Eduardo, 2026-09-30). Decidido por peça, olhando o que ELA
 *   poderia ter (substatus do slot menos o main dela):
 *   - stats úteis possíveis (barra > 0), contados por STAT (% e fixo do mesmo stat = uma vaga);
 *   - multiplicador do útil = subFit × escada(nível da barra) ÷ média da escada nos 4 úteis de maior
 *     barra (escada 1 · 0,85 · 0,7 por nível DISTINTO; média dos 4 = subFit = 1,05);
 *   - inútil (barra ≤ 0): tirou o lugar de um útil que cabia (% OU fixo) → 0 — assim, com poucos
 *     stats úteis, ter o fixo útil vale mais que um inútil (Eduardo, 2026-09-30); inevitável (não
 *     cabia nada útil) → roll inicial sai da conta (nem soma, nem entra no 100%). Ups em stat inútil
 *     são sempre perdidos; em barra −1 descontam negativeUpFactor (0,5) do valor.
 *   - fixo vale 100 ÷ base do perfil (herói = a base dele; arquétipo = média dos heróis dele).
 *   - main: lista escolhida = 100% (fora dela = 0: o front nem lista); sem lista = escada do main
 *     por nível distinto de barra entre os mains POSSÍVEIS no slot (1 · 0,85 · 0,7), barra ≤ 0 = 0,
 *     fixo × (fixo pela base ÷ o % do mesmo stat); nenhum main útil possível = main fora da conta.
 *   Pedra de troca simulada (uma por peça; já modificada = só ELA de novo): recalcula a peça com a
 *   linha trocada por qualquer stat do slot (fora do main e dos outros substatus; o próprio também)
 *   no MÁXIMO da pedra para os rolls dela; fica a melhor. `gemMode` (Eduardo, 2026-10-02):
 *     none       sem troca (a peça como está)
 *     safe       só troca que não baixa o potencial da PEÇA (peso × valor novo ≥ peso × valor de hoje)
 *     reversible também troca que baixa, desde que REVERSÍVEL: uma pedra futura nessa linha (qualquer stat livre,
 *                no máximo) devolve pelo menos o que a linha vale hoje — ex.: DEF% 6 de 1 roll (base) → ATK 58;
 *                outra pedra % de 1 roll chega a 9 ≥ 6
 *     permanent  qualquer troca, mesmo perda que nunca volta (ex.: 18% com 2 rolls pós-reforja → no máximo 14)
 *   Sem `gemMode` (cliente antigo): simulateGem/allowLossyGem (false → none; lossy → permanent; senão safe).
 *   A troca escolhida volta em `gems[perfil]` (linha, de, para, valor, rolls), para o editor mostrar (v13).
 *   v15: os QUATRO modos saem juntos em `byMode[modo] = {profiles, gems}` (uma passada pelas trocas): a tela
 *   escolhe o modo sem pedir de novo (tela de herói e tela Equipamentos têm modos independentes).
 */
public final class ForkItemRatings {

    public static class Request {
        public Rules rules;
        public List<Item> items;
        public List<Profile> profiles;
    }

    public static class Rules {
        public Map<String, Double> weights;
        public Map<String, Tier> tiers;                     // "71" | "85" | "88"
        public Map<String, Map<String, Double>> mainMax;    // nível ("75", "85", "88", "90"…) -> tipo -> máx no +15
        public Map<String, Double> mainPct;                 // "85" | "88" | "90"
        public double mainFactor;
        public List<String> plainStats;
        public Reforge reforge;
        public Map<String, List<String>> substatsBySlot;
        public Map<String, List<String>> mainStatsBySlot;
        public Map<String, Double> rollsAt15;               // raridade -> rolls no +15 (Épica 9)
        public Map<String, Double> rankPower;               // raridade -> poder (fixo no score)
        public Map<String, List<double[]>> gemTable;        // tipo -> [mín, máx] da pedra SUPERIOR por nº de rolls (1..6), peça que não reforja
        public Map<String, List<double[]>> gemTableReforged; // idem, tabela da REFORJADA: 90 e 85 reforjável (como o clássico, modificationFilter.js)
        public List<Double> concentrationByUp;              // bônus (em roll) do 3º, 4º, 5º up no mesmo substatus
        public List<Double> subLadder;                      // escada dos substatus por nível de barra
        public double subFit;                               // média dos multiplicadores nos 4 úteis
        public List<Double> mainLadder;                     // escada do main sem lista
        public double negativeUpFactor;                     // desconto por up em barra −1
        public boolean simulateGem;                         // botão global "Pedra" (tela Equipamentos)
        public boolean allowLossyGem;                       // botão "Com perda" (antigo: vale se gemMode faltar)
        public String gemMode;                              // none | safe | reversible | permanent
        transient Map<Integer, Double> bestRefCache;
    }

    public static class Tier {
        public Map<String, Map<String, double[]>> flat;     // tipo -> raridade -> [mín, máx]
        public Map<String, double[]> percent;               // "Plain" | CC | CD | Speed -> [mín, máx]
    }

    public static class Reforge {
        public Map<String, Double> flatBonusPorRoll;
        public Map<String, Double> plainStatRollsToValue;
        public Map<String, Double> critDamageRollsToValue;
        public Map<String, Double> speedRollsToValue;
    }

    public static class Main {
        public String type;
        public double value;
    }

    public static class Sub {
        public String type;
        public double value;
        public Integer rolls;
        public boolean modified;
        transient boolean comparable;                       // pedra simulada: valor já no espaço de comparação
    }

    public static class Item {
        public String id;
        public String gear;
        public String rank;
        public int level;
        public int enhance;
        public boolean gaveleets;
        public boolean disableMods;                         // "Não modificável": nunca simula pedra nesta peça
        public Main main;
        public List<Sub> substats;
    }

    public static class Profile {
        public String id;
        public Map<String, Double> prio;                    // atk def hp spd cr cd eff res
        public Map<String, List<String>> mains;             // slot -> mains escolhidos (vazio = qualquer)
        public Map<String, Double> base;                    // atk hp def: base do herói / média do arquétipo
    }

    public static class Result {
        public String id;
        public double score;
        public Double scoreReforged;                        // 85 +15 reforjável: o score do jogo SE reforjar
        public Double potential;
        public Map<String, Double> profiles = new HashMap<>();
        public Map<String, Gem> gems = new HashMap<>();     // perfil -> a troca que deu a nota (só quando a pedra ganhou)
        public Map<String, ModeResult> byMode = new HashMap<>();   // none|safe|reversible|permanent -> notas e trocas
    }

    public static class ModeResult {
        public Map<String, Double> profiles = new HashMap<>();
        public Map<String, Gem> gems = new HashMap<>();
    }

    static final String[] MODES = {"none", "safe", "reversible", "permanent"};

    public static class Gem {
        public int line;                                    // índice do substatus trocado
        public String from;
        public String to;
        public double value;
        public int rolls;
    }

    private ForkItemRatings() {
    }

    public static List<Result> rate(final Request req) {
        final List<Result> out = new ArrayList<>();
        if (req == null || req.items == null || req.rules == null) return out;
        for (final Item it : req.items) out.add(rate(req.rules, it, req.profiles));
        return out;
    }

    static Result rate(final Rules r, final Item it, final List<Profile> profiles) {
        final Result res = new Result();
        res.id = it.id;
        final List<Sub> subs = new ArrayList<>();
        if (it.substats != null) for (final Sub s : it.substats) if (s != null && s.type != null) subs.add(s);

        double subScore = 0;
        for (final Sub s : subs) subScore += scoreWeight(r, it, s.type) * s.value;
        res.score = subScore + mainPoints(r, it);
        if (reforgeable85(it) && it.enhance >= 15) {
            double sub90 = 0;
            for (final Sub s : subs) sub90 += scoreWeight(r, it, s.type) * (s.value + reforgeAdd(r.reforge, s.type, rolls(s)));
            final double m85 = main15(r, String.valueOf(it.level), tierKey(it), it.main == null ? null : it.main.type);
            res.scoreReforged = sub90 + (m85 > 0 ? r.mainFactor * get(r.mainPct, "90") * (it.main.value / m85) : 0);
        }

        final double den = reference(r, it, subs);
        if (den <= 0 || subs.isEmpty()) return res;
        double num = 0;
        for (final Sub s : subs) num += get(r.weights, s.type) * value(r, it, s) * concentration(r, rolls(s));
        final double mp = mainShare(r, it);
        res.potential = (num + mp * genericMainRatio(r, it)) / (den + mp);
        if (profiles != null) {
            final String want = gemMode(r);
            for (final String m : MODES) res.byMode.put(m, new ModeResult());
            for (final Profile p : profiles) {
                if (p == null || p.prio == null || maxBar(p) <= 0) continue;
                final Gem[] gems = new Gem[MODES.length];
                final double[] v = profileModes(r, it, subs, p, den, gems);
                for (int k = 0; k < MODES.length; k++) {
                    final ModeResult mr = res.byMode.get(MODES[k]);
                    mr.profiles.put(p.id, v[k]);
                    if (gems[k] != null) mr.gems.put(p.id, gems[k]);
                    if (MODES[k].equals(want)) {
                        res.profiles.put(p.id, v[k]);
                        if (gems[k] != null) res.gems.put(p.id, gems[k]);
                    }
                }
            }
        }
        return res;
    }

    /* 1 + bônus de concentração ÷ rolls: o 3º, 4º, 5º up no mesmo substatus rendem mais um pedaço de roll */
    static double concentration(final Rules r, final int n) {
        if (r.concentrationByUp == null || r.concentrationByUp.isEmpty()) return 1;
        double bonus = 0;
        for (int up = 3; up <= n - 1; up++) {
            bonus += r.concentrationByUp.get(Math.min(up - 3, r.concentrationByUp.size() - 1));
        }
        return 1 + bonus / n;
    }

    /* ---------------- potencial PARA um perfil ---------------- */

    /* a nota para o perfil nos 4 modos (MODES) de uma vez; `gemsOut[k]` = a troca que deu a nota do modo k */
    static double[] profileModes(final Rules r, final Item it, final List<Sub> subs, final Profile p, final double pieceDen,
                                 final Gem[] gemsOut) {
        final double base = profileRatio(r, it, subs, p, pieceDen);
        final double[] best = {base, base, base, base};
        if (it.disableMods) return best;
        final List<String> allowed = r.substatsBySlot == null ? null : r.substatsBySlot.get(it.gear);
        // tabela da pedra como o clássico (modificationFilter.js): 90 e 85 reforjável usam a da REFORJADA
        // (2 rolls de ATK% = 10–14 na superior) e o valor já é o final (não ganha reforja); as demais, a não reforjada
        final Map<String, List<double[]>> table = it.level == 90 || reforgeable85(it) ? r.gemTableReforged : r.gemTable;
        if (allowed == null || table == null) return best;
        int only = -1;                                      // já modificada: só ela troca de novo
        for (int i = 0; i < subs.size(); i++) if (subs.get(i).modified) only = i;
        for (int i = 0; i < subs.size(); i++) {
            if (only >= 0 && i != only) continue;
            final Sub s = subs.get(i);
            final int n = Math.max(1, Math.min(6, rolls(s)));
            final double now = get(r.weights, s.type) * value(r, it, s);
            // reversível: o máximo que UMA pedra futura põe nesta linha (qualquer stat livre, inclusive o próprio)
            double recover = 0;
            for (final String t : allowed) {
                if (!free(it, subs, i, t)) continue;
                final List<double[]> rows = table.get(t);
                if (rows != null && rows.size() >= n) recover = Math.max(recover, get(r.weights, t) * rows.get(n - 1)[1]);
            }
            final boolean recoverable = recover >= now - 1e-9;
            for (final String t : allowed) {
                if (!free(it, subs, i, t)) continue;
                final List<double[]> rows = table.get(t);
                if (rows == null || rows.size() < n) continue;
                final double gv = rows.get(n - 1)[1];
                final boolean loses = get(r.weights, t) * gv < now - 1e-9;   // baixaria o potencial da peça
                final Sub g = new Sub();
                g.type = t;
                g.value = gv;
                g.rolls = n;
                g.modified = true;
                g.comparable = true;
                final List<Sub> alt = new ArrayList<>(subs);
                alt.set(i, g);
                final double v = profileRatio(r, it, alt, p, pieceDen);
                // modo k aceita a troca? none nunca; safe sem perda; reversible sem perda ou recuperável; permanent sempre
                final boolean[] ok = {false, !loses, !loses || recoverable, true};
                for (int k = 1; k < MODES.length; k++) {
                    if (!ok[k] || v <= best[k] + 1e-9) continue;
                    best[k] = v;
                    if (gemsOut != null) {
                        final Gem gem = new Gem();
                        gem.line = i; gem.from = s.type; gem.to = t; gem.value = gv; gem.rolls = n;
                        gemsOut[k] = gem;
                    }
                }
            }
        }
        return best;
    }

    static String gemMode(final Rules r) {
        if (r.gemMode != null && !r.gemMode.isEmpty()) return r.gemMode;
        return !r.simulateGem ? "none" : r.allowLossyGem ? "permanent" : "safe";
    }

    /* a linha i pode virar o tipo t? (não é o main nem outro substatus da peça; o próprio pode) */
    static boolean free(final Item it, final List<Sub> subs, final int i, final String t) {
        if (it.main != null && t.equals(it.main.type)) return false;
        for (int k = 0; k < subs.size(); k++) if (k != i && t.equals(subs.get(k).type)) return false;
        return true;
    }

    /* a nota da peça para o perfil, com os substatus como estão (sem pedra) */
    static double profileRatio(final Rules r, final Item it, final List<Sub> subs, final Profile p, final double pieceDen) {
        final String mainT = it.main == null ? null : it.main.type;
        final List<String> allowed = r.substatsBySlot == null ? null : r.substatsBySlot.get(it.gear);

        // stats úteis possíveis nesta peça (por stat) e os tipos úteis que caberiam (% e fixo)
        final Map<String, Double> groupBar = new HashMap<>();
        final List<String> useful = new ArrayList<>();
        if (allowed != null) {
            for (final String t : allowed) {
                if (t.equals(mainT)) continue;
                final double b = bar(p, t);
                if (b <= 0) continue;
                groupBar.put(statKey(t), b);
                useful.add(t);
            }
        }
        final List<Double> bars = new ArrayList<>(groupBar.values());
        Collections.sort(bars, Collections.reverseOrder());
        final List<Double> levels = distinctDesc(bars);
        double mean = 0;
        final int top = Math.min(4, bars.size());
        for (int k = 0; k < top; k++) mean += ladder(r.subLadder, levels.indexOf(bars.get(k)));
        mean = top > 0 ? mean / top : 1;

        // inúteis: os primeiros tiraram o lugar de um útil que cabia (% ou fixo) → 0; o resto era
        // inevitável → roll inicial fora da conta. Os ups nos dois casos são perdidos.
        final List<String> present = new ArrayList<>();
        for (final Sub s : subs) present.add(s.type);
        int missing = 0;
        for (final String t : useful) if (!present.contains(t)) missing++;

        double num = 0;
        double removedRef = 0;                              // o 100% do roll inicial dos inevitáveis
        for (int i = 0; i < subs.size(); i++) {
            final Sub s = subs.get(i);
            final double b = bar(p, s.type);
            final int n = rolls(s);
            final double total = profWeight(r, p, s.type) * value(r, it, s);
            if (b > 0) {
                final double m = r.subFit * ladder(r.subLadder, levels.indexOf(b)) / mean;
                num += m * total * concentration(r, n);
                continue;
            }
            if (b < 0) num -= r.negativeUpFactor * (total - total / n);   // cada up em barra −1 desconta
            if (missing > 0) missing--;
            else removedRef += perfectRoll(r) + (bestRef(r, 9) - 9 * perfectRoll(r)) / 9;   // 1 roll da melhor 90
        }
        double den = pieceDen - removedRef;

        // main
        final double mainRatio = profileMainRatio(r, it, p);
        if (!Double.isNaN(mainRatio)) {
            final double mp = mainShare(r, it);
            num += mp * mainRatio;
            den += mp;
        }
        return den > 0 ? num / den : 0;
    }

    static double bar(final Profile p, final String type) {
        final String k = statKey(type);
        return k == null ? 0 : Math.round(get(p.prio, k));
    }

    static double maxBar(final Profile p) {
        double m = 0;
        if (p.prio != null) for (final Double v : p.prio.values()) if (v != null) m = Math.max(m, Math.round(v));
        return m;
    }

    static List<Double> distinctDesc(final List<Double> values) {
        final List<Double> out = new ArrayList<>(new TreeSet<>(values));
        Collections.reverse(out);
        return out;
    }

    static double ladder(final List<Double> l, final int level) {
        if (l == null || l.isEmpty() || level < 0) return 1;
        return l.get(Math.min(level, l.size() - 1));
    }

    /* valor de 1 ponto do stat PARA o perfil: fixo pela base dele, o resto pelo peso do score */
    static double profWeight(final Rules r, final Profile p, final String type) {
        if (isFlat(type) && p.base != null) {
            final double b = get(p.base, statKey(type));
            if (b > 0) return 100.0 / b;
        }
        return get(r.weights, type);
    }

    /* main para o perfil; NaN = nenhum main útil possível no slot → fora da conta */
    static double profileMainRatio(final Rules r, final Item it, final Profile p) {
        if (it.main == null || it.main.type == null) return Double.NaN;
        final String t = it.main.type;
        final List<String> chosen = p.mains == null ? null : p.mains.get(it.gear);
        if (chosen != null && !chosen.isEmpty()) return chosen.contains(t) ? levelRatio(r, it, t) : 0;
        final List<String> possible = r.mainStatsBySlot == null ? null : r.mainStatsBySlot.get(it.gear);
        if (possible == null) return Double.NaN;
        final List<Double> bars = new ArrayList<>();
        for (final String m : possible) if (bar(p, m) > 0) bars.add(bar(p, m));
        if (bars.isEmpty()) return Double.NaN;
        final double b = bar(p, t);
        if (b <= 0) return 0;
        final double step = ladder(r.mainLadder, distinctDesc(bars).indexOf(b));
        if (isFlat(t) && slotHasPercentOf(r, it, t)) {
            final double pct = refMain15(r, it, t + "Percent");
            return pct > 0 ? step * profWeight(r, p, t) * ownMain15(r, it, t) / pct : 0;
        }
        return step * levelRatio(r, it, t);
    }

    /* ---------------- main ---------------- */

    /* o que o main cheio vale na conta do potencial (~25% da peça, como no score do jogo) */
    static double mainShare(final Rules r, final Item it) {
        return r.mainFactor * get(r.mainPct, "90");
    }

    static String refKey(final Item it) {
        return "90";                                        // toda peça compete com a Épica 90 reforjada
    }

    /* main no +15: do nível da peça (75/78/80 têm tabela própria) ou do nível de referência */
    static double main15(final Rules r, final String level, final String tier, final String type) {
        if (r.mainMax == null || type == null) return 0;
        Double m = null;
        if (level != null && r.mainMax.get(level) != null) m = r.mainMax.get(level).get(type);
        if (m == null && r.mainMax.get(tier) != null) m = r.mainMax.get(tier).get(type);
        return m == null ? 0 : m;
    }

    /* main no +15 da peça; a 85 reforjável entra como se já fosse 90 (a reforja leva o main ao da 90) */
    static double ownMain15(final Rules r, final Item it, final String type) {
        if (reforgeable85(it)) return main15(r, "90", "90", type);
        return main15(r, String.valueOf(it.level), tierKey(it), type);
    }

    static double refMain15(final Rules r, final Item it, final String type) {
        return main15(r, refKey(it), refKey(it), type);
    }

    /* main do nível da peça ÷ o do nível de referência (75 < 85) */
    static double levelRatio(final Rules r, final Item it, final String type) {
        final double ref = refMain15(r, it, type);
        return ref > 0 ? ownMain15(r, it, type) / ref : 0;
    }

    static boolean slotHasPercentOf(final Rules r, final Item it, final String flat) {
        final List<String> m = r.mainStatsBySlot == null ? null : r.mainStatsBySlot.get(it.gear);
        return m != null && m.contains(flat + "Percent");
    }

    /* nota da PEÇA: todo main vale igual (como no jogo); fixo num slot que tem o % vale peso × fixo ÷ % */
    static double genericMainRatio(final Rules r, final Item it) {
        if (it.main == null || it.main.type == null) return 0;
        final String t = it.main.type;
        if (isFlat(t) && slotHasPercentOf(r, it, t)) {
            final double pct = refMain15(r, it, t + "Percent");
            return pct > 0 ? get(r.weights, t) * ownMain15(r, it, t) / pct : 0;
        }
        return levelRatio(r, it, t);
    }

    /* ---------------- peça ---------------- */

    /* valor do substatus no espaço da 90: a 85 reforjável ganha a reforja SIMULADA (nos rolls que já
       teve); 90 reforjada, 88 e as que não reforjam entram como estão */
    static double value(final Rules r, final Item it, final Sub s) {
        if (s.comparable) return s.value;
        return s.value + (reforgeable85(it) ? reforgeAdd(r.reforge, s.type, rolls(s)) : 0);
    }

    /* 85 que ainda pode ser reforjada (Gaveleet não reforja) */
    static boolean reforgeable85(final Item it) {
        return it.level == 85 && !it.gaveleets;
    }

    /*
     * 100% FIXO (Eduardo, 2026-09-30, 3ª regra): a MELHOR Épica 90 possível com a mesma quantidade de
     * rolls da peça (rolls que teve + os que a raridade não tem): rolls perfeitos (8 pontos cada) + a maior
     * reforja possível nessa quantidade, espalhada em até 4 linhas (% comum em quantas quiser; CC, CD e
     * VEL uma linha cada; fixo fica de fora, rende menos). Não depende de como os rolls da peça caíram:
     * entre peças terminadas o rank acompanha o score; concentração e VEL 5 passam de 100%.
     */
    static double bestRef(final Rules r, final int total) {
        if (total <= 0) return 0;
        if (r.bestRefCache == null) r.bestRefCache = new HashMap<>();
        final Double hit = r.bestRefCache.get(total);
        if (hit != null) return hit;
        final String[] types = {"AttackPercent", "CriticalHitChancePercent", "CriticalHitDamagePercent", "Speed"};
        final int lines = Math.min(4, total);
        final double[] best = {0};
        final int[] n = new int[lines];
        final int[] t = new int[lines];
        bestAdd(r, types, total, lines, 0, n, t, best);
        final double v = total * perfectRoll(r) + best[0];
        r.bestRefCache.put(total, v);
        return v;
    }

    /* busca exaustiva (≤ 4 linhas, ≤ 6 rolls cada, 4 tipos): a maior soma de reforja */
    private static void bestAdd(final Rules r, final String[] types, final int left, final int lines, final int k,
                                final int[] n, final int[] t, final double[] best) {
        if (k == lines) {
            if (left != 0) return;
            for (int x = 0; x < lines; x++) for (int y = x + 1; y < lines; y++) if (t[x] > 0 && t[x] == t[y]) return;   // CC/CD/VEL: uma linha
            double add = 0;
            for (int x = 0; x < lines; x++) add += get(r.weights, types[t[x]]) * reforgeAdd(r.reforge, types[t[x]], n[x]);
            best[0] = Math.max(best[0], add);
            return;
        }
        for (int c = 1; c <= Math.min(6, left - (lines - k - 1)); c++) {
            n[k] = c;
            for (int ty = 0; ty < types.length; ty++) {
                t[k] = ty;
                bestAdd(r, types, left - c, lines, k + 1, n, t, best);
            }
        }
    }

    static double missing(final Rules r, final Item it) {
        return Math.max(0, get(r.rollsAt15, "Epic") - get(r.rollsAt15, it.rank));
    }

    /* o 100% dos SUBSTATUS: a melhor 90 com (rolls que a peça já teve + os que a raridade não tem) */
    static double reference(final Rules r, final Item it, final List<Sub> subs) {
        if (perfectRoll(r) <= 0) return 0;
        int n = 0;
        for (final Sub s : subs) n += rolls(s);
        return bestRef(r, n + (int) Math.round(missing(r, it)));
    }

    /* máximo de UM roll do stat na Épica 85 */
    static double perfect(final Rules r, final String type) {
        final Tier t = r.tiers == null ? null : r.tiers.get("85");
        if (t == null) return 0;
        double[] x = null;
        if (t.flat != null && t.flat.containsKey(type)) x = t.flat.get(type).get("Epic");
        else if (t.percent != null) x = t.percent.get(r.plainStats != null && r.plainStats.contains(type) ? "Plain" : type);
        return x != null && x.length >= 2 ? x[1] : 0;
    }

    /* o melhor roll da Épica 85, em pontos de score (peso × máximo) */
    static double perfectRoll(final Rules r) {
        if (r.weights == null) return 0;
        double best = 0;
        for (final String type : r.weights.keySet()) best = Math.max(best, get(r.weights, type) * perfect(r, type));
        return best;
    }

    static int rolls(final Sub s) {
        return s.rolls == null || s.rolls < 1 ? 1 : s.rolls;
    }

    static boolean isFlat(final String type) {
        return "Attack".equals(type) || "Defense".equals(type) || "Health".equals(type);
    }

    /* peso do SCORE do jogo: fixo escala com o poder da raridade (a faixa dele também escala) */
    static double scoreWeight(final Rules r, final Item it, final String type) {
        final double w = get(r.weights, type);
        if (!isFlat(type) || r.rankPower == null || !r.rankPower.containsKey(it.rank)) return w;
        return w * r.rankPower.get(it.rank);
    }

    static String tierKey(final Item it) {
        return it.level == 90 ? "90" : it.level == 88 ? "88" : "85";
    }

    static double mainPoints(final Rules r, final Item it) {
        if (it.main == null || it.main.type == null || r.mainMax == null || r.mainPct == null) return 0;
        // score do JOGO: o main da peça como ela é (sem reforja simulada)
        final double m = main15(r, String.valueOf(it.level), tierKey(it), it.main.type);
        if (m <= 0) return 0;
        return r.mainFactor * get(r.mainPct, tierKey(it)) * (it.main.value / m);
    }

    /* o que a reforja 85 → 90 soma no substatus (só depende do tipo e do nº de rolls) */
    static double reforgeAdd(final Reforge f, final String type, final int rolls) {
        if (f == null) return 0;
        final String n = String.valueOf(rolls);
        if (f.flatBonusPorRoll != null && f.flatBonusPorRoll.containsKey(type)) return f.flatBonusPorRoll.get(type) * rolls;
        if ("CriticalHitChancePercent".equals(type)) return rolls;
        if ("CriticalHitDamagePercent".equals(type)) return get(f.critDamageRollsToValue, n);
        if ("Speed".equals(type)) return get(f.speedRollsToValue, n);
        return get(f.plainStatRollsToValue, n);
    }

    static String statKey(final String type) {
        if (type == null) return null;
        switch (type) {
            case "Attack": case "AttackPercent": return "atk";
            case "Defense": case "DefensePercent": return "def";
            case "Health": case "HealthPercent": return "hp";
            case "Speed": return "spd";
            case "CriticalHitChancePercent": return "cr";
            case "CriticalHitDamagePercent": return "cd";
            case "EffectivenessPercent": return "eff";
            case "EffectResistancePercent": return "res";
            default: return null;
        }
    }

    private static double get(final Map<String, Double> m, final String k) {
        if (m == null || k == null) return 0;
        final Double v = m.get(k);
        return v == null ? 0 : v;
    }
}
