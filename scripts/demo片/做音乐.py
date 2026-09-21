#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""PeerProof demo 的主 BGM,程序化合成。

    /home/liyakun/miniconda3/bin/python 做音乐.py

## 为什么是手写合成而不是文生音乐模型

本机没有 musicgen / stable-audio 的权重,拉一套下来是几个 GB 加一堆折腾。
而且对这个需求来说,手写其实更合适:要的是**十一个精确到秒的阶段**,外加一个
贯穿全片、在不同阶段变形的 motif。文生模型给不了这种相位控制——它给你一段
好听的东西,但你没法说"第 116 秒音乐必须退到只剩低频脉冲"。

代价要说清楚:这不是作曲家写的曲子。它是一张**结构正确、混音克制、能直接铺在
片子底下**的床,而不是一首能单独拿出来听的作品。

## 结构

motif 是四个音,贯穿始终,每个阶段换一种呈现:
  P0 几乎听不见   P1 第一次明确(光束启动)  P2 变轻(发现)
  P4 变暖(到场)  P6 退到几乎消失(真实扫描)  P6b 重新打开(verified)
  P10 完整收束

响度按要求做到 integrated -16-~-18 LUFS、true peak < -1 dBTP,
**留足动态给后期 duck**。不做砖墙限幅。

## 混音上的一条实测教训

