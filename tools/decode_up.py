#!/usr/bin/env python3
"""
decode_up.py — decifra LOCALMENTE uma captura do capture_up.py e lista os ups de peça (fase E4).

Como o jogo cifra (descoberto em 2026-09-30, nota 07):
  - toda resposta do servidor (porta 3333) = XOR com UMA tabela fixa de 256 bytes, começando numa
    rotação diferente por mensagem;
  - cabeçalho de 12 bytes: [4 ?][4 tamanho descompactado LE][4 tamanho do resto LE] + bloco LZ4 → msgpack.
A tabela sai por frequência de qualquer resposta grande (login); a rotação de cada mensagem é a que faz
o cabeçalho bater com o tamanho. Nada é enviado para fora; nada da conta é impresso além dos ups.

Uso:  python tools/decode_up.py <up-*.json>
"""
import collections, json, os, sys
import msgpack


KEY = os.path.join(os.path.expanduser("~"), "Documents", "FribbelsOptimizerSaves", "audit", "key256.hex")


def streams_of(cap):
    by = collections.OrderedDict()
    for p in cap["packets"]:
        if p["hex"]:
            by.setdefault((p["src"], p["dst"], p["dir"]), {})[p["seq"]] = (p["t"], bytes.fromhex(p["hex"]))
    return [(min(t for t, _ in v.values()), k[2], b"".join(v[s][1] for s in sorted(v))) for k, v in by.items()]


def table_from(big):
    return bytes(collections.Counter(big[i::256]).most_common(1)[0][0] for i in range(256))


def lz4_block(src):
    out, i = bytearray(), 0
    while i < len(src):
        tok = src[i]; i += 1
        n = tok >> 4
        if n == 15:
            while True:
                v = src[i]; i += 1; n += v
                if v != 255: break
        out += src[i:i + n]; i += n
        if i >= len(src): break
        off = src[i] | src[i + 1] << 8; i += 2
        n = tok & 15
        if n == 15:
            while True:
                v = src[i]; i += 1; n += v
                if v != 255: break
        for _ in range(n + 4): out.append(out[-off])
    return bytes(out)


def decode(msg, T):
    for r in range(256):
        h = bytes(msg[i] ^ T[(i + r) % 256] for i in range(12))
        if len(msg) > 12 and int.from_bytes(h[8:12], "little") == len(msg) - 12:
            body = bytes(c ^ T[(i + r) % 256] for i, c in enumerate(msg))[12:]
            raw = lz4_block(body)
            if len(raw) == int.from_bytes(h[4:8], "little"):
                return msgpack.unpackb(raw, raw=False, strict_map_key=False)
    return None


def main(path):
    ss = sorted(streams_of(json.load(open(path, encoding="utf-8"))), key=lambda s: s[0])
    big = max((s for s in ss if s[1] == "in"), key=lambda s: len(s[2]))[2]
    # tabela: aprende de um login na captura e guarda; sem login, usa a guardada (é fixa entre sessões)
    if len(big) >= 20000:
        T = table_from(big)
        open(KEY, "w").write(T.hex())
    elif os.path.exists(KEY):
        T = bytes.fromhex(open(KEY).read().strip())
    else:
        sys.exit("Sem tabela guardada e sem login na captura: capture uma vez abrindo o jogo.")
    t0 = ss[0][0]
    for t, d, m in ss:
        if d != "in": continue
        x = decode(m, T)
        if not isinstance(x, dict): continue
        # up de uma peça: {equip, op}; botões "+N níveis": {equip_data: [{equip, op, enhanced}]}
        for e in ([x] if "equip" in x and "op" in x else x.get("equip_data") or []):
            print(f"{t - t0:6.1f}s  peça {e['equip']}  +{e.get('enhanced', '?')}  main {e['op'][0]}  ops {e['op'][1:]}")


if __name__ == "__main__":
    main(sys.argv[1])
