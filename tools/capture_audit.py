#!/usr/bin/env python3
"""
capture_audit.py — Auditoria OFFLINE do que o auto-importer capturaria.

Roda o MESMO scanner que o app usa (data/py/scanner.py), guarda os streams
capturados em um arquivo local e analisa cada um: tamanho, entropia, magic bytes,
tentativas de descompressão (zlib/gzip/deflate) e strings legíveis, marcando
qualquer coisa que pareça token/sessão/e-mail/nickname.

NADA é enviado para lugar nenhum. Este script não abre conexão de rede alguma
(a única coisa "de rede" é o sniff local feito pelo scanner.py via Npcap/scapy).

Uso:
    python tools/capture_audit.py                       # captura + analisa
    python tools/capture_audit.py --nick MeuNick --email eu@x.com   # marca ocorrências dos seus dados
    python tools/capture_audit.py --analyze <capture-*.json>        # só re-analisa um arquivo salvo
    python tools/capture_audit.py --out C:\\pasta                    # muda a pasta de saída

Pré-requisitos: os mesmos do auto-importer (Python + Npcap no Windows / Wireshark+ChmodBPF no Mac).
Passos: feche o jogo -> Enter (começa a capturar) -> abra o jogo até o lobby -> Enter (para).
"""

import argparse
import datetime as _dt
import gzip
import hashlib
import json
import math
import os
import re
import subprocess
import sys
import zlib

# console do Windows costuma ser cp1252; o relatório tem bytes arbitrários em repr()
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SCANNER_DIR = os.path.join(REPO_ROOT, "data", "py")
SCANNER = os.path.join(SCANNER_DIR, "scanner.py")

SENSITIVE_WORDS = [
    "token", "session", "sessid", "auth", "passw", "secret", "apikey", "api_key",
    "email", "@", "nick", "uid", "user_id", "userid", "account", "acc_id",
    "device", "imei", "idfa", "gaid", "eyj",  # eyJ = JWT em base64
]

MAGIC = [
    (b"\x1f\x8b", "gzip"),
    (b"\x78\x01", "zlib (no/low compression)"),
    (b"\x78\x5e", "zlib"),
    (b"\x78\x9c", "zlib (default)"),
    (b"\x78\xda", "zlib (best)"),
    (b"\x16\x03", "TLS handshake record"),
    (b"\x17\x03", "TLS application data record"),
    (b"\x04\x22\x4d\x18", "lz4 frame"),
    (b"\x28\xb5\x2f\xfd", "zstd"),
    (b"<?xml", "XML"),
    (b"<stream", "XMPP stream (porta 5222)"),
    (b"{", "JSON object?"),
    (b"[", "JSON array?"),
]


# ----------------------------------------------------------------------------- captura
def npcap_preflight():
    """No Windows, o serviço 'npcap' precisa estar rodando, senão o scapy não vê interface nenhuma."""
    if os.name != "nt":
        return
    try:
        out = subprocess.run(["sc", "query", "npcap"], capture_output=True, text=True, errors="ignore").stdout
    except Exception:
        return
    if "RUNNING" in out.upper():
        return
    if "1060" in out or "FAILED" in out.upper():
        print("   [!] Npcap não parece instalado. Instale: https://nmap.org/npcap/ (mesmo requisito do auto-importer).")
        return
    print("   [!] O serviço Npcap está PARADO. Sem ele a captura vem vazia.")
    print("       Abra um PowerShell como Administrador e rode:  net start npcap")
    print("       (ou rode este script como Administrador). Depois volte aqui.")
    input("   Pressione Enter quando o serviço estiver rodando (ou para tentar mesmo assim)... ")


def run_capture():
    if not os.path.exists(SCANNER):
        sys.exit(f"scanner.py não encontrado em {SCANNER}")

    print("=" * 78)
    print("AUDITORIA DE CAPTURA — nada será enviado para fora desta máquina.")
    print("=" * 78)
    npcap_preflight()
    print("1) Deixe o emulador/Google Play Games aberto, mas FECHE o Epic Seven.")
    input("   Pressione Enter para COMEÇAR a captura... ")

    proc = subprocess.Popen(
        [sys.executable, SCANNER],
        cwd=SCANNER_DIR,
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        encoding="utf-8",
        errors="ignore",
        bufsize=1,
    )
    print("   Capturando (tcp port 5222 ou 3333)...")
    print("2) Abra o Epic Seven e espere carregar até o lobby.")
    input("   Pressione Enter para PARAR a captura e analisar... ")

    try:
        out, err = proc.communicate(input="E\n", timeout=120)
    except subprocess.TimeoutExpired:
        proc.kill()
        out, err = proc.communicate()
        print("   (scanner não respondeu em 120s, foi encerrado à força)")

    err = (err or "").strip()
    if err:
        # scapy é barulhento; mostra só as primeiras linhas
        print("   [stderr do scanner]", "\n   ".join(err.splitlines()[:8]))

    streams = [s.strip() for s in (out or "").split("&")]
    streams = [re.sub(r"\s", "", s) for s in streams]
    streams = [s for s in streams if s and "DONE" not in s]
    valid = []
    for s in streams:
        try:
            valid.append(bytes.fromhex(s))
        except ValueError:
            print(f"   [aviso] stream não-hex ignorado ({len(s)} chars)")
    return valid


