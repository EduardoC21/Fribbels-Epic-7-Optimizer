#!/usr/bin/env python3
"""
escuta.py (fork) — ouve o tráfego do Epic Seven NESTE PC e traduz em eventos para a janela do fork.
Nada sai do PC. Protocolo na nota 07 (tabela fixa de 256 bytes com rotação por mensagem + LZ4 + msgpack).

Pasta de troca: Documents/FribbelsOptimizerSaves/escuta/
  eventos.jsonl   uma linha por evento (o app lê o que for novo):
                    {"tipo":"login"}  → inventario.json foi regravado
                    {"tipo":"up","pecas":[{"id","op","enhanced"?,"exp"}]}   (lote: na ordem da GRADE do jogo)
                    {"tipo":"removidas","ids":[…],"como":"vender"|"extrair"|"outro"}
                    {"tipo":"equipou","peca","heroi","saiu"}   {"tipo":"tirou","pecas":[…]}
                    {"tipo":"novas","pecas":[peça crua…],"cmd"}   peça inteira depois do login: nova (drop, craft,
                      loja) ou ALTERADA (reforja = cmd upgrade_equip; pedra?) — o app decide pelo id. Antes: (drop, craft,
                      loja…): qualquer resposta com dicionário no formato da peça do login (id, code "e…", op, f)
                    {"tipo":"aviso","texto"}
  inventario.json {"em", "equips":[…], "units":[…]} cru do login (só isso; sessão/conta ficam fora)
  estado.json     batimento a cada 2 s {pid, desde, agora, pacotes, eventos, tabela}
  parar           o app cria → a escuta termina (ela roda como admin; o app não pode matá-la)
  key256.hex      a tabela (aprendida de um login; fixa entre sessões)

Uso: python escuta.py            (como administrador; o app chama por escuta.cmd)
     python escuta.py --replay <capture up-*.json>   (testa o mesmo caminho com uma captura gravada)
"""
import collections, json, os, sys, threading, time

import msgpack

DIR = os.path.join(os.path.expanduser("~"), "Documents", "FribbelsOptimizerSaves", "escuta")
KEY = os.path.join(DIR, "key256.hex")
OLD_KEY = os.path.join(os.path.dirname(DIR), "audit", "key256.hex")
GAME_PORTS = (5222, 3333)
BIG = 20000  # resposta grande = login/carga (tabela sai por frequência dela)


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


def xor(b, T, r):
    return bytes(c ^ T[(i + r) % 256] for i, c in enumerate(b))


def decode_in(msg, T):
    """resposta do servidor: [4 ?][4 tam. descompactado LE][4 tam. do resto LE] + LZ4 → msgpack"""
    if len(msg) <= 12: return None
    for r in range(256):
        h = xor(msg[:12], T, r)
        if int.from_bytes(h[8:12], "little") == len(msg) - 12:
            try:
                raw = lz4_block(xor(msg, T, r)[12:])
                if len(raw) == int.from_bytes(h[4:8], "little"):
                    return msgpack.unpackb(raw, raw=False, strict_map_key=False)
            except Exception:
                pass
    return None


def decode_out(msg, T):
    """pedido do cliente: [1 ?][1 0][2 tam.−4 BIG-endian] + msgpack"""
    for r in range(256):
        h = xor(msg[:4], T, r)
        if int.from_bytes(h[2:4], "big") == len(msg) - 4:
            try:
                return msgpack.unpackb(xor(msg, T, r)[4:], raw=False, strict_map_key=False)
            except Exception:
                pass
    return None


def expected_in_len(buf, T):
    """tamanho total que a resposta terá (pelo cabeçalho), ou None se ainda não dá para saber"""
    if len(buf) < 12: return None
    best = None
    for r in range(256):
        n = int.from_bytes(xor(buf[:12], T, r)[8:12], "little") + 12
        if n == len(buf): return n
        if len(buf) < n < 64 << 20 and (best is None or n < best): best = n
    return best


