#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""首页底板 第二轮 —— 镜头面向大屏幕,前景两个背影,人群稀疏。

## 第一轮被否的三条,逐条治

**「看不出是活动现场」** —— 第一轮把相机放在人群**里**,四周全是后脑勺,没有舞台、
没有大屏,所以像一群人在黑暗里看电影。这轮把相机转过来**面向舞台大屏**:大屏是
画面里最亮的东西,一眼就是活动现场,同时它就是整个房间的光源。

**「Monad 活动灯光不明显」** —— 上一轮实测平均亮度 15.4/255(旧首页图 39.6),
94% 的像素暗于 40,紫光沉在黑里看不见。这轮把大屏当**主光**写死,要求它照亮整个
房间,并且明确写"比第一轮亮得多"。

**「几乎不动」** —— 上一轮相邻帧差 0.236,和 Wan 那次失败一个量级。根因是我为了
锁机位,把"不许动"写得太宽,连人一起锁住了 —— **和我在 Wan 上犯的是同一个错**。
这轮只锁机位,人群、灯、雾、屏幕的辉光全部明确要求动起来。

## 两条不变的硬约束

**人群不要密**(用户原话)。稀疏几个人,留出空气,也省得糊成一团。

**画面里一个字都不许有**。大屏上只能是抽象渐变和几何光形 —— 扩散模型写不出可读
的字,大屏上但凡出现字母就是乱码。所有文字将来由 SVG 画,那样还能中英切换。

**前景两个人背对镜头**,这一条顺带解决脸的一致性:不给正脸,就没有漂移可言。
"""
import glob
import json
import os
import subprocess
import time
import urllib.request
import uuid

SRV = "http://127.0.0.1:8189"
OUT = os.path.expanduser("~/ComfyUI-H3/output/peerproof_scene2")
W, H, LENGTH, STEPS = 1024, 576, 90, 25

STYLE = (
    "cinematic 3D animated film render, Pixar-style stylised young characters with soft rounded "
    "shapes, warm skin tones. Deep navy and indigo room, strong violet and magenta light, small "
    "glints of mint green. Volumetric haze, shallow depth of field, night. "
)

# 主光写死。第一轮平均亮度只有 15.4/255,这句是专治那个。
BRIGHT = (
    "The huge stage screen is the brightest thing in the frame by far and it lights the entire "
    "room: violet and magenta light washes over the floor, the haze and the people, throwing long "
    "soft shadows towards camera. Bright, luminous, clearly lit — not a dark murky room. "
)

# 只锁机位,不锁人。第一轮把「不许动」写得太宽,连人一起冻住了。
ALIVE_LOCKED = (
    "The camera is locked off on a tripod and does not move, pan or zoom — but the room is alive: "
    "the stage lights sweep slowly across the room, thick haze drifts through the light beams, the "
    "screen's glow pulses and shifts, and the few people present shift their weight and move "
    "slightly. Everything except the camera moves. "
)

NO_TEXT = (
    "The big screen shows only an abstract glowing gradient and soft geometric shapes. There is "
    "absolutely no text anywhere in the frame: no letters, no words, no numbers, no logos, no "
    "signs, no banners, no captions. "
)

SHOTS = [
    ("d", 9101, STYLE +
     "A night event venue seen from the back of the room, the camera facing the stage. In the "
     "FOREGROUND, two young people stand with their backs to camera, close together, each holding "
     "a glowing phone down at their side. Beyond them a huge bright screen fills the stage. Only a "
     "handful of other attendees stand scattered between them and the stage — the room is airy and "
     "not crowded. " + BRIGHT + ALIVE_LOCKED + NO_TEXT),
    ("e", 9202, STYLE +
     "Inside a event hall at night, shot from behind two young attendees who stand close together "
     "in the foreground, seen from the shoulders up, their backs to camera, phones glowing in "
     "their hands. Ahead of them the stage carries an enormous luminous screen, lighting truss and "
     "spotlights above it. A few scattered people stand between, silhouetted. " + BRIGHT +
     ALIVE_LOCKED + NO_TEXT),
    ("f", 9303, STYLE +
     "Low wide shot inside a event space at night, camera at waist height facing the stage. Two "
     "young people stand with their backs to camera on the left of frame, one holding up a phone. "
     "A giant glowing screen dominates the stage ahead, beams of purple light cutting down through "
     "haze from the truss. The floor is open with only a few people on it. " + BRIGHT +
     ALIVE_LOCKED + NO_TEXT),
]


def build(prompt, seed, tag):
    return {
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
            "video": ["42", 0], "filename_prefix": f"peerproof_scene2/{tag}", "format": "mp4", "codec": "h264"}},
    }


def usable(path):
    """真数帧。**不要用 `ffprobe`** —— 本机 PATH 上那个是 compat 包装脚本,忽略
    -show_entries 只回显时长,会把好文件判成坏的(今晚已经误判过一次)。"""
    r = subprocess.run(["/home/liyakun/bin/ffmpeg", "-v", "error", "-i", path, "-f", "null", "-"],
                       capture_output=True, text=True)
    return r.returncode == 0 and os.path.getsize(path) > 100_000


def main():
    os.makedirs(OUT, exist_ok=True)
    bad = 0
    for tag, seed, prompt in SHOTS:
        hit = lambda: glob.glob(os.path.join(OUT, f"{tag}_*.mp4"))
        if hit():
            print(f"跳过 {tag}(已有)", flush=True)
            continue
        before = set(hit())
        urllib.request.urlopen(urllib.request.Request(
            SRV + "/prompt",
            data=json.dumps({"prompt": build(prompt, seed, tag), "client_id": str(uuid.uuid4())}).encode(),
            headers={"Content-Type": "application/json"}))
        print(f"提交 {tag}  {W}x{H}  {LENGTH}帧  seed={seed}", flush=True)
        t0 = time.time()
        done = False
        while time.time() - t0 < 2700:
            time.sleep(15)
            new = set(hit()) - before
            if new:
                f = sorted(new)[0]
                time.sleep(3)
                ok = usable(f)
                print("%s %s  %.0fs  %d 字节" % ("OK" if ok else "空壳/坏文件", f,
                                                 time.time() - t0, os.path.getsize(f)), flush=True)
                bad += 0 if ok else 1
                done = True
                break
            if int(time.time() - t0) % 300 < 15:
                print("  ...%s 已等 %.0f 分钟" % (tag, (time.time() - t0) / 60), flush=True)
        if not done:
            print(f"  超时 {tag}", flush=True)
            bad += 1
    print("SCENE2_DONE" if bad == 0 else f"SCENE2_PARTIAL 坏 {bad} 条", flush=True)
    return 1 if bad else 0


if __name__ == "__main__":
    raise SystemExit(main())