不要用单遍 loudnorm 去压到目标响度——本机验过,它压不准。
正确做法是**先量,再施一个固定增益**,量完再复核。这个脚本只负责产出未归一化的
音频,响度归一化在外面用 ffmpeg 两遍法做。
"""
import numpy as np
import os
import wave

SR = 48000
BPM = 104.0
BEAT = 60.0 / BPM          # 0.577s
BAR = BEAT * 4

OUT = os.path.expanduser("~/文档/Monad_Circle/出片/audio_final/music")

# ── 音高 ──────────────────────────────────────────────────────────────────
# D 小调。暖、不甜、不悲——正好是"技术底下有人"的那个位置。
def hz(semi_from_a4):
    return 440.0 * (2.0 ** (semi_from_a4 / 12.0))

D3, F3, A3, C4 = hz(-19), hz(-16), hz(-12), hz(-9)
D4, E4, F4, G4, A4, C5, D5 = hz(-7), hz(-5), hz(-4), hz(-2), hz(0), hz(3), hz(5)

# 四个音的 motif。简单到能被记住,是整首曲子的身份。
MOTIF = [A4, D5, C5, F4]

# 和声进行,每 2 小节换一次。Dm - Bb - F - C,最常见也最稳。
CHORDS = [
    (D3, [D4, F4, A4]),
    (hz(-21), [hz(-18), hz(-14), hz(-7)]),    # Bb
    (F3, [F4, A4, C5]),
    (C4, [C5, E4, G4]),
]


def env(n, a, d, s, r, sus=0.7):
    """ADSR。全部按秒给,函数内换算成采样点。"""
    a, d, r = int(a * SR), int(d * SR), int(r * SR)
    s_n = max(0, n - a - d - r)
    return np.concatenate([
        np.linspace(0, 1, a, endpoint=False) if a else np.array([]),
        np.linspace(1, sus, d, endpoint=False) if d else np.array([]),
        np.full(s_n, sus),
        np.linspace(sus, 0, r) if r else np.array([]),
    ])[:n]


def tone(f, dur, kind="sine", detune=0.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    if kind == "sine":
        w = np.sin(2 * np.pi * f * t)
    elif kind == "tri":
        w = 2 * np.abs(2 * ((f * t) % 1.0) - 1) - 1
    elif kind == "saw":
        w = 2 * ((f * t) % 1.0) - 1
    if detune:
        w = 0.6 * w + 0.4 * np.sin(2 * np.pi * f * (1 + detune) * t)
    return w


def lp(x, cutoff):
    """一阶低通。够用了——这里要的是"把毛刺磨掉",不是精确滤波器。"""
    a = np.exp(-2 * np.pi * cutoff / SR)
    y = np.empty_like(x)
    acc = 0.0
    for i in range(len(x)):
        acc = (1 - a) * x[i] + a * acc
        y[i] = acc
    return y


def lp_fast(x, cutoff):
    """上面那个循环对 3 分钟的音频太慢。用 FFT 做一个软性斜坡衰减,听感接近。"""
    X = np.fft.rfft(x)
    f = np.fft.rfftfreq(len(x), 1 / SR)
    X *= 1.0 / (1.0 + (f / max(cutoff, 1.0)) ** 2)
    return np.fft.irfft(X, len(x))


def place(buf, x, at):
    i = int(at * SR)
    n = min(len(x), len(buf) - i)
    if n > 0:
        buf[i:i + n] += x[:n]


# ── 音色 ──────────────────────────────────────────────────────────────────
def pad(f_list, dur, amp=1.0):
    n = int(dur * SR)
    out = np.zeros(n)
    for f in f_list:
        out += tone(f, dur, "saw", detune=0.004) * 0.33
        out += tone(f * 0.5, dur, "tri") * 0.12
    out = lp_fast(out, 900)
    return out * env(n, 1.2, 0.8, 0, 1.6, sus=0.8) * amp


def pluck(f, dur=0.5, amp=1.0, bright=1.0):
    n = int(dur * SR)
    w = tone(f, dur, "tri") * 0.7 + tone(f * 2, dur, "sine") * 0.25 * bright
    return w * env(n, 0.002, 0.12, 0, dur - 0.13, sus=0.25) * amp


def sub(f, dur, amp=1.0):
    n = int(dur * SR)
    return tone(f, dur, "sine") * env(n, 0.01, 0.06, 0, dur - 0.08, sus=0.55) * amp


def kick(amp=1.0):
    n = int(0.22 * SR)
    t = np.arange(n) / SR
    f = 110 * np.exp(-t * 26) + 44
    w = np.sin(2 * np.pi * np.cumsum(f) / SR)
    return w * np.exp(-t * 11) * amp


def perc(dur=0.06, amp=1.0, tone_hz=5200):
    n = int(dur * SR)
    rng = np.random.default_rng(7)
    w = rng.standard_normal(n)
    w = w - lp_fast(w, tone_hz)          # 高通:噪声减去它的低频
    return w * np.exp(-np.arange(n) / SR * 55) * amp


def shimmer(dur, amp=1.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    out = np.zeros(n)
    for f, a in ((D5 * 2, 0.5), (A4 * 2, 0.35), (F4 * 4, 0.2)):
        out += np.sin(2 * np.pi * f * t + np.sin(2 * np.pi * 0.07 * t) * 3) * a
    return out * env(n, 2.0, 1.0, 0, 2.0, sus=0.7) * amp


# ── 阶段表 ────────────────────────────────────────────────────────────────
# (开始秒, 名字, 强度参数)  —— 强度决定每层出不出、出多少
PHASES = [
    (0.0,   "P0 人物问题",      dict(pad=0.30, sub=0.00, motif=0.05, kick=0.0,  hat=0.0,  warm=0.0, shim=0.10)),
    (15.0,  "P1 光束启动",      dict(pad=0.42, sub=0.55, motif=0.55, kick=0.55, hat=0.35, warm=0.0, shim=0.22)),
    (38.0,  "P2 发现",          dict(pad=0.38, sub=0.32, motif=0.40, kick=0.26, hat=0.42, warm=0.0, shim=0.26)),
    (60.0,  "P3 报名/押金",      dict(pad=0.36, sub=0.30, motif=0.30, kick=0.22, hat=0.22, warm=0.0, shim=0.20)),
    (80.0,  "P4 到场",          dict(pad=0.44, sub=0.40, motif=0.45, kick=0.34, hat=0.20, warm=0.55, shim=0.18)),
    (102.0, "P5 会场码",        dict(pad=0.36, sub=0.38, motif=0.28, kick=0.30, hat=0.46, warm=0.22, shim=0.14)),
    (116.0, "P6 真实扫描(退后)", dict(pad=0.22, sub=0.26, motif=0.00, kick=0.10, hat=0.0,  warm=0.0, shim=0.06)),
    (136.0, "P6b 验证成功",     dict(pad=0.52, sub=0.44, motif=0.62, kick=0.30, hat=0.22, warm=0.40, shim=0.40)),
    (142.0, "P7 公开记录",      dict(pad=0.44, sub=0.34, motif=0.26, kick=0.16, hat=0.08, warm=0.20, shim=0.30)),
    (160.0, "P8 结算",          dict(pad=0.34, sub=0.28, motif=0.14, kick=0.12, hat=0.26, warm=0.10, shim=0.16)),
    (174.0, "P9 主办方结果",     dict(pad=0.46, sub=0.36, motif=0.40, kick=0.22, hat=0.14, warm=0.34, shim=0.26)),
    (184.0, "P10 片尾",         dict(pad=0.56, sub=0.46, motif=0.70, kick=0.24, hat=0.10, warm=0.42, shim=0.46)),
]
TOTAL = 192.0          # 3:12,给剪辑留空间


def level(t, key):
    """某一时刻某一层的强度。阶段之间用 1.5 秒线性过渡,避免硬切。"""
    for i, (start, _, p) in enumerate(PHASES):
        nxt = PHASES[i + 1][0] if i + 1 < len(PHASES) else 1e9
        if start <= t < nxt:
            v = p[key]
            if i + 1 < len(PHASES) and nxt - t < 1.5:
                v2 = PHASES[i + 1][2][key]
                k = (1.5 - (nxt - t)) / 1.5
                v = v * (1 - k) + v2 * k
            return v
    return 0.0


def render(warm_bias=0.0, seed=11):
    """warm_bias>0 = Alt 版:有机打击多一点、电子味少一点。"""
    rng = np.random.default_rng(seed)
    n = int(TOTAL * SR)
    L = np.zeros(n)
    R = np.zeros(n)

    # 垫底和声:每 2 小节一个和弦
    t = 0.0
    ci = 0
    while t < TOTAL:
        root, notes = CHORDS[ci % len(CHORDS)]
        d = BAR * 2
        a = level(t, "pad")
        if a > 0.01:
            p = pad(notes, d + 1.5, amp=a * 0.30)
            place(L, p * 0.95, t)
            place(R, np.roll(p, 220) * 0.95, t)      # 轻微展宽
        s = level(t, "shim")
        if s > 0.01:
            sh = shimmer(d + 1.0, amp=s * 0.07)
            place(L, np.roll(sh, 400), t)
            place(R, sh, t)
        t += d
        ci += 1

    # 低频脉冲:每拍一次,半拍时值
    t = 0.0
    ci = 0
    while t < TOTAL:
        root, _ = CHORDS[int(t // (BAR * 2)) % len(CHORDS)]
        a = level(t, "sub")
        if a > 0.01:
            s = sub(root, BEAT * 0.55, amp=a * 0.42)
            place(L, s, t)
            place(R, s, t)
        t += BEAT
        ci += 1

    # 底鼓:1、3 拍
    t = 0.0
    while t < TOTAL:
        a = level(t, "kick")
        if a > 0.01:
            k = kick(amp=a * 0.55)
            place(L, k, t)
            place(R, k, t)
        t += BEAT * 2
        ci += 1

    # 高频细碎打击:八分音符,随机漏拍,免得像节拍器
    t = 0.0
    while t < TOTAL:
        a = level(t, "hat")
        if a > 0.01 and rng.random() > 0.25:
            h = perc(amp=a * 0.16 * (0.6 + 0.4 * rng.random()))
            pan = rng.random() * 0.5 + 0.25
            place(L, h * (1 - pan), t)
            place(R, h * pan, t)
        t += BEAT * 0.5

    # 有机打击(Alt 版更多):反拍上的软手鼓
    if warm_bias > 0:
        t = BEAT * 1.5
        while t < TOTAL:
            a = level(t, "warm")
            if a > 0.01:
                w = perc(dur=0.10, amp=a * 0.13 * warm_bias, tone_hz=1400)
                place(L, w * 0.7, t)
                place(R, w, t)
            t += BEAT * 2

    # 温暖层:到场之后出现的中低频铺垫
    t = 0.0
    while t < TOTAL:
        a = level(t, "warm")
        if a > 0.01:
            root, notes = CHORDS[int(t // (BAR * 2)) % len(CHORDS)]
            w = pluck(notes[0] * 0.5, BEAT * 1.6, amp=a * 0.16, bright=0.3)
            place(L, w, t)
            place(R, np.roll(w, 300), t)
        t += BAR

    # motif:四个音,每两小节走一遍。这是全片的身份。
    t = 0.0
    while t < TOTAL:
        a = level(t, "motif")
        if a > 0.01:
            for i, f in enumerate(MOTIF):
                at = t + i * BEAT * 0.75
                aa = level(at, "motif")
                if aa > 0.01:
                    p = pluck(f, BEAT * 1.1, amp=aa * 0.22, bright=1.0 - warm_bias * 0.4)
                    pan = 0.4 + i * 0.05
                    place(L, p * (1 - pan + 0.5), at)
                    place(R, p * (pan + 0.1), at)
        t += BAR * 2

    # 片尾自然衰减,不要硬切
    tail = int(1.4 * SR)
    ramp = np.linspace(1, 0, tail) ** 1.6
    L[-tail:] *= ramp
    R[-tail:] *= ramp
    # 开头 2 秒淡入,免得第一个和弦是"啪"一下进来的
    fi = int(2.0 * SR)
    L[:fi] *= np.linspace(0, 1, fi)
    R[:fi] *= np.linspace(0, 1, fi)
    return L, R


def write24(path, L, R):
    """24-bit stereo WAV。numpy 没有 int24,所以手工拆字节。"""
    peak = max(np.abs(L).max(), np.abs(R).max())
    # 留 6dB 余量,响度归一化在外面用 ffmpeg 两遍法做
    g = (10 ** (-6 / 20)) / max(peak, 1e-9)
    st = np.stack([L * g, R * g], axis=1)
    ints = np.clip(st * (2 ** 23 - 1), -(2 ** 23), 2 ** 23 - 1).astype(np.int32)
    b = np.empty((ints.shape[0], ints.shape[1], 3), dtype=np.uint8)
    b[..., 0] = ints & 0xFF
    b[..., 1] = (ints >> 8) & 0xFF
    b[..., 2] = (ints >> 16) & 0xFF
    with wave.open(path, "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(3)
        w.setframerate(SR)
        w.writeframes(b.tobytes())


if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    for name, warm, seed in (("PeerProof_Demo_BGM_master_raw.wav", 0.0, 11),
                             ("PeerProof_Demo_BGM_alt_raw.wav", 1.0, 29)):
        L, R = render(warm_bias=warm, seed=seed)
        p = os.path.join(OUT, name)
        write24(p, L, R)
        print("  %-42s %.1fs  %.1fMB" % (name, TOTAL, os.path.getsize(p) / 1048576))
    print("\n阶段时间点:")
    for s, nm, _ in PHASES:
        print("  %6.1fs  %s" % (s, nm))
