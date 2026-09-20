#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""从设计稿里**量**出真实色值，而不是并排看一眼。

    python3 scripts/稿子取色.py docs/设计稿/参加者.png 0.595 0 1 0.565

为什么要有这个脚本：并排对比图只能查出**能被命名的东西**——有没有这个模块、
它在哪一栏。描边比稿子亮一倍没有名字，所以永远不会被说出来，也就永远不会被查。
2026-09-20 用户问「为什么每次都只做模块的对比校对，图片颜色光影框的线都不管」，
根因就是这个：连续五轮「一比一」，我一个像素都没取过。

方法上的三条，都是那次踩出来的：

1. **别猜坐标。** 第一次我按比例猜取样点，11 个点有 9 个落在页面底色上，
   量出来一片 #07162 8。要按颜色全图搜，或者先定位元素边界。
2. **大面积取样会混进辉光。** 搜「描边」搜到 33197 个像素、中位 #322571，
   那是按钮和徽标周围的紫色辉光，不是线。真正的描边**横切一刀只有一个像素**。
3. **先验白点。** 稿子若整体偏色，抄进去就把它的偏色也抄了。
   最亮像素应接近 (255,255,255)，最暗接近 (0,0,0)。
"""
import sys
import numpy as np
from PIL import Image


def hexs(c):
    return "#%02x%02x%02x" % tuple(int(v) for v in c)


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        return 1
    path = sys.argv[1]
    box = [float(v) for v in sys.argv[2:6]] if len(sys.argv) >= 6 else [0, 0, 1, 1]

    im = Image.open(path).convert("RGB")
    W, H = im.size
    p = im.crop((int(W * box[0]), int(H * box[1]), int(W * box[2]), int(H * box[3])))
    a = np.asarray(p).astype(int)
    h, w, _ = a.shape

    flat = a.reshape(-1, 3)
    lum = flat.sum(1)
    white = np.median(flat[np.argsort(lum)[-400:]], axis=0)
    black = np.median(flat[np.argsort(lum)[:400]], axis=0)
    print("白点 %s   黑点 %s" % (hexs(white), hexs(black)))
    if abs(white.mean() - 255) > 12 or black.mean() > 12:
        print("  ⚠ 这张稿子整体偏色，下面的数值别直接抄进色板")
    print()

    # 表面色：横切卡片边缘。这是唯一能把「页面底 / 描边 / 卡片底」三者分开的办法——
    # 描边只有一个像素宽，任何区域取样都会把它平均掉。
    # **从右往左扫**。左栏第一件东西通常是封面照片，任何穿过它的行都会把照片边缘
    # 当成卡片描边报出来（实测 y=169 报 #352caf、y=203 报 #4d2943，都是封面里的颜色）。
    # 右栏是纯卡片，没有图片可以骗人。
    print("从右往左找卡片描边（页面底 → 描边 → 卡片底）：")
    hits = []
    for yf in [0.20 + i * 0.03 for i in range(14)]:
        y = int(h * yf)
        lumr = a[y].sum(1) / 3
        for x in range(w - 4, int(w * 0.5), -1):
            if lumr[x - 1] - lumr[x] > 12 and lumr[x - 2] > lumr[x] + 6:
                hits.append((a[y, x], a[y, x - 1], a[y, max(x - 8, 0)]))
                break
    if hits:
        bg = np.median([hh[0] for hh in hits], axis=0)
        ln = np.median([hh[1] for hh in hits], axis=0)
        cd = np.median([hh[2] for hh in hits], axis=0)
        print("  %d 行取中位： 页面底 %s → 描边 %s → 卡片底 %s"
              % (len(hits), hexs(bg), hexs(ln), hexs(cd)))
        print("  描边比卡片底亮 %.0f（这个差值就是「框的线有多重」）"
              % (ln.mean() - cd.mean()))

    print()
    R, G, B = a[..., 0], a[..., 1], a[..., 2]

    def top(mask, score, label, n=400):
        ys, xs = np.nonzero(mask)
        if len(ys) == 0:
            print("  %-12s 没找到" % label)
            return
        idx = np.argsort(score[ys, xs])[-n:]
        med = np.median(a[ys[idx], xs[idx]], axis=0)
        note = "  ← 面积大，可能混了辉光" if mask.sum() > 20000 else ""
        print("  %-12s %s   命中 %d 像素%s" % (label, hexs(med), mask.sum(), note))

    print("按颜色全图搜（别猜坐标）：")
    top((B > 140) & (R > 80) & (B - G > 60), B + R - G, "主色/紫")
    top((G > 150) & (G - R > 50) & (G - B > 20), G - R, "成功/绿")
    top((R > 170) & (R - B > 70) & (G > 90), R - B, "警告/金")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
