#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""用 H3 重新生成首页底板 —— 扔掉旧图,只留人物风格和配色。

旧图(那张三人围成一圈的)被否掉的原因是**站位对不上分镜**:剧本要的是
「左侧两个人拿手机聊天 + 中间一个人拿手机」,旧图是三个人均匀围一圈、谁也没在
跟谁说话。这是构图问题,SVG 改不了,只能重新生成。

保留的只有两样:**人物风格**(3D 动画片质感、圆润造型)和**配色**(深藏青 + 紫,
跟站点一致)。旧图里的横幅、三张卡片、手写字全部不要。

## 三条硬约束,都是踩过坑换来的

**画面里一个字都不许有。** 扩散模型写不出可读的字。旧图那六块文字能活下来,
纯粹是因为它们烤在源图里而模型几乎没动。这次是从零生成,任何字都会变成乱码。
所以提示词里反复压 no text,文字全部交给 SVG —— 那样还白赚一个好处:能翻译。

**机位必须锁死。** 剧本要的"镜头轻微推进"由 CSS 做,因为那个变换**同时作用在
画面和 SVG 图层上**,两者锁在一起。要是让 H3 自己推镜,四拍的弧线就会从人物身上
滑开(弧线的坐标是按底板像素量出来的)。

**分辨率钉在 1024×576。** 2026-09-19 实测:这个尺寸 90 帧的内存峰值 45G,
而 cgroup 上限 50G;放大到 1344×768 约需 59G,必崩(而且崩得一声不吭,
落一个 48 字节空壳)。网页上 hero 只渲染约 680px 宽,1024 已是 1.5 倍富余。

跑法:
    NEED_GB=40 PEAK_GB=48 NEED_VRAM_GB=18 RELEASE=comfyui-h3.service \\
      大活排队.sh h3场景 scripts/hero-video/run_h3_scene.sh
