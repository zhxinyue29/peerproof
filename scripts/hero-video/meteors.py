#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""往第三镜上画流星:一颗光点从她的手机飞向场内几个人,到了就散掉。

## 为什么是画的而不是生成的

扩散模型给不了有目的地的运动。今晚三轮下来它只在一条片子里偶然生出过一个光点,
而「飞到那个人手里、拖一条尾、到了就消失」是精确编排,不是它能被要求的东西。

这和在山海经里画从一座山飞到另一座山的箭头是同一件事 —— 唯一多出来的麻烦是
**镜头在动**,所以目标点也得跟着动。

## 跟踪为什么逐帧累积

直接算「第 1 帧 → 第 N 帧」的仿射在这条片子上不可靠:镜头后拉到 0.656、平移
±175px,ORB 内点只有 24/300。但**相邻两帧几乎一样**,帧间仿射稳,把它们依次
乘起来就得到任意帧的变换。这是标准做法,也是自动跟踪在这里唯一能用的形态。

某一帧解不出来就沿用上一帧的,而不是退回原点 —— 退回原点会让整条流星抽搐一下,
那比慢慢飘更难看。

## 目标点怎么定的

人工在第 61 帧上读的,读的是**人**不是手机:自动找手机把灯架上的聚光灯当成了
手机(面积最大的几个候选都在 y<70)。五个点,错开发射,不同时到 —— 一起放就是
一堆小球乱跑。
"""
import cv2
import math
import numpy as np
import glob
import os

SRC = os.path.expanduser("~/ComfyUI-H3/output/peerproof_shot3/l_00001_.mp4")
FRAMES = "/tmp/sl"
OUT = "/tmp/meteor"
REF = 60                      # 目标坐标是在这一帧(0 基)上读的
ORIGIN = (512, 417)           # 她的手机
# 分裂点。她的头顶在 y≈290,所以这里比头顶还高出约一个人的高度,球是真的飞上去了,
# 不是在胸前晃一下。
APEX = (512, 116)
TARGETS = [(150, 320), (200, 313), (293, 313), (827, 320), (887, 313)]

RISE_FROM, RISE_TO = 6, 30    # 升起
FLY_FROM, FLY_TO = 30, 62     # 分裂之后一起飞
TRAIL = 56                    # 拖尾采样点:尾巴更长,才化得开
TRAIL_STEP = 0.010            # 取样步长:必须小到相邻两点重叠,否则光带断成珠子
# 每条弧的抬高量各不相同。都用同一个数的那一版,五条弧在同一高度到顶,叠成了
# 一道横着的光杠 —— 看起来是一条线,不是五颗球。外侧的抛得高,内侧的抛得低。
#
# 数值比上一版小得多:分裂点抬到 y=116 之后,再抛 150 像素就冲出画外了,弧线只剩
# 两头在画面里,中间那截看不见。
ARCS = [64, 40, 18, 40, 64]
# 出发时间也各差几帧。完全同步像机械装置;差几帧才像一件事散开。
DELAYS = [0, 3, 6, 3, 0]

# 绿色,不是白色。这套设计里绿色专指「客观已验证」——不是泛泛的成功色,而正是
# 这颗球要表达的东西:有人给你作证了。核心浅、拖尾深,才有光的层次。
# OpenCV 是 BGR。
CORE = (150, 255, 180)
TAIL = (70, 215, 110)


def affines(files):
    """逐帧累积:返回每帧相对参考帧的 2x3 仿射。"""
    orb = cv2.ORB_create(3000)
    bf = cv2.BFMatcher(cv2.NORM_HAMMING, crossCheck=True)
    grays = [cv2.imread(f, cv2.IMREAD_GRAYSCALE) for f in files]
    feats = [orb.detectAndCompute(g, None) for g in grays]

    def step(i, j):
        (k0, d0), (k1, d1) = feats[i], feats[j]
        if d0 is None or d1 is None:
            return None
        m = sorted(bf.match(d0, d1), key=lambda x: x.distance)[:400]
        if len(m) < 12:
            return None
        p0 = np.float32([k0[x.queryIdx].pt for x in m]).reshape(-1, 1, 2)
        p1 = np.float32([k1[x.trainIdx].pt for x in m]).reshape(-1, 1, 2)
        M, _ = cv2.estimateAffinePartial2D(p0, p1, method=cv2.RANSAC, ransacReprojThreshold=3)
        return M

    def compose(A, B):
        """先 A 再 B。2x3 补成 3x3 相乘再砍回去。"""
        A3 = np.vstack([A, [0, 0, 1]])
        B3 = np.vstack([B, [0, 0, 1]])
        return (B3 @ A3)[:2]

    n = len(files)
    out = [None] * n
    out[REF] = np.float32([[1, 0, 0], [0, 1, 0]])
    for i in range(REF + 1, n):
        M = step(i - 1, i)
        out[i] = out[i - 1] if M is None else compose(out[i - 1], M)
    for i in range(REF - 1, -1, -1):
        M = step(i + 1, i)
        out[i] = out[i + 1] if M is None else compose(out[i + 1], M)
    return out


def warp(pt, M):
    x, y = pt
    return (M[0, 0] * x + M[0, 1] * y + M[0, 2], M[1, 0] * x + M[1, 1] * y + M[1, 2])


def bezier(a, b, t, arc):
    """抛物线:控制点在中点上方,所以球是抛过去的,不是直线飞过去的。"""
    cx = (a[0] + b[0]) / 2
    cy = min(a[1], b[1]) - arc
    u = 1 - t
    return (u * u * a[0] + 2 * u * t * cx + t * t * b[0],
            u * u * a[1] + 2 * u * t * cy + t * t * b[1])


def main():
    files = sorted(glob.glob(f"{FRAMES}/*.png"))
    assert files, f"没有帧,先把 {SRC} 抽成 {FRAMES}/%03d.png"
    os.makedirs(OUT, exist_ok=True)
    Ms = affines(files)
    print(f"逐帧累积完成,共 {len(files)} 帧")

    for i, f in enumerate(files):
        img = cv2.imread(f).astype(np.float32)
        glow = np.zeros_like(img)
        M = Ms[i]
        o = warp(ORIGIN, M)

        scale = np.hypot(M[0, 0], M[0, 1])
        apex = warp(APEX, M)

        def spark(center, r, color, strength=1.0):
            """一颗球画三层:大而淡的光晕、中层、亮核。
            单层实心圆就是个圆点,怎么调都是「一个白球」;光是有层次的,远处淡、
            中间有体积、中心过曝,三层叠起来才像发光体而不像贴纸。"""
            cx, cy = int(center[0]), int(center[1])
            for mul, a in ((3.2, 0.16), (1.8, 0.34), (1.0, 1.0)):
                v = a * strength
                cv2.circle(glow, (cx, cy), max(1, int(r * mul)),
                           (color[0] * v, color[1] * v, color[2] * v), -1, cv2.LINE_AA)

        def twinkles(center, r, seed, strength=1.0):
            """球周围几粒细碎的闪点。位置由 seed 决定而不是随机 —— 随机会让它们
            每帧乱跳,看着像噪点;按 seed 走,它们是围着球慢慢转的。"""
            for q in range(5):
                ang = seed * 0.7 + q * 1.257
                d = r * (2.0 + 0.9 * math.sin(seed * 0.31 + q))
                px = int(center[0] + math.cos(ang) * d)
                py = int(center[1] + math.sin(ang) * d)
                a = (0.35 + 0.65 * abs(math.sin(seed * 0.5 + q * 2.1))) * strength
                cv2.circle(glow, (px, py), max(1, int(r * 0.22)),
                           (CORE[0] * a, CORE[1] * a, CORE[2] * a), -1, cv2.LINE_AA)

        def streak(path_at, t, width0, seed=0):
            """一道渐细、并且**按时间慢慢褪**的光带。
            之前尾巴只按位置变淡,头一过就没了,像一划而过的线。这里的 alpha 同时
            带一个时间项:越老的那一段褪得越多,所以尾巴是慢慢化掉的。"""
            pts = []
            for j in range(TRAIL):
                tt = t - j * TRAIL_STEP
                if tt < 0:
                    break
                q = path_at(tt)
                pts.append((int(q[0]), int(q[1])))
            for j in range(len(pts) - 1):
                age = j / TRAIL
                fade = (1 - age) ** 1.05          # 1.8 那版褪得太快,尾巴几乎看不见
                w = max(1, int((width0 * (1 - age * 0.72)) * scale))
                cv2.line(glow, pts[j], pts[j + 1],
                         (TAIL[0] * fade, TAIL[1] * fade, TAIL[2] * fade), w, cv2.LINE_AA)
                # 尾巴上零星几粒,越靠后越稀,像化开的星尘
                if j % 7 == 3 and age < 0.75:
                    cv2.circle(glow, pts[j], max(1, int(width0 * 0.18 * scale)),
                               (CORE[0] * fade, CORE[1] * fade, CORE[2] * fade), -1, cv2.LINE_AA)
            if pts:
                # 球本身会轻微呼吸,不是一个死大小
                pulse = 1.0 + 0.16 * math.sin(i * 0.55 + seed)
                spark(pts[0], max(2, width0 * 0.62 * scale * pulse), CORE)
                twinkles(pts[0], max(2, width0 * 0.62 * scale), i + seed * 13)

        # ── 升起 ──────────────────────────────────────────────────────────
        # 一颗球从手机直着上去,停在她头顶之上。先升后分,是为了让「一份证明」
        # 这件事有个主语 —— 五颗同时从手机射出来,看到的只是一团乱。
        if RISE_FROM <= i < FLY_FROM:
            t = (i - RISE_FROM) / (RISE_TO - RISE_FROM)
            t = min(1.0, t)
            ease = 1 - (1 - t) ** 2          # 出得快、到顶慢,像抛上去的
            streak(lambda u: (o[0] + (apex[0] - o[0]) * (1 - (1 - min(u, 1)) ** 2),
                              o[1] + (apex[1] - o[1]) * (1 - (1 - min(u, 1)) ** 2)),
                   ease, 13, seed=0)

        # ── 分裂的一瞬 ────────────────────────────────────────────────────
        if FLY_FROM - 2 <= i <= FLY_FROM + 3:
            a = abs(i - FLY_FROM) / 3.0
            spark(apex, max(3, (14 + 34 * a) * scale), CORE, strength=1 - a * 0.7)
            twinkles(apex, max(3, (16 + 30 * a) * scale), i * 2, strength=1 - a)

        # ── 一起飞出去 ────────────────────────────────────────────────────
        # 五颗同时出发、同时到,因为它们本来就是同一份证明散开的。
        if FLY_FROM <= i <= FLY_TO + 6:
            t = (i - FLY_FROM) / (FLY_TO - FLY_FROM)
            for idx, tgt in enumerate(TARGETS):
                tt = (i - FLY_FROM - DELAYS[idx]) / (FLY_TO - FLY_FROM)
                if tt < 0:
                    continue
                t = tt
                dst = warp(tgt, M)
                arc = ARCS[idx]
                if t <= 1.0:
                    streak(lambda u, d=dst, a=arc: bezier(apex, d, min(u, 1.0), a * scale), t, 11, seed=idx + 1)
                else:
                    a = min(1.0, (t - 1.0) / 0.25)
                    cv2.circle(glow, (int(dst[0]), int(dst[1])),
                               int((12 + 40 * a) * scale),
                               (TAIL[0] * (1 - a), TAIL[1] * (1 - a), TAIL[2] * (1 - a)),
                               max(2, int(5 * (1 - a) * scale)), cv2.LINE_AA)

        # 糊一层再叠一层没糊的:只糊会把亮度摊平(半径 7 配 sigma 6 那一版几乎看不见),
        # 只不糊又没有辉光。软的当光晕,硬的当核心。
        glow = cv2.GaussianBlur(glow, (0, 0), 9) * 0.9 + glow
        # screen 混合:光是加上去的,不是盖上去的
        out = 255 - (255 - img) * (255 - glow) / 255
        cv2.imwrite(f"{OUT}/{i+1:03d}.png", np.clip(out, 0, 255).astype(np.uint8))

    print("合成完成 ->", OUT)


if __name__ == "__main__":
    main()
