#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""用 ACE-Step 1.5 生成三条 60-75 秒的 BGM concept,供挑方向。

    cd ~/ACE-Step-1.5 && .venv/bin/python <这个脚本>

**这一步只做推理**,不训练、不做 LoRA、不生成最终 3 分钟版。
三条方向:A 干净电子 / B 偏暖偏有机 / C 电影感的"信号旅行",都必须是纯器乐。

## 机器上的两条注意

- 走 XL turbo。官方自动分层在这台 3090 上认到 **tier6b**(23.56GiB,最长 480s,
  不开 CPU offload),正是推荐路线。不为极限质量换更慢的配置——这一步要的是
  连续性、贴提示词、出得快、能多生几版挑。
- **跑之前要把代理变量摘掉**。官方的 `run_generate_test.py` 开头就在 `os.environ.pop`
  http_proxy/https_proxy/all_proxy——本机这些变量常年指向 127.0.0.1:7897,
  留着会让本地推理去走代理。下载模型另走 HF 镜像,那是另一回事。
"""
import json
import os
import sys
import time

# 本地推理不走代理。必须在 import torch / acestep 之前做。
for v in ("http_proxy", "https_proxy", "all_proxy", "HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY"):
    os.environ.pop(v, None)
# 下模型走镜像,并关掉 xet——本机实测缺一个都会失败。
os.environ.setdefault("HF_ENDPOINT", "https://hf-mirror.com")
os.environ.setdefault("HF_HUB_DISABLE_XET", "1")

ROOT = os.path.expanduser("~/ACE-Step-1.5")
sys.path.insert(0, ROOT)

from loguru import logger  # noqa: E402
from acestep.handler import AceStepHandler  # noqa: E402
from acestep.llm_inference import LLMHandler  # noqa: E402
from acestep.inference import GenerationParams, GenerationConfig, generate_music  # noqa: E402

OUT = os.path.expanduser("~/文档/Monad_Circle/出片/audio_final/music")
DUR = 70          # 落在要求的 60-75 秒中段
BPM = 104         # 要求 100-112,避开 128 的 club 感

# 共同的正面描述。三条只在"质地"上分叉,骨架一样:
# 稀疏开场 → 信号启动 → 轻盈发现 → 变暖到场 → 退后验证 → 小抬升 → 收束。
COMMON = (
    "instrumental only, no vocals, no lyrics, no vocal chops. "
    "Premium technology product film score: modern, clean, human, credible, restrained, "
    "quietly optimistic, slightly cinematic. "
    "A simple recurring four-note synth motif is the identity of the whole piece: barely there in "
    "the sparse opening, stated clearly when the energy first starts, lighter during the middle, "
    "warmer later, and resolved fully at the end. "
    "Structure across the piece: it opens very sparse and almost ambient with no drums, leaving "
    "room for dialogue and feeling slightly unresolved; then a subtle electronic pulse and soft "
    "kick begin and the motif appears, like a signal starting to travel; then it lightens into a "
    "curious exploratory groove with digital plucks; then it becomes warmer and more human with "
    "organic percussion; then it pulls right back to a low pulse with almost no melody, leaving "
    "space; then a small clean harmonic lift brings the motif back; and it ends on a stable, "
    "bright but understated final chord with a natural decay. "
    f"About {BPM} BPM, half-time feel, unhurried, always leaving space for a narrator. "
    "Soft analog synth, clean digital pluck, subtle bass pulse, muted electronic kick, light "
    "percussion, airy pads, restrained arpeggio, glass texture, soft transient accents."
)

# 否定项。注意:这里的否定是给音乐模型的 caption,和视频那边的教训不一样——
# 音乐模型没有"名词即强信号"那个毛病,写清楚不要什么是有用的。
AVOID = (
    " Avoid: EDM, festival drops, supersaw, trap hi-hats, aggressive bass, dubstep, "
    "cyberpunk nightclub, crypto hype advertising, epic movie trailer brass, huge orchestral "
    "strings, rock guitar, corporate stock music, rap, any singing."
)

CONCEPTS = [
    ("A", 20260921, "clean electronic, premium technology, precise and airy; "
                    "synthetic textures lead, percussion is minimal and electronic. "),
    ("B", 77104329, "warmer and more human; organic hand percussion and wooden textures sit "
                    "alongside the synths, softer low end, more breath and room. "),
    ("C", 51839607, "more cinematic sense of a signal travelling across distance; wider pads, "
                    "longer swells, a little more air and depth, still restrained and never epic. "),
]


def main():
    os.makedirs(OUT, exist_ok=True)

    logger.info("装 DiT(XL turbo)…")
    t0 = time.time()
    dit = AceStepHandler()
    msg, ok = dit.initialize_service(
        project_root=ROOT,
        config_path="acestep-v15-xl-turbo",
        device="auto",
        offload_to_cpu=False,       # tier6b 不需要 offload
    )
    if not ok:
        logger.error(f"DiT 起不来: {msg}")
        return 1
    logger.info(f"DiT 装好,用了 {time.time() - t0:.0f}s — {msg}")

    # LM 负责把 caption 推理成音乐元数据和 code。turbo 路线下它是可选的,
    # 但开着能显著提高"贴提示词"的程度,而这正是这一步最看重的。
    logger.info("装 LM(1.7B,主套件自带)…")
    llm = LLMHandler()
    lmsg, lok = llm.initialize_service(
        project_root=ROOT,
        # 0.6B 是可选下载,1.7B 是主套件自带的。为了不再等一次下载,直接用自带那个——
        # LM 在这里只负责把 caption 推理成音乐元数据,1.7B 反而更稳。
        config_path="acestep-5Hz-lm-1.7B",
        device="auto",
    )
    if not lok:
        logger.warning(f"LM 没起来,退回纯 DiT: {lmsg}")
        llm = None

    notes = []
    for tag, seed, flavour in CONCEPTS:
        caption = COMMON + flavour + AVOID
        params = GenerationParams(
            caption=caption,
            lyrics="[Instrumental]",
            instrumental=True,
            duration=DUR,
            bpm=BPM,
            inference_steps=8,          # turbo 的推荐步数
            seed=seed,
            thinking=bool(llm),
            enable_normalization=False, # 响度我们自己两遍法做,别让它先压一遍
        )
        cfg = GenerationConfig()
        save = os.path.join(OUT, f"_ace_{tag}")
        os.makedirs(save, exist_ok=True)
        logger.info(f"生成 concept {tag}  seed={seed}  {DUR}s")
        t1 = time.time()
        res = generate_music(dit, llm, params, cfg, save_dir=save)
        took = time.time() - t1
        files = getattr(res, "audio_files", None) or getattr(res, "output_paths", None) or []
        logger.info(f"concept {tag} 用了 {took:.0f}s → {files}")
        notes.append(dict(tag=tag, seed=seed, sec=DUR, took=round(took, 1),
                          files=[str(f) for f in files], caption=caption,
                          model="acestep-v15-xl-turbo", steps=8, bpm=BPM,
                          lm="acestep-5Hz-lm-1.7B" if llm else "off"))

    json.dump(notes, open(os.path.join(OUT, "_ace_meta.json"), "w"), ensure_ascii=False, indent=1)
    print("ACE_CONCEPTS_DONE")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