# ----------------------------------------------------------------------------- análise
def entropy(b: bytes) -> float:
    if not b:
        return 0.0
    counts = [0] * 256
    for x in b:
        counts[x] += 1
    n = len(b)
    return -sum((c / n) * math.log2(c / n) for c in counts if c)


def printable_ratio(b: bytes) -> float:
    if not b:
        return 0.0
    return sum(1 for x in b if 32 <= x < 127 or x in (9, 10, 13)) / len(b)


def ascii_strings(b: bytes, min_len=6):
    return [m.decode("ascii", "ignore") for m in re.findall(rb"[\x20-\x7e]{%d,}" % min_len, b)]


def detect_magic(b: bytes):
    hits = [name for magic, name in MAGIC if b.startswith(magic)]
    return hits


def try_decompress(b: bytes):
    """Tenta várias formas de descompressão. Retorna lista de (método, bytes)."""
    results = []

    def attempt(name, fn):
        try:
            d = fn()
            if d and len(d) > 0:
                results.append((name, d))
        except Exception:
            pass

    attempt("gzip", lambda: gzip.decompress(b))
    attempt("zlib", lambda: zlib.decompress(b))
    attempt("deflate-raw", lambda: zlib.decompress(b, -15))
    attempt("zlib-auto", lambda: zlib.decompress(b, 47))

    # cabeçalho proprietário + corpo zlib/gzip em algum offset inicial
    for off in range(1, min(64, len(b) - 2)):
        two = b[off:off + 2]
        if two in (b"\x78\x01", b"\x78\x5e", b"\x78\x9c", b"\x78\xda"):
            attempt(f"zlib@{off}", lambda o=off: zlib.decompressobj().decompress(b[o:]))
        if two == b"\x1f\x8b":
            attempt(f"gzip@{off}", lambda o=off: gzip.decompress(b[o:]))
        if len(results) >= 3:
            break
    return results


def looks_like(b: bytes) -> str:
    head = b.lstrip()[:1]
    if head in (b"{", b"["):
        try:
            json.loads(b.decode("utf-8"))
            return "JSON válido"
        except Exception:
            return "parece JSON (inválido/parcial)"
    if b[:1] and (0x80 <= b[0] <= 0x8F or b[0] in (0xDE, 0xDF)):
        return "possível msgpack (map)"
    if b[:1] and (0x90 <= b[0] <= 0x9F or b[0] in (0xDC, 0xDD)):
        return "possível msgpack (array)"
    if printable_ratio(b) > 0.9:
        return "texto"
    return "binário"


def flag_sensitive(strings, personal):
    flags = []
    for s in strings:
        low = s.lower()
        for w in SENSITIVE_WORDS:
            if w in low:
                flags.append((w, s[:120]))
                break
        for p in personal:
            if p and p.lower() in low:
                flags.append((f"SEU DADO '{p}'", s[:120]))
        if re.fullmatch(r"[A-Za-z0-9+/=_-]{32,}", s):
            flags.append(("string longa base64/hex (token?)", s[:120]))
    return flags


