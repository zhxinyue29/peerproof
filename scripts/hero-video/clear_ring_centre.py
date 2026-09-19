# -*- coding: utf-8 -*-
"""把 hero 正中央那行手写字抹掉,给动效序列腾出位置。

分镜要求清单卡和落款按顺序出现在环的正中,可那块地方原本烤着一行英文手写字
"Proof comes from peers." —— 既占地方,又是烤死在像素里的英文,站点是中英双语,
换不了语言。抹掉之后这两样都改用 SVG 画,能排时序也能翻译。

**只抹这一块。**三张 "You were here / Verified" 卡片一概保留:它们不挡任何一拍,
是这张图本来的样子。试过把四块一起抹,两条路都失败,记在这里免得再走一遍:

  cv2.inpaint(TELEA) —— 卡片的辉光比卡片本体大一圈,TELEA 把辉光往外抹,
                        留下一眼可见的矩形鬼影。
  SDXL 重绘         —— 提示词里写了 "purple haze and bokeh",它照办了:在四个
                        掩码块里画出四团亮粉紫色的方块,比鬼影还糟。

这里用的是**带掩码的归一化卷积**:被抹掉的像素 = 周围没被抹的像素的大范围加权
平均。手写字底下是纯暗渐变、没有结构,所以填出来是连续的,没有边界可循。最后补
一层颗粒,否则那块会比周围干净得反常。

    python3 scripts/hero-video/clear_ring_centre.py
"""
import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

# 读的是留档的原图,不是 web/public 里已经处理过的那张 —— 否则重跑一次就是在
# 已经抹平的地方再抹一次,脚本也就不再能从头复现这个素材了。
SRC = "scripts/hero-video/hero-source.webp"
OUT = "web/public/hero.webp"
OUT_SM = "web/public/hero-sm.webp"

# 手写字连同它右下那个箭头。画得比字大一圈,让羽化有地方过渡。
POLY = [(346, 346), (672, 346), (672, 600), (346, 600)]
SIGMA = 60.0   # 取样半径:要比被抹区域大,否则中心填不到有效信息
GRAIN = 2.0    # 颗粒强度,按原图暗部噪声量给


def main():
    src = Image.open(SRC).convert("RGB")
    a = np.asarray(src, np.float32)
    h, w, _ = a.shape

    m = Image.new("L", (w, h), 0)
    ImageDraw.Draw(m).polygon(POLY, fill=255)
    m = m.filter(ImageFilter.GaussianBlur(14))
    mask = np.asarray(m, np.float32) / 255.0
    keep = 1.0 - mask

    num = cv2.GaussianBlur(a * keep[..., None], (0, 0), SIGMA)
    den = cv2.GaussianBlur(keep, (0, 0), SIGMA)[..., None]
    fill = num / np.maximum(den, 1e-6)

    out = a * (1 - mask[..., None]) + fill * mask[..., None]
    out += np.random.default_rng(7).normal(0, GRAIN, (h, w, 1)) * mask[..., None]
    out = np.clip(out, 0, 255).astype("uint8")

    plate = Image.fromarray(out)
    plate.save(OUT, "WEBP", quality=86, method=6)
    # 手机上这是文字下面的一条窄带,全尺寸的像素是下载来扔掉的。
    plate.resize((860, 494), Image.LANCZOS).save(OUT_SM, "WEBP", quality=84, method=6)
    print(f"{OUT} {Image.open(OUT).size}  {OUT_SM} {Image.open(OUT_SM).size}")


if __name__ == "__main__":
    main()
