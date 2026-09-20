#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""A 组剩下的三镜:a5、a8、a6。全部要拿前一镜的**尾帧**当首帧。

依赖链(所以顺序不能换):

    a2 ──尾帧──> a5 ──尾帧──> a6
    a7b ─尾帧──> a8

本机验过的边界:**同一个连续镜头切成两段**时喂尾帧接得住,人物、衣服、站位、灯光
全部接得上,剪在一起看不出切口;**跨场景**硬接则会在前一两秒 morph 成照片重影。
这三镜都是前者——同一个人、同一个沙发/同一个会场、同一时刻的下一秒。

尾帧在**运行时**抽,不能提前:跑这个脚本的时候 a2 和 a7b 可能还没出片
(这个作业是排在它们后面、靠 flock 等进来的)。
"""
import glob
import json
import os
import subprocess
import time
import urllib.request
import uuid

SRV = "http://127.0.0.1:8189"
OUT = os.path.expanduser("~/ComfyUI-H3/output/peerproof_demo_a")
IN = os.path.expanduser("~/ComfyUI-H3/input")
W, H, LENGTH, STEPS = 1024, 576, 120, 25

STYLE = (
    "cinematic 3D animated film render, Pixar-style stylised characters with soft rounded shapes, "
    "warm skin tones. Deep navy and indigo environment, strong violet and magenta light, small "
    "glints of mint green. Volumetric haze, shallow depth of field, night. "
)
NO_TEXT = (
    "There is absolutely no text anywhere in the frame: no letters, no words, no numbers, no "
    "logos, no signs, no banners, no captions. Every screen and every sign shows only an abstract "
    "glowing gradient and soft geometric shapes. "
)

# (tag, seed, 依赖哪一镜(None=纯文生), 提示词)
#
# a2 也放在这里,而且必须在 a5 前面:a5 要接它的尾帧。
# 本来 a2 排了单独一个作业,但闸门用的 flock **不保证先来后到** —— 两个作业一起等锁时,
# a5 那批可能先抢到,然后因为 a2 还没出片而把 a5、a6 一起跳过。合成一个作业,顺序才确定。
SHOTS = [
    # 重拍。第一版三条毛病一个根因:提示词里两个光源打架——同时写了"沙发后一盏暖灯"和
    # "手机的光是脸上的主光",H3 两个都满足不了,于是在墙上造了台大电视当主光,手机随即
    # 失去存在理由,第 4 帧之后就没了。这版房间里只留手机一个光源,并明确禁止电视/台灯。
    # 另外第一版写了 "Static medium shot" 锁机位又把人写成躺着不动,连人一起冻住了
    # (运动量 4.2/2.6/2.7,而 a1 是 11.9-14.6)。只锁机位,不锁人。
    ("a2", 7212, None, STYLE +
     "A dim living room at night, deep navy and indigo. The ONLY light in the room is the phone "
     "screen held above a young person's face: it throws bright violet and magenta light up onto "
     "their cheeks, nose and chin from below, and falls off into darkness a foot away. There is no "
     "television, no monitor, no lamp and no window — nothing else in the room emits light. "
     "The person lies on their back along a low sofa, head on a cushion, seen from the side and "
     "slightly above so the whole face is visible. They scroll with a thumb, their eyes flicking "
     "across the screen; they puff out a breath, let the phone tilt away, and their head rolls "
     "towards camera with a bored half-smile. The camera holds a slow steady medium shot. "
     "The room is alive: the phone's glow shifts as the screen changes, and the person breathes "
     "and shifts their weight. " + NO_TEXT),

    ("a5", 7606, "a2", STYLE +
     "Unbroken continuation of the same shot, same room, same sofa, same person, same light. "
     "The phone screen suddenly brightens and throws violet light across their face. Their eyes "
     "widen, they push up onto one elbow and then sit bolt upright, bringing both hands to the "
     "phone and leaning in towards it with sudden interest. Their bored expression turns into "
     "alert curiosity. The camera pushes in gently as they rise. " + NO_TEXT),

    ("a8", 7707, "a7b", STYLE +
     "Unbroken continuation of the same shot, same venue, same lighting. The same person seen from "
     "behind raises a phone in both hands up towards the glowing panel in front of them. The "
     "camera moves in over their right shoulder, closing on the back of the phone, then swings "
     "round so the phone's own glowing screen fills more and more of the frame. " + NO_TEXT),

    ("a6", 7808, "a5", STYLE +
     "Unbroken continuation of the same shot. The camera pushes straight in towards the phone held "
     "in both hands until the glowing screen fills the entire frame and everything else falls out "
     "of focus. The screen is a pure abstract violet and magenta gradient with soft geometric "
     "shapes. " + NO_TEXT),
]


def usable(path, limit=420):
    """等到文件**真的能解码**为止,而不是等它"大小不再变"。

    栽过两次,一次比一次隐蔽:

    1. 第一版固定 sleep 3 秒就判 —— 对大文件不够,a2 被当成 48 字节的坏文件。
    2. 第二版改成"等大小连续 6 秒不变" —— **还是错**。ComfyUI 先建文件写一个 48 字节
       的头,然后停下来编码,这段停顿里大小一直是 48,静默判定正好落进去。a5、a8、a6
       三条全被判坏,而它们其实是 422KB / 756KB / 557KB 的好片。

    大小是间接信号,解码才是直接的。所以反复试解,直到解得开或超时。
    """
    t0 = time.time()
    while time.time() - t0 < limit:
        try:
            n = os.path.getsize(path)
        except OSError:
            n = 0
        if n > 100_000:
            r = subprocess.run(["/home/liyakun/bin/ffmpeg", "-v", "error", "-i", path, "-f", "null", "-"],
                               capture_output=True, text=True)
            if r.returncode == 0:
                return True
        time.sleep(5)
    return False


def tail_of(tag):
    """抽某一镜的尾帧,返回 ComfyUI input 里的文件名。

    取的是 `-sseof -0.15`,不是绝对最后一帧:编码器偶尔会在末尾多塞一两个重复帧,
    拿那个当首帧会让下一镜开头顿一下。
    """
    hits = sorted(glob.glob(os.path.join(OUT, f"{tag}_*.mp4")))
    hits = [h for h in hits if "废" not in h]
    if not hits:
        return None
    os.makedirs(IN, exist_ok=True)
    name = f"{tag}_tail.png"
    dst = os.path.join(IN, name)
    subprocess.run(["/home/liyakun/bin/ffmpeg", "-v", "error", "-sseof", "-0.15",
                    "-i", hits[0], "-vframes", "1", dst, "-y"], check=True)
    print(f"  抽出 {tag} 的尾帧 → {name}  ({os.path.getsize(dst)} 字节)", flush=True)
    return name


def build(prompt, seed, tag, first):
    g = {
        "1": {"class_type": "UNETLoader", "inputs": {
            "unet_name": "minimax_h3_fl2va_pruned_int8_convrot.safetensors", "weight_dtype": "default"}},
        "2": {"class_type": "CLIPLoader", "inputs": {
            "clip_name": "qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors", "type": "minimax", "device": "default"}},
        "3": {"class_type": "VAELoader", "inputs": {"vae_name": "minimax_h3_video_vae_fp16.safetensors"}},
        "4": {"class_type": "VAELoader", "inputs": {"vae_name": "minimax_h3_audio_vae_fp32.safetensors"}},
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
            "video": ["42", 0], "filename_prefix": f"peerproof_demo_a/{tag}", "format": "mp4", "codec": "h264"}},
    }
    if first:
        g["5"] = {"class_type": "LoadImage", "inputs": {"image": first}}
        g["10"]["inputs"]["first_frame"] = ["5", 0]
    return g


def main():
    os.makedirs(OUT, exist_ok=True)
    bad = 0
    for tag, seed, dep, prompt in SHOTS:
        hit = lambda: [h for h in glob.glob(os.path.join(OUT, f"{tag}_*.mp4")) if "废" not in h]
        if hit():
            print(f"跳过 {tag}(已有)", flush=True)
            continue

        first = tail_of(dep) if dep else None
        if dep and not first:
            # 依赖没出片就没法接。跳过而不是硬编一个首帧——接错了尾帧比不接更糟,
            # 画面会在开头 morph 一次,而那种毛病肉眼要盯着看才发现。
            print(f"跳过 {tag}:依赖的 {dep} 还没有成片", flush=True)
            bad += 1
            continue

        before = set(hit())
        urllib.request.urlopen(urllib.request.Request(
            SRV + "/prompt",
            data=json.dumps({"prompt": build(prompt, seed, tag, first),
                             "client_id": str(uuid.uuid4())}).encode(),
            headers={"Content-Type": "application/json"}))
        print(f"提交 {tag}  {W}x{H}  {LENGTH}帧  seed={seed}  " + (f"首帧={first}" if first else "纯文生"), flush=True)

        t0, done = time.time(), False
        while time.time() - t0 < 2700:
            time.sleep(15)
            new = set(hit()) - before
            if new:
                f = sorted(new)[0]
                ok = usable(f)
                print("%s %s  %.0fs  %d 字节" % ("OK" if ok else "坏文件", f,
                                                 time.time() - t0, os.path.getsize(f)), flush=True)
                bad += 0 if ok else 1
                done = True
                break
            if int(time.time() - t0) % 300 < 15:
                print("  ...%s 已等 %.0f 分钟" % (tag, (time.time() - t0) / 60), flush=True)
        if not done:
            print(f"  超时 {tag}", flush=True)
            bad += 1

    print("接尾帧组_DONE" if bad == 0 else f"接尾帧组_PARTIAL 坏 {bad} 条", flush=True)
    return 1 if bad else 0


if __name__ == "__main__":
    raise SystemExit(main())