def analyze(streams, personal):
    lines = []
    total = sum(len(s) for s in streams)
    lines.append(f"Streams capturados: {len(streams)}   Total: {total:,} bytes")
    lines.append("")

    order = sorted(range(len(streams)), key=lambda i: -len(streams[i]))
    summary_flags = 0

    for rank, i in enumerate(order, 1):
        b = streams[i]
        ent = entropy(b)
        pr = printable_ratio(b)
        magic = detect_magic(b)
        lines.append("-" * 78)
        lines.append(f"#{rank:<3} stream[{i}]  {len(b):>9,} bytes  sha256={hashlib.sha256(b).hexdigest()[:12]}")
        lines.append(f"      entropia={ent:.2f}/8  printable={pr:.0%}  magic={magic or '-'}  tipo={looks_like(b)}")
        lines.append(f"      head hex : {b[:24].hex(' ')}")
        lines.append(f"      head asc : {b[:48].decode('ascii', 'replace')!r}")

        if ent > 7.5 and not magic:
            lines.append("      -> alta entropia sem magic conhecido: provavelmente CIFRADO (ou comprimido sem header).")

        dec = try_decompress(b)
        if dec:
            for name, d in dec:
                lines.append(f"      DESCOMPRIMIU via {name}: {len(d):,} bytes  tipo={looks_like(d)}  printable={printable_ratio(d):.0%}")
                lines.append(f"         preview: {d[:160].decode('utf-8', 'replace')!r}")
        else:
            lines.append("      não descomprimiu com gzip/zlib/deflate (inteiro ou com header curto)")

        raw_strings = ascii_strings(b)
        dec_strings = []
        for _, d in dec:
            dec_strings += ascii_strings(d)
        flags = flag_sensitive(raw_strings + dec_strings, personal)
        if raw_strings:
            lines.append(f"      strings legíveis (raw): {len(raw_strings)} — ex: {raw_strings[:5]}")
        if flags:
            summary_flags += len(flags)
            lines.append(f"      !!! {len(flags)} ocorrência(s) suspeita(s):")
            for w, s in flags[:15]:
                lines.append(f"         [{w}] {s!r}")
            if len(flags) > 15:
                lines.append(f"         ... e mais {len(flags) - 15}")

    lines.append("=" * 78)
    lines.append("RESUMO")
    lines.append(f"  streams: {len(streams)}  |  ocorrências suspeitas: {summary_flags}")
    big = [len(streams[i]) for i in order[:3]]
    lines.append(f"  3 maiores streams (bytes): {big}  — o inventário costuma estar no(s) maior(es).")
    if streams and all(entropy(s) > 7.5 and not try_decompress(s) for s in streams if len(s) > 64):
        lines.append("  Todos os streams grandes parecem cifrados/comprimidos sem header conhecido.")
        lines.append("  -> Decodificação local exigiria engenharia reversa do cliente. Próximo passo viável: 'envio mínimo'.")
    elif any(try_decompress(s) for s in streams):
        lines.append("  Pelo menos um stream descomprimiu com zlib/gzip -> decodificação local É viável. Vale investigar o formato interno.")
    lines.append("  Nenhum byte foi enviado para fora desta máquina por este script.")
    return "\n".join(lines)


# ----------------------------------------------------------------------------- main
def default_out_dir():
    docs = os.path.join(os.path.expanduser("~"), "Documents")
    return os.path.join(docs, "FribbelsOptimizerSaves", "audit")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--analyze", metavar="ARQUIVO", help="re-analisa um capture-*.json salvo (não captura)")
    ap.add_argument("--out", metavar="PASTA", default=default_out_dir(), help="pasta de saída")
    ap.add_argument("--nick", default="", help="seu nickname no jogo, para marcar ocorrências")
    ap.add_argument("--email", default="", help="seu e-mail STOVE, para marcar ocorrências")
    args = ap.parse_args()

    personal = [args.nick, args.email]
    if args.email and "@" in args.email:
        personal.append(args.email.split("@")[0])

    if args.analyze:
        with open(args.analyze, "r", encoding="utf-8") as f:
            data = json.load(f)
        streams = [bytes.fromhex(h) for h in data["streams"]]
        base = os.path.splitext(args.analyze)[0]
    else:
        streams = run_capture()
        os.makedirs(args.out, exist_ok=True)
        ts = _dt.datetime.now().strftime("%Y%m%d-%H%M%S")
        base = os.path.join(args.out, f"capture-{ts}")
        with open(base + ".json", "w", encoding="utf-8") as f:
            json.dump({"capturedAt": ts, "streams": [s.hex() for s in streams]}, f)
        print(f"\nStreams salvos em: {base}.json  (guarde/apague como quiser — contém o tráfego bruto)")

    if not streams:
        print("\nNenhum stream capturado. Verifique Npcap/Python (mesmos requisitos do auto-importer) e tente de novo.")
        return 1

    report = analyze(streams, personal)
    with open(base + "-report.txt", "w", encoding="utf-8") as f:
        f.write(report)
    print()
    print(report)
    print(f"\nRelatório salvo em: {base}-report.txt")
    return 0


if __name__ == "__main__":
    sys.exit(main())
