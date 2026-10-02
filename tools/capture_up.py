#!/usr/bin/env python3
"""
capture_up.py — captura LOCAL do tráfego do Epic Seven durante ups de peça (fase E4, só pesquisa).

Diferente do scanner.py do app (que junta tudo por ack e perde direção/conexão/horário), este guarda
CADA pacote com horário, sentido, portas, seq/ack, e as MARCAS que você digita ("+3 bota, caiu VEL 4").
É isso que permite achar a resposta do up e testar se o keystream do login a decifra (nota 07).

NADA é enviado para fora. Saída em Documents/FribbelsOptimizerSaves/audit/up-<data>.json (+ .pcap).
O arquivo tem dado da conta (sessão, nick): NÃO commitar, NÃO colar em lugar nenhum.

Uso (terminal como ADMINISTRADOR):
    python tools/capture_up.py
Digite uma marca + Enter a cada passo; "fim" + Enter termina.
"""
import json, os, sys, threading, time
from datetime import datetime

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data", "py"))
from scapy.all import sniff, wrpcap, get_working_ifaces, IP, TCP, Raw  # noqa: E402

FILTER = "tcp and (port 5222 or port 3333)"
GAME_PORTS = (5222, 3333)
packets, raw = [], []
lock = threading.Lock()


def on_packet(p):
    if IP not in p or TCP not in p:
        return
    t = p[TCP]
    load = bytes(p[Raw].load) if Raw in p else b""
    with lock:
        raw.append(p)
        packets.append({
            "t": float(p.time),
            "dir": "in" if t.sport in GAME_PORTS else "out",      # in = servidor → jogo
            "src": f"{p[IP].src}:{t.sport}", "dst": f"{p[IP].dst}:{t.dport}",
            "seq": t.seq, "ack": t.ack, "flags": str(t.flags),
            "hex": load.hex(),
        })


def main():
    out_dir = os.path.join(os.path.expanduser("~"), "Documents", "FribbelsOptimizerSaves", "audit")
    os.makedirs(out_dir, exist_ok=True)
    base = os.path.join(out_dir, "up-" + datetime.now().strftime("%Y%m%d-%H%M%S"))

    threading.Thread(daemon=True, target=lambda: sniff(
        iface=get_working_ifaces(), filter=FILTER, prn=on_packet, store=False)).start()

    marks = []
    print("Capturando (" + FILTER + "). Nada sai deste PC.")
    print("Digite uma marca e Enter a cada passo. 'fim' termina.\n")
    while True:
        try:
            note = input("marca> ").strip()
        except EOFError:
            note = "fim"
        with lock:
            n = len(packets)
            data = sum(1 for x in packets if x["hex"])
        marks.append({"t": time.time(), "note": note, "packets": n})
        print(f"   ok ({n} pacotes até agora, {data} com dados)")
        if note.lower() == "fim":
            break

    time.sleep(1)  # deixa chegar o que estava no caminho
    with lock:
        json.dump({"marks": marks, "packets": packets}, open(base + ".json", "w", encoding="utf-8"))
        if raw:
            wrpcap(base + ".pcap", raw)
    print(f"\nSalvo: {base}.json ({len(packets)} pacotes)")
    if not packets:
        print("NENHUM pacote: rode o terminal como Administrador e confira se o Npcap está instalado.")
    os._exit(0)


if __name__ == "__main__":
    main()
