#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""H3 出片的机器验收。**只验能量化的三项:能不能解码、动不动、亮不亮。**

    /home/liyakun/miniconda3/bin/python 验收.py <视频...>

## 为什么这里没有「霓虹 / 配色」检查

试过三次,三次都不称职。写在这里,免得下次再写一遍:

1. **阈值严** —— 判「是不是薄荷绿」要求 `G-R>70`。R01 里楼顶勾的那圈绿霓虹是
   **细线**,抗锯齿之后颜色被稀释,一个都没触发,报 0.055% 说没问题,
   而肉眼一看满屏赛博朋克。
2. **阈值松** —— 开始**冤枉好片**。会场那块品牌紫渐变大屏被报成「洋红超标 3–4%」,
   而那正是设计要的东西。既漏报又误报的检查**比没有更糟**:它让人以为验过了。
3. **看空间结构** —— 只数「高饱和 + 落在强边缘 + 邻域偏暗」的像素,想借此把细霓虹线
   和大面积品牌渐变分开。结果:废片 0.095%,好片 0.101%。**分不开。**

根因不在阈值,在**面积**:那些霓虹勾在远处的小楼上,占全画面 0.1% ——
视觉上扎眼,统计上微不足道。**按面积算的指标抓不到「少但扎眼」的东西。**

所以配色、构图、人物一致性、手机方向、有没有乱码文字 —— **一律肉眼看**。
这个脚本不给这些打分,免得一个假的绿灯替代了真的检查。

顺带两条踩过的坑:

- 解码用 `/home/liyakun/bin/ffmpeg`,**不要用 `ffprobe`** —— PATH 上那个是 compat
  包装脚本,忽略 `-show_entries` 只回显时长,会把好文件判成坏的。
- 汇总不要写 `all(vet(p) for p in ...)` —— 生成器在第一个 False 处短路,
  后面的片子根本不会被验。第一次跑三条只打印了第一条。
"""
import glob
import os
import subprocess
import sys

import numpy as np
from PIL import Image


def frames(path, n=6):
    d = "/tmp/_vet_%d" % os.getpid()
    subprocess.run(["rm", "-rf", d])
    os.makedirs(d, exist_ok=True)
    sel = "+".join("eq(n\\,%d)" % (6 + i * 22) for i in range(n))
    subprocess.run(["/home/liyakun/bin/ffmpeg", "-v", "error", "-i", path,
                    "-vf", f"select='{sel}'", "-vsync", "0", f"{d}/f%d.png", "-y"], check=True)
    return sorted(glob.glob(f"{d}/f*.png"),
                  key=lambda p: int("".join(c for c in os.path.basename(p) if c.isdigit())))


def vet(path):
    name = os.path.basename(path)
    print(f"\n{name}")

    r = subprocess.run(["/home/liyakun/bin/ffmpeg", "-v", "error", "-i", path, "-f", "null", "-"],
                       capture_output=True, text=True)
    if r.returncode != 0:
        print("  解码失败 —— 文件是坏的")
        return False

    fs = frames(path)
    g = [np.asarray(Image.open(f).convert("L")).astype(int) for f in fs]
    motion = [float(np.abs(g[i] - g[i - 1]).mean()) for i in range(1, len(g))]
    bright = float(np.mean([x.mean() for x in g]))

    print("  解码    OK   %.1fMB" % (os.path.getsize(path) / 1048576))
    print("  运动量  %s" % " ".join("%.1f" % m for m in motion))
    print("  亮度    %.1f/255   (网页基准 39.6)" % bright)

    ok = True
    if min(motion) < 3:
        # 上一轮实测:废掉的 a2 只有 2.6–4.2,而好的 a1 是 11.9–14.6。
        # 低于 3 基本就是把人和机位一起锁死了,剪进片子里像幻灯片。
        print("  ⚠ 有一段几乎不动(帧差<3)—— 多半是「不许动」写宽了,把人也冻住了")
        ok = False
    if bright < 20:
        print("  ⚠ 偏暗 —— 投影或手机上可能看不清")
    return ok


if __name__ == "__main__":
    # 不能写 all(vet(p) for p in ...):生成器会短路,后面的片子不会被验。
    results = [vet(p) for p in sys.argv[1:]]
    print("\n机器验收:", "能量化的三项全过" if all(results) else "有项目没过,看上面")
    print("配色 / 构图 / 人物一致性 / 手机方向 / 乱码文字 —— 机器分不开,自己看画面")
    raise SystemExit(0 if all(results) else 1)
