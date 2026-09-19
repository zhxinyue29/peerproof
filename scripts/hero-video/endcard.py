#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""循环的最后一秒:一行字从左往右揭开,占满画面,然后回到开头。

## 揭开,不是淡入

用户要的是「像幻灯片里从左往右出现」。淡入是整行同时变亮,读起来是一张图片在
显影;左右揭开是字**被写出来**,眼睛会跟着那条边走 —— 这是同一句话的两种语气,
而这句话是整条片子的落款。

揭开的边不是硬切,带一段柔化过渡(WIPE_SOFT),否则那条竖边自己会变成画面里最
显眼的东西。

## 为什么最后还要淡出

用户说「占满画面然后再循环」。字停在满屏、下一帧跳回没有字的开头,那是一次硬跳。
所以最后四帧把字快速收掉,回到场景本身,再由已有的交叉淡化接回第 1 帧。观感上
仍然是「最后一秒出字」,但循环处不会啪地一下。

## 字从哪来

优先用 ~/桌面/字.png(用户自己做的那张,透明底)。没有就用站点自己的 Montserrat
800 现渲一张,配同样的紫蓝渐变和下方那道扫尾 —— 不是为了以假乱真,是为了在拿到
素材之前,整套时间轴和合成都能先验证完。
"""
import os
import subprocess

import cv2
import numpy as np

FRAMES = "/tmp/loopout"          # 已经做好循环的帧
OUT = "/tmp/endcard"
USER_ART = os.path.join(os.path.dirname(os.path.abspath(__file__)), "endcard-art.png")
FALLBACK = "/tmp/endcard_text.png"

TEXT = "Real Participation, Real Rewards"

WIPE_FROM = 64                   # 0 基。90 帧 @24fps,从这里到结尾约一秒
WIPE_LEN = 17                    # 揭开用多少帧
HOLD = 5                         # 满屏停留
FADE = 4                         # 收掉
WIPE_SOFT = 90                   # 揭开那条边的柔化宽度(像素)


def render_fallback(w, h):
    """没有素材时,用站点自己的字体现渲一张。浏览器渲染,因为字体是 woff2,而且
    渐变和描边写 CSS 比用 PIL 拼快得多。"""
    fonts = os.path.expanduser(
        "~/文档/Monad_Circle/web/node_modules/@fontsource/montserrat/files"
    )
    html = f"""<!doctype html><meta charset="utf-8">