"""
import glob
import json
import os
import subprocess
import time
import urllib.request
import uuid

SRV = "http://127.0.0.1:8189"
OUT = os.path.expanduser("~/ComfyUI-H3/output/peerproof_scene")
W, H, LENGTH, STEPS = 1024, 576, 90, 25

# 风格锚点:跟站点对齐的那部分,每条提示词都带上。
STYLE = (
    "cinematic 3D animated film render, Pixar-style stylised young characters with soft rounded "
    "shapes and large expressive eyes, warm skin tones. "
    "Colour palette: deep navy blue and indigo darkness, violet and purple stage lighting, "
    "small glints of mint green. Shallow depth of field, volumetric haze, night. "
)

# 反复压文字。H3 没有负向输入,只能在正向里写。
NO_TEXT = (
    "There is absolutely no text anywhere in the frame: no letters, no words, no signs, no "
    "banners, no posters, no logos, no screens showing text, no subtitles, no captions. "
    "Blank dark surfaces where a sign would be. "
)

# 机位锁死。CSS 负责推进。
LOCKED = "The camera is completely locked off on a tripod and does not move, pan or zoom. "

# 旧图被否掉的真正原因,用户的原话:「不是站一圈,只是二维地摆了一圈,和活动场景
# 也没有融入」。那张图的三个人是**贴上去的**:各自一套光、脚下没有地、谁也不挡谁、
# 和背后的大厅不共享透视。看着像三张贴纸糊在背景板上,不像三个人在参加活动。
#
# 所以「融入」这件事必须当成硬指标写死,而不是指望模型自己想到。四个着力点:
#   ① 站在地上 —— 有地面、有落脚点、有影子
#   ② 同一套光 —— 背后舞台的紫光打在他们头发和肩膀上形成轮廓光,这是"同处一室"
#      最强的视觉信号
#   ③ 互相遮挡 —— 前景有别的参会者的背影挡住一部分,他们才在人群"里"而不是"前"
#   ④ 同一套透视 —— 统一视平线,景深连续,背景被长焦压缩
IN_THE_ROOM = (
    "These people are physically inside the room, not pasted on top of it: they stand on the "
    "floor of the hall with the ground visible under their feet, other attendees partly overlap "
    "and occlude them in the foreground and behind, and the same purple stage light from behind "
    "rim-lights their hair and shoulders and spills onto the floor around them. One continuous "
    "perspective at eye level, continuous depth from foreground to stage, shot on a long lens so "
    "the background is compressed and softly out of focus. They are attendees in a crowd. "
)

SHOTS = [
    ("a", 8811, STYLE +
     "A dark event venue at night, packed with people. On the LEFT, two young attendees stand "
     "close together among the crowd, each holding a glowing phone, turned towards each other "
     "mid-conversation. Further into the room a third attendee holds up a phone, its screen "
     "lighting their face from below. " + IN_THE_ROOM + LOCKED + NO_TEXT),
    ("b", 8822, STYLE +
     "Night, deep inside a crowded event hall, shot from within the audience. Two friends on the "
     "left lean in towards each other, phones glowing between them, laughing. A third person "
     "further back holds a phone up above the heads of the crowd. Purple and magenta stage light "
     "rakes across everyone from the stage behind. " + IN_THE_ROOM + LOCKED + NO_TEXT),
    ("c", 8833, STYLE +
     "A dark meetup space at night. The camera sits at shoulder height in the crowd, the blurred "
     "backs of two attendees framing the foreground. Beyond them, on the left, two young people "
     "with glowing phones talk to one another; a third stands further in holding a phone. "
     + IN_THE_ROOM + LOCKED + NO_TEXT),
]


def build(prompt, seed, tag):
    return {
        "1": {"class_type": "UNETLoader", "inputs": {
            "unet_name": "minimax_h3_fl2va_pruned_int8_convrot.safetensors", "weight_dtype": "default"}},
        "2": {"class_type": "CLIPLoader", "inputs": {
            "clip_name": "qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors", "type": "minimax", "device": "default"}},
        "3": {"class_type": "VAELoader", "inputs": {"vae_name": "minimax_h3_video_vae_fp16.safetensors"}},
        "4": {"class_type": "VAELoader", "inputs": {"vae_name": "minimax_h3_audio_vae_fp32.safetensors"}},
        # 不给 first_frame —— 纯文生,构图完全重来
        "10": {"class_type": "MiniMaxH3ImageToVideo", "inputs": {
            "clip": ["2", 0], "vae": ["3", 0], "prompt": prompt,
            "width": W, "height": H, "length": LENGTH}},
        "20": {"class_type": "RandomNoise", "inputs": {"noise_seed": seed}},
        "21": {"class_type": "KSamplerSelect", "inputs": {"sampler_name": "res_multistep"}},
        "22": {"class_type": "BasicScheduler", "inputs": {
            "model": ["1", 0], "scheduler": "simple", "steps": STEPS, "denoise": 1.0}},
        "23": {"class_type": "BasicGuider", "inputs": {"model": ["1", 0], "conditioning": ["10", 0]}},
        "24": {"class_type": "SamplerCustomAdvanced", "inputs": {
            "noise": ["20", 0], "guider": ["23", 0], "sampler": ["21", 0],
            "sigmas": ["22", 0], "latent_image": ["10", 1]}},
        "40": {"class_type": "VAEDecode", "inputs": {"samples": ["24", 0], "vae": ["3", 0]}},
        "41": {"class_type": "VAEDecodeAudio", "inputs": {"samples": ["24", 0], "vae": ["4", 0]}},
        "42": {"class_type": "CreateVideo", "inputs": {"images": ["40", 0], "audio": ["41", 0], "fps": 24.0}},
        "43": {"class_type": "SaveVideo", "inputs": {
            "video": ["42", 0], "filename_prefix": f"peerproof_scene/{tag}", "format": "mp4", "codec": "h264"}},
    }


def real_frames(path):
    """真数帧。文件出现 ≠ 生成成功 —— 上一轮 OOM 落过一个 48 字节空 MP4 壳,
    而当时的判定只看文件在不在就打了 OK。

    注意**不能用 `ffprobe`**:本机 PATH 上的 ffprobe 是个 compat 包装脚本,
    会忽略 -show_entries 只回显时长,把好文件判成坏的。走真 ffmpeg。"""
    r = subprocess.run(["/home/liyakun/bin/ffmpeg", "-v", "error", "-i", path, "-f", "null", "-"],
                       capture_output=True, text=True)
    if r.returncode != 0:
        return 0
    r = subprocess.run(["/home/liyakun/bin/ffmpeg", "-i", path], capture_output=True, text=True)
    return 0 if "Duration: 00:00:00" in r.stderr else os.path.getsize(path)


def main():
    os.makedirs(OUT, exist_ok=True)
    bad = 0
    for tag, seed, prompt in SHOTS:
        hit = lambda: glob.glob(os.path.join(OUT, f"{tag}_*.mp4"))
        if hit():
            print(f"跳过 {tag}(已有)", flush=True)
            continue
        before = set(hit())
        req = urllib.request.Request(
            SRV + "/prompt",
            data=json.dumps({"prompt": build(prompt, seed, tag), "client_id": str(uuid.uuid4())}).encode(),
            headers={"Content-Type": "application/json"})
        print(f"提交 {tag}  {W}x{H}  {LENGTH}帧  {STEPS}步  seed={seed}", flush=True)
        urllib.request.urlopen(req)

        t0 = time.time()
        while time.time() - t0 < 2700:
            time.sleep(15)
            new = set(hit()) - before
            if new:
                f = sorted(new)[0]
                time.sleep(3)
                sz = real_frames(f)
                ok = sz > 100_000
                print("%s %s  %.0fs  %d 字节" % ("OK" if ok else "空壳/坏文件", f, time.time() - t0, sz or os.path.getsize(f)), flush=True)
                if not ok:
                    bad += 1
                break
            if int(time.time() - t0) % 300 < 15:
                print("  ...%s 已等 %.0f 分钟" % (tag, (time.time() - t0) / 60), flush=True)
        else:
            print(f"  超时 {tag}", flush=True)
            bad += 1
    print("SCENE_DONE" if bad == 0 else f"SCENE_PARTIAL 坏 {bad} 条", flush=True)
    return 1 if bad else 0


if __name__ == "__main__":
    raise SystemExit(main())