class Escuta:
    def __init__(self, out=True):
        self.T = None
        for p in (KEY, OLD_KEY):
            if os.path.exists(p):
                self.T = bytes.fromhex(open(p).read().strip()); break
        self.out = out
        self.bufs = {}          # (src,dst) → {seq: bytes}
        self.cmd_by_conn = {}   # porta do cliente → cmd do último pedido
        self.packets = 0
        self.events = 0
        self.lock = threading.Lock()

    # ---------- saída ----------
    def emit(self, ev):
        self.events += 1
        line = json.dumps(dict(ev, em=time.time()), ensure_ascii=False)
        if self.out:
            with open(os.path.join(DIR, "eventos.jsonl"), "a", encoding="utf-8") as f: f.write(line + "\n")
        else:
            print(line)

    def save_inventory(self, ad):
        inv = {"em": time.time(), "equips": list((ad.get("equips") or {}).values()), "units": list((ad.get("units") or {}).values())}
        if self.out:
            tmp = os.path.join(DIR, "inventario.json.tmp")
            json.dump(inv, open(tmp, "w", encoding="utf-8"), default=str)
            os.replace(tmp, os.path.join(DIR, "inventario.json"))
        self.emit({"tipo": "login", "pecas": len(inv["equips"]), "herois": len(inv["units"])})

    # ---------- pacotes ----------
    def packet(self, src, dst, sport, seq, flags, load):
        self.packets += 1
        key = (src, dst)
        incoming = sport in GAME_PORTS
        with self.lock:
            if load:
                self.bufs.setdefault(key, {})[seq] = load
            parts = self.bufs.get(key)
            if not parts: return
            buf = b"".join(parts[s] for s in sorted(parts))
            if incoming:
                self.try_in(key, buf, "F" in flags)
            else:
                self.try_out(key, buf)

    def try_out(self, key, buf):
        if self.T is None: return
        x = decode_out(buf, self.T)
        if isinstance(x, dict):
            self.cmd_by_conn[key[0]] = x.get("cmd")
            self.bufs.pop(key, None)

    def try_in(self, key, buf, fin):
        if self.T is None:
            # sem tabela: só um login grande ensina (frequência por coluna)
            if fin and len(buf) >= BIG:
                self.T = bytes(collections.Counter(buf[i::256]).most_common(1)[0][0] for i in range(256))
                if self.out: open(KEY, "w").write(self.T.hex())
            else:
                return
        n = expected_in_len(buf, self.T)
        if n is None or (len(buf) < n and not fin): return
        x = decode_in(buf, self.T)
        if x is None:
            if fin: self.bufs.pop(key, None)
            return
        self.bufs.pop(key, None)
        self.handle(x, self.cmd_by_conn.pop(key[1], None))

    # ---------- tradução ----------
    def handle(self, x, cmd):
        if not isinstance(x, dict) or x.get("res") != "ok": return
        ad = x.get("account_data")
        if isinstance(ad, dict) and isinstance(ad.get("equips"), dict):
            self.save_inventory(ad); return
        novas = []
        def walk(v):
            if isinstance(v, dict):
                if isinstance(v.get("code"), str) and v["code"].startswith("e") and "id" in v and "op" in v and v.get("f"):
                    novas.append(v); return
                for w in v.values(): walk(w)
            elif isinstance(v, list):
                for w in v: walk(w)
        walk(x)
        if novas:
            self.emit({"tipo": "novas", "pecas": novas, "cmd": cmd})
        if "equip_data" in x:
            self.emit({"tipo": "up", "pecas": [{k: e.get(k) for k in ("equip", "op", "enhanced", "exp")} for e in x["equip_data"]]})
            return
        if "equip" in x and "op" in x:
            self.emit({"tipo": "up", "pecas": [{"equip": x["equip"], "op": x["op"], "exp": x.get("exp")}]})
            # remove_list do up = peças usadas como material
        if x.get("remove_list"):
            como = {"sell_equips": "vender", "alchemist_point_extract": "extrair"}.get(cmd, "outro")
            self.emit({"tipo": "removidas", "ids": x["remove_list"], "como": como})
        if "putoff_equip" in x and "unit" in x and "equip" in x and "op" not in x:
            self.emit({"tipo": "equipou", "peca": x["equip"], "heroi": x["unit"], "saiu": x.get("putoff_equip") or None})
        elif cmd == "putoff_equip" and x.get("equips"):
            self.emit({"tipo": "tirou", "pecas": x["equips"]})


def heartbeat(e, since):
    while True:
        st = {"pid": os.getpid(), "desde": since, "agora": time.time(), "pacotes": e.packets, "eventos": e.events, "tabela": e.T is not None}
        tmp = os.path.join(DIR, "estado.json.tmp")
        json.dump(st, open(tmp, "w")); os.replace(tmp, os.path.join(DIR, "estado.json"))
        if os.path.exists(os.path.join(DIR, "parar")) or time.time() - since > 6 * 3600:
            try: os.remove(os.path.join(DIR, "parar"))
            except OSError: pass
            st["fim"] = time.time(); json.dump(st, open(os.path.join(DIR, "estado.json"), "w"))
            os._exit(0)
        time.sleep(2)


def replay(path):
    cap = json.load(open(path, encoding="utf-8"))
    e = Escuta(out=False)
    for p in sorted(cap["packets"], key=lambda p: p["t"]):
        e.packet(p["src"], p["dst"], int(p["src"].rsplit(":", 1)[1]), p["seq"], p["flags"], bytes.fromhex(p["hex"]))


def live():
    sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "py"))
    import subprocess
    subprocess.run(["net", "start", "npcap"], capture_output=True)   # o serviço volta a STOPPED sozinho
    from scapy.all import sniff, get_working_ifaces, IP, TCP, Raw
    os.makedirs(DIR, exist_ok=True)
    try: os.remove(os.path.join(DIR, "parar"))
    except OSError: pass
    e = Escuta()
    threading.Thread(target=heartbeat, args=(e, time.time()), daemon=True).start()
    ifs = get_working_ifaces()
    if not ifs:
        e.emit({"tipo": "aviso", "texto": "Nenhuma placa de rede visível: o Npcap não iniciou (precisa de administrador)."})
        time.sleep(3); os._exit(1)

    def on(p):
        if IP in p and TCP in p:
            t = p[TCP]
            e.packet(f"{p[IP].src}:{t.sport}", f"{p[IP].dst}:{t.dport}", t.sport, t.seq, str(t.flags),
                     bytes(p[Raw].load) if Raw in p else b"")
    sniff(iface=ifs, filter="tcp and (port 5222 or port 3333)", prn=on, store=False)


if __name__ == "__main__":
    if len(sys.argv) > 2 and sys.argv[1] == "--replay":
        replay(sys.argv[2])
    else:
        try:
            live()
        except Exception:
            # roda escondida como admin: o erro vai para um arquivo que o app mostra
            import traceback
            os.makedirs(DIR, exist_ok=True)
            open(os.path.join(DIR, "erro.log"), "a", encoding="utf-8").write(traceback.format_exc())
            raise
