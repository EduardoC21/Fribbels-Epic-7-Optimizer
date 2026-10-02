package com.fribbels.fork;

import com.fribbels.db.ArtifactStatsDb;
import com.fribbels.model.ArtifactStats;
import com.google.gson.Gson;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * FORK — rotas /fork/*. Handler próprio (não estende o RequestHandler do upstream):
 * lê JSON, responde JSON, e erro vira { "error": "..." } com HTTP 500.
 *
 *   POST /fork/ping            -> { "ok": true, "version": N }
 *   POST /fork/calculateStats  -> { "results": [ ForkCalcResult… ] }
 *   POST /fork/gearNeeded      -> { "results": [ ForkGearResult… ] }
 *   POST /fork/setBonus        -> ForkBonusResult  (grava imprint/EE/artefato na conta)
 *   POST /fork/artifactStats   -> { "results": [ {name, level, attack, health, defense}… ] }
 *   POST /fork/itemRatings     -> { "results": [ ForkItemRatings.Result… ] }  (score do jogo, potencial, por perfil, gems)
 *   POST /fork/convertGame     -> { items, noLevel, noGear, families }  (peças cruas do jogo → item do app; ForkGameImport)
 *   POST /fork/mainCurve       { mains: [{type, base}] } -> { curves: [[main no +0 … +15]] }  (type/base = op[0] da peça)
 */
public class ForkHandler implements HttpHandler {

    public static final int VERSION = 16;   // v13: troca da pedra (gems); v14: gemMode; v15: os 4 modos juntos (byMode); v16: mainCurve
    private static final Gson GSON = new Gson();
    private final ForkStatCalculator calculator;
    private final ForkBonusWriter bonusWriter;
    private final ArtifactStatsDb artifactStatsDb;

    public ForkHandler(final ForkStatCalculator calculator, final ForkBonusWriter bonusWriter,
                       final ArtifactStatsDb artifactStatsDb) {
        this.calculator = calculator;
        this.bonusWriter = bonusWriter;
        this.artifactStatsDb = artifactStatsDb;
    }

    @Override
    public void handle(final HttpExchange exchange) throws IOException {
        final String path = exchange.getRequestURI().getPath();
        try {
            if ("/fork/ping".equals(path)) {
                final Map<String, Object> r = new HashMap<>();
                r.put("ok", true);
                r.put("version", VERSION);
                send(exchange, 200, GSON.toJson(r));
                return;
            }
            if ("/fork/calculateStats".equals(path)) {
                final ForkCalculateRequest req = GSON.fromJson(readBody(exchange), ForkCalculateRequest.class);
                final List<ForkBuildInput> builds = req == null || req.builds == null ? Collections.<ForkBuildInput>emptyList() : req.builds;
                final List<ForkCalcResult> results = new ArrayList<>();
                for (final ForkBuildInput b : builds) results.add(calculator.calculate(b));
                final Map<String, Object> r = new HashMap<>();
                r.put("results", results);
                send(exchange, 200, GSON.toJson(r));
                return;
            }
            if ("/fork/gearNeeded".equals(path)) {
                final ForkCalculateRequest req = GSON.fromJson(readBody(exchange), ForkCalculateRequest.class);
                final List<ForkBuildInput> builds = req == null || req.builds == null ? Collections.<ForkBuildInput>emptyList() : req.builds;
                final List<ForkGearResult> results = new ArrayList<>();
                for (final ForkBuildInput b : builds) results.add(calculator.gearNeeded(b));
                final Map<String, Object> r = new HashMap<>();
                r.put("results", results);
                send(exchange, 200, GSON.toJson(r));
                return;
            }
            if ("/fork/setBonus".equals(path)) {
                final ForkBonusRequest req = GSON.fromJson(readBody(exchange), ForkBonusRequest.class);
                send(exchange, 200, GSON.toJson(bonusWriter.write(req)));
                return;
            }
            if ("/fork/artifactStats".equals(path)) {
                final ForkArtifactRequest req = GSON.fromJson(readBody(exchange), ForkArtifactRequest.class);
                final List<Map<String, Object>> results = new ArrayList<>();
                if (req != null && req.items != null) {
                    for (final ForkArtifactRequest.Item it : req.items) {
                        final ArtifactStats a = artifactStatsDb.getArtifactStats(it.name, it.level);
                        final Map<String, Object> row = new HashMap<>();
                        row.put("name", it.name);
                        row.put("level", it.level);
                        row.put("attack", a.getAttack());
                        row.put("health", a.getHealth());
                        row.put("defense", a.getDefense());
                        results.add(row);
                    }
                }
                final Map<String, Object> r = new HashMap<>();
                r.put("results", results);
                send(exchange, 200, GSON.toJson(r));
                return;
            }
            if ("/fork/itemRatings".equals(path)) {
                final ForkItemRatings.Request req = GSON.fromJson(readBody(exchange), ForkItemRatings.Request.class);
                final Map<String, Object> r = new HashMap<>();
                r.put("results", ForkItemRatings.rate(req));
                send(exchange, 200, GSON.toJson(r));
                return;
            }
            if ("/fork/convertGame".equals(path)) {
                final ForkGameImport.Request req = GSON.fromJson(readBody(exchange), ForkGameImport.Request.class);
                send(exchange, 200, GSON.toJson(ForkGameImport.convert(req == null ? new ForkGameImport.Request() : req)));
                return;
            }
            if ("/fork/mainCurve".equals(path)) {
                final ForkGameImport.MainCurveRequest req = GSON.fromJson(readBody(exchange), ForkGameImport.MainCurveRequest.class);
                final Map<String, Object> r = new HashMap<>();
                r.put("curves", ForkGameImport.mainCurves(req == null ? new ForkGameImport.MainCurveRequest() : req));
                send(exchange, 200, GSON.toJson(r));
                return;
            }
            send(exchange, 404, error("rota do fork desconhecida: " + path));
        } catch (final RuntimeException e) {
            e.printStackTrace();
            send(exchange, 500, error(e.getMessage() == null ? e.toString() : e.getMessage()));
        }
    }

    private static String error(final String msg) {
        final Map<String, Object> r = new HashMap<>();
        r.put("error", msg);
        return GSON.toJson(r);
    }

    private static String readBody(final HttpExchange exchange) throws IOException {
        try (InputStream in = exchange.getRequestBody()) {
            final ByteArrayOutputStream buf = new ByteArrayOutputStream();
            final byte[] chunk = new byte[8192];
            int n;
            while ((n = in.read(chunk)) > 0) buf.write(chunk, 0, n);
            return new String(buf.toByteArray(), StandardCharsets.UTF_8);
        }
    }

    private static void send(final HttpExchange exchange, final int status, final String body) throws IOException {
        final byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().set("Content-Type", "application/json; charset=utf-8");
        exchange.sendResponseHeaders(status, bytes.length);
        try (OutputStream out = exchange.getResponseBody()) {
            out.write(bytes);
        }
    }
}
