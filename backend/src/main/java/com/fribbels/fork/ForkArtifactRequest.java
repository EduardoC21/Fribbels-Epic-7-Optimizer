package com.fribbels.fork;

import java.util.List;

/**
 * FORK — corpo de POST /fork/artifactStats: { "items": [ { "name": "...", "level": 15 }… ] }
 * Devolve ATK/HP/DEF de cada artefato no nível pedido, pela tabela do backend.
 */
public class ForkArtifactRequest {
    public List<Item> items;

    public static class Item {
        public String name;
        public int level;
    }
}
