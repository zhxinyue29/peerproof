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
import numpy as np
import glob
import os

SRC = os.path.expanduser("~/ComfyUI-H3/output/peerproof_shot3/l_00001_.mp4")
FRAMES = "/tmp/sl"
OUT = "/tmp/meteor"
REF = 60                      # 目标坐标是在这一帧(0 基)上读的
ORIGIN = (512, 417)           # 她的手机
TARGETS = [(150, 320), (200, 313), (293, 313), (827, 320), (887, 313)]
# 每颗的出发帧,错开
STARTS = [8, 20, 32, 44, 56]
FLIGHT = 22                   # 飞行帧数
TRAIL = 9                     # 拖尾采样点
ARC = 150                     # 抛物线抬高量(像素)


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

        for k, (tgt, s0) in enumerate(zip(TARGETS, STARTS)):
            t = (i - s0) / FLIGHT
            if t < 0 or t > 1.25:
                continue
            dst = warp(tgt, M)
            scale = np.hypot(M[0, 0], M[0, 1])

            if t <= 1.0:
                # 拖尾:沿路径回采几个点,越靠后越小越淡。一条尾,不是一串球。
                for j in range(TRAIL):
                    tt = t - j * 0.035
                    if tt < 0:
                        break
                    p = bezier(o, dst, tt, ARC * scale)
                    fade = (1 - j / TRAIL) ** 2
                    r = max(1, int((7 - j * 0.6) * scale))
                    cv2.circle(glow, (int(p[0]), int(p[1])), r,
                               (255 * fade, 245 * fade, 210 * fade), -1, cv2.LINE_AA)
            else:
                # 到达:一圈扩散然后没了,而不是啪地消失
                a = (t - 1.0) / 0.25
                r = int((6 + 26 * a) * scale)
                v = int(230 * (1 - a))
                cv2.circle(glow, (int(dst[0]), int(dst[1])), r, (v, v, v * 0.9), 2, cv2.LINE_AA)

        glow = cv2.GaussianBlur(glow, (0, 0), 6)
        # screen 混合:光是加上去的,不是盖上去的
        out = 255 - (255 - img) * (255 - glow) / 255
        cv2.imwrite(f"{OUT}/{i+1:03d}.png", np.clip(out, 0, 255).astype(np.uint8))

    print("合成完成 ->", OUT)


if __name__ == "__main__":
    main()