<style>
 @font-face{{font-family:M;font-weight:800;src:url('file://{fonts}/montserrat-latin-800-normal.woff2') format('woff2')}}
 html,body{{margin:0;background:transparent}}
 .w{{width:{w}px;height:{h}px;display:flex;flex-direction:column;
     align-items:center;justify-content:center;gap:18px}}
 .t{{font-family:M,sans-serif;font-weight:800;font-size:{int(w*0.094)}px;
     line-height:1.06;text-align:center;letter-spacing:-.02em;
     background:linear-gradient(103deg,#c9b6ff 0%,#a9c6ff 34%,#7fb6ff 58%,#b49bff 82%,#e0b3ff 100%);
     -webkit-background-clip:text;background-clip:text;color:transparent;
     filter:drop-shadow(0 0 26px rgba(150,120,255,.55))}}
 .u{{width:{int(w*0.46)}px;height:{int(w*0.008)}px;border-radius:999px;
     background:linear-gradient(90deg,#4fa8ff,#8b7cff 55%,#e08cff);
     filter:drop-shadow(0 0 18px rgba(130,110,255,.7))}}
</style>
<div class="w"><div class="t">Real Participation,<br>Real Rewards</div><div class="u"></div></div>"""
    open("/tmp/endcard.html", "w").write(html)
    js = f"""import {{ chromium }} from "playwright";
const b = await chromium.launch();
const p = await b.newPage({{ viewport: {{ width: {w}, height: {h} }} }});
await p.goto("file:///tmp/endcard.html");
await p.waitForTimeout(700);
await p.screenshot({{ path: "{FALLBACK}", omitBackground: true }});
await b.close();"""
    # 写进仓库而不是 /tmp:ESM 是按**文件所在位置**往上找 node_modules 的,不是按
    # 工作目录,所以放在 /tmp 里的脚本无论 cwd 设成什么都找不到 playwright。
    mjs = os.path.expanduser("~/文档/Monad_Circle/scripts/_endcard_render.mjs")
    open(mjs, "w").write(js)
    try:
        subprocess.run(["node", mjs], check=True)
    finally:
        os.unlink(mjs)
    return FALLBACK


def main():
    files = sorted(f for f in os.listdir(FRAMES) if f[0].isdigit())
    assert files, f"{FRAMES} 里没有帧"
    h, w = cv2.imread(os.path.join(FRAMES, files[0])).shape[:2]
    os.makedirs(OUT, exist_ok=True)

    art_path = USER_ART if os.path.exists(USER_ART) else render_fallback(w, h)
    print("用的字:", art_path)
    art = cv2.imread(art_path, cv2.IMREAD_UNCHANGED)
    assert art is not None, f"读不出 {art_path}"

    if art.shape[2] == 3:
        # 白底的素材没有 alpha。把接近白的地方当成背景抠掉 —— 用户那张是白底的。
        g = cv2.cvtColor(art, cv2.COLOR_BGR2GRAY)
        a = 255 - cv2.threshold(g, 238, 255, cv2.THRESH_BINARY)[1]
        art = np.dstack([art, a])

    # 等比放进画面,留出边距
    # 占满画面,这是用户的原话。0.86/0.62 那一版字只占中间一小块,读起来是「画面上
    # 有一行字」,不是「这一秒属于这句话」。
    # 按**可见带**排版,不是按整幅画面。首屏那条视频左侧有一道 107° 斜向渐隐
    # (从 14% 淡到 34%),右边到视口边缘为止 —— 所以真正看得见的是 34%–100%,
    # 中心在 67%、宽度 66%。居中 + 放大到 0.80 的那一版,左边被渐隐吃掉、右边顶出
    # 视口,两头都缺。
    scale = min(w * 0.56 / art.shape[1], h * 0.52 / art.shape[0])
    art = cv2.resize(art, (int(art.shape[1] * scale), int(art.shape[0] * scale)),
                     interpolation=cv2.INTER_LANCZOS4)
    # 往右偏,不居中。首屏那条视频的左侧有一道 107° 的斜向渐隐(为了让画面能挪到
    # 标语句号旁边而不压到入口卡上),居中的字卡左半边正好落在渐隐里,"Real
    # Participation," 的开头会糊掉。右移 9% 之后整句都在看得见的区域内。
    canvas = np.zeros((h, w, 4), np.uint8)
    ox = (w - art.shape[1]) // 2 + int(w * 0.17)
    oy = (h - art.shape[0]) // 2
    canvas[oy:oy + art.shape[0], ox:ox + art.shape[1]] = art

    xs = np.arange(w, dtype=np.float32)[None, :]

    for i, name in enumerate(files):
        img = cv2.imread(os.path.join(FRAMES, name)).astype(np.float32)
        t = i - WIPE_FROM
        if t >= 0:
            if t < WIPE_LEN:
                edge = (t + 1) / WIPE_LEN * (w + WIPE_SOFT) - WIPE_SOFT
                wipe = np.clip((edge - xs) / WIPE_SOFT, 0, 1)
            elif t < WIPE_LEN + HOLD:
                wipe = np.ones((1, w), np.float32)
            else:
                k = (t - WIPE_LEN - HOLD + 1) / FADE
                wipe = np.full((1, w), max(0.0, 1 - k), np.float32)

            a = (canvas[:, :, 3:4].astype(np.float32) / 255.0) * wipe[..., None]
            # 字底下把画面压暗一点,否则亮部上的浅色字读不出来 —— 和流星那里同一个道理。
            dim = cv2.GaussianBlur((a[:, :, 0] * 255).astype(np.uint8), (0, 0), 40)
            img *= 1 - (dim[..., None].astype(np.float32) / 255.0) * 0.72
            img = img * (1 - a) + canvas[:, :, :3].astype(np.float32) * a

        cv2.imwrite(os.path.join(OUT, "%03d.png" % (i + 1)),
                    np.clip(img, 0, 255).astype(np.uint8))

    print("合成完成 ->", OUT, f"({len(files)} 帧)")


if __name__ == "__main__":
    main()
