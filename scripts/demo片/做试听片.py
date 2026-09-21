#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""从三条 concept 里各截关键段，拼成 45-60 秒的 BGM 试听片。

    /home/liyakun/miniconda3/bin/python 做试听片.py

concept 是 70 秒一条，内部已经压缩体现了「稀疏开场 → 光束启动 → 发现 → 到场 →
验证退后 → verified 小抬升 → 收束」。这个脚本从每条里截出最能代表这几个状态的片段，
用短交叉淡化接起来，方便一次听完三个方向。

**不做响度归一化。** 试听片是用来比方向的，三条之间的响度差本身就是信息；
真正的归一化留给选定之后的完整版。
"""
import glob
import os
import subprocess

FF = "/home/liyakun/bin/ffmpeg"
M = os.path.expanduser("~/文档/Monad_Circle/出片/audio_final/music")
P = os.path.expanduser("~/文档/Monad_Circle/出片/audio_final/previews")

# 从 70 秒的 concept 里取三段：启动、变暖、收束。
# 起点按 ace_concepts.py 里写进 caption 的结构估，不是精确对齐——
# 模型不保证严格按秒执行结构，所以这里取的是「大概率落在那个状态里」的窗口。
CUTS = [(9.0, 7.0, "启动"), (33.0, 7.0, "变暖"), (58.0, 6.0, "收束")]
XF = 0.7          # 交叉淡化秒数


def find(tag):
    for pat in (f"{M}/PeerProof_music_concept_{tag}.wav", f"{M}/_ace_{tag}/*.wav", f"{M}/_ace_{tag}/**/*.wav"):
        hits = sorted(glob.glob(pat, recursive=True))
        if hits:
            return hits[0]
    return None


def main():
    os.makedirs(P, exist_ok=True)
    parts = []
    for tag in ("A", "B", "C"):
        src = find(tag)
        if not src:
            print(f"  concept {tag} 还没有，跳过")
            continue
        for i, (start, dur, _) in enumerate(CUTS):
            out = f"/tmp/prev_{tag}{i}.wav"
            # 每段自己首尾淡入淡出，避免剪切点上的爆音
            subprocess.run([FF, "-v", "error", "-ss", str(start), "-t", str(dur), "-i", src,
                            "-af", f"afade=t=in:st=0:d=0.25,afade=t=out:st={dur-0.35:.2f}:d=0.35",
                            "-ar", "48000", "-c:a", "pcm_s24le", out, "-y"], check=True)
            parts.append(out)
    if not parts:
        print("一条 concept 都没有，先跑 ace_concepts.py")
        return 1

    # 用 concat 而不是 acrossfade 链：段数多的时候 acrossfade 要嵌套很深，
    # 而每段已经自带淡入淡出，直接拼接听不出接缝。
    lst = "/tmp/prev.txt"
    open(lst, "w").write("".join(f"file '{p}'\n" for p in parts))
    dst = f"{P}/bgm_preview.wav"
    subprocess.run([FF, "-v", "error", "-f", "concat", "-safe", "0", "-i", lst,
                    "-ar", "48000", "-c:a", "pcm_s24le", dst, "-y"], check=True)
    r = subprocess.run([FF, "-v", "error", "-i", dst, "-f", "null", "-"], capture_output=True)
    import wave
    w = wave.open(dst)
    print(f"  {dst}  {w.getnframes()/w.getframerate():.1f}s  解码{'OK' if r.returncode==0 else '失败'}")
    print(f"  顺序：A 启动/变暖/收束 → B 同 → C 同，每段 6-7 秒")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
