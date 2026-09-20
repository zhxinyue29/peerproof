#!/usr/bin/env python3
"""ssh → ssh.github.com:443 through the local HTTP proxy.

Ignores the host ssh asks for: the remote is `git@github.com`, and github.com:22 times out during
the banner exchange on this machine while ssh.github.com:443 — GitHub's documented fallback — goes
through the proxy's CONNECT cleanly.
"""
import socket, sys, threading

s = socket.create_connection(("127.0.0.1", 7897), timeout=20)
s.sendall(b"CONNECT ssh.github.com:443 HTTP/1.1\r\nHost: ssh.github.com:443\r\n\r\n")
buf = b""
while b"\r\n\r\n" not in buf:
    c = s.recv(1)
    if not c:
        sys.exit(1)
    buf += c
if b"200" not in buf.split(b"\r\n")[0]:
    sys.stderr.write(buf.decode(errors="replace"))
    sys.exit(1)

stop = threading.Event()

def up():
    try:
        while not stop.is_set():
            d = sys.stdin.buffer.read1(65536)
            if not d:
                break
            s.sendall(d)
    except Exception:
        pass
    stop.set()

t = threading.Thread(target=up)
t.daemon = True
t.start()
try:
    while not stop.is_set():
        d = s.recv(65536)
        if not d:
            break
        sys.stdout.buffer.write(d)
        sys.stdout.buffer.flush()
except Exception:
    pass
stop.set()
