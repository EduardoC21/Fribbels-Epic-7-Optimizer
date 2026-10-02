package com.fribbels.fork;

import com.fribbels.db.ArtifactStatsDb;
import com.fribbels.db.BaseStatsDb;
import com.fribbels.db.HeroDb;
import com.sun.net.httpserver.HttpServer;

/**
 * FORK — ponto ÚNICO de entrada do fork no backend. O Main.java do upstream só
 * ganha UMA linha chamando register(); todo o resto vive neste pacote.
 * Se um merge do upstream mexer no Main, basta recolocar essa linha.
 */
public final class ForkRoutes {

    private ForkRoutes() {
    }

    public static void register(final HttpServer server, final BaseStatsDb baseStatsDb,
                                final HeroDb heroDb, final ArtifactStatsDb artifactStatsDb) {
        server.createContext("/fork", new ForkHandler(
                new ForkStatCalculator(baseStatsDb, heroDb, artifactStatsDb),
                new ForkBonusWriter(heroDb, artifactStatsDb),
                artifactStatsDb));
        System.out.println("FORK ROUTES /fork (v" + ForkHandler.VERSION + ")");
    }
}
