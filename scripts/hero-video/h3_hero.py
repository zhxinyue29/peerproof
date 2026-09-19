#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""拿 MiniMax H3 的 fl2va 再试一次 hero 动效 —— Wan 那轮的对照组。

**为什么之前没试**:我按记忆说 "fl2va 是纯文生视频、喂不进图",记错了。
`comfy_extras/nodes_minimax_h3.py:112` 的 `MiniMaxH3ImageToVideo` 有
`first_frame` 输入,fl2va 就是靠它做首帧约束的。ref2va 那条才是机位被参考图
钉死(=幻灯片根因),这次不用它。

**这次只求一样东西**:背景的雾和灯。人物、卡片、六块文字统统别动——那套按顺序
发生的动作(卡片浮出→打勾→光跑到下一个人)任何扩散模型都给不了,已经改用
SVG 画好上线了。所以判定标准只有一条:**雾和灯有没有真的在动,而脸和字没崩。**

**提示词这次不写死**。Wan 那轮我为了保文字写满了 still / hold / locked off,
模型完全照做,什么都没动(相邻帧差 0.09%)。这里只给一条具体的强动作,人物用
"hold their pose" 一句带过,不再堆否定。H3 的 BasicGuider 没有负向输入,所有
约束都只能写在正向里。

跑法(必须走全机闸门,H3 生成时吃 29-36 GB):
    NEED_GB=40 NEED_VRAM_GB=18 RELEASE=comfyui-h3.service \
      大活排队.sh peerproof-h3 scripts/hero-video/run_h3.sh
"""
import glob
import json
import os
import subprocess
import time
import urllib.request
import uuid

SRV = "http://127.0.0.1:8189"
OUT = os.path.expanduser("~/ComfyUI-H3/output/peerproof_h3")
IMG = "peerproof_hero_h3.png"
# 1344×768 × 124 帧在本机**解不了码**:采样跑完了,VAE 解码时进程涨到 39.9 GB,
# 换页,零报错,落盘 48 字节空壳。降到 1024×576 × 90 帧 —— 像素 -43%、帧数 -27%。
# 90 也在节点要求的 17k+5 格上(5+17×5=90)。
W, H, LENGTH, STEPS = 1024, 576, 90, 25

PROMPT = (
    "A dark event venue at night, cinematic 3D animated film render. Three stylised young "
    "characters stand in a circle holding glowing phones and hold their pose. "
    "Thick purple stage haze drifts slowly across the hall and the beams from the overhead "
    "stage lights sweep gently through the smoke. The ring of purple light between the three "
    "of them glows and pulses. The camera is locked off on a tripod. "
    "Quiet room tone, no music."
)


def build(seed: int):
    return {
        "1": {"class_type": "UNETLoader", "inputs": {
            "unet_name": "minimax_h3_fl2va_pruned_int8_convrot.safetensors", "weight_dtype": "default"}},
        "2": {"class_type": "CLIPLoader", "inputs": {
            "clip_name": "qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors", "type": "minimax", "device": "default"}},
        "3": {"class_type": "VAELoader", "inputs": {"vae_name": "minimax_h3_video_vae_fp16.safetensors"}},
        "4": {"class_type": "VAELoader", "inputs": {"vae_name": "minimax_h3_audio_vae_fp32.safetensors"}},
        "5": {"class_type": "LoadImage", "inputs": {"image": IMG}},
        # 底板进 first_frame —— 这就是之前被我漏掉的那个入口
        "10": {"class_type": "MiniMaxH3ImageToVideo", "inputs": {
            "clip": ["2", 0], "vae": ["3", 0], "prompt": PROMPT,
            "width": W, "height": H, "length": LENGTH, "first_frame": ["5", 0]}},
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
            "video": ["42", 0], "filename_prefix": "peerproof_h3/hero", "format": "mp4", "codec": "h264"}},
    }


def main():
    os.makedirs(OUT, exist_ok=True)
    # 等条件用**产出文件**,不用 history 的状态字 —— 本机被 "服务 active 但什么都没出"
    # 骗过不止一次。
    hit = lambda: glob.glob(os.path.join(OUT, "hero_*.mp4"))
    before = set(hit())

    req = urllib.request.Request(
        SRV + "/prompt",
        data=json.dumps({"prompt": build(20260919), "client_id": str(uuid.uuid4())}).encode(),
        headers={"Content-Type": "application/json"})
    print("提交 H3 fl2va  %dx%d  %d帧  %d步" % (W, H, LENGTH, STEPS), flush=True)
    print(json.load(urllib.request.urlopen(req)).get("prompt_id", "?"), flush=True)

    t0 = time.time()
    while time.time() - t0 < 5400:
        time.sleep(15)
        new = set(hit()) - before
        if new:
            f = sorted(new)[0]
            # 文件出现 ≠ 生成成功。2026-09-19 这条跑满 25 步之后 VAE 解码 OOM,
            # 日志里没有任何报错,落盘的是一个 **48 字节的空 MP4 壳**
            # (ftyp + free + 空 mdat),而当时的判定只看文件在不在,把它打成了
            # OK —— 48 这个数字甚至就印在同一行上。所以这里必须真的解出帧来。
            time.sleep(3)   # 让写入落定,别读到写了一半的文件
            size = os.path.getsize(f)
            probe = subprocess.run(
                ["ffprobe", "-v", "error", "-select_streams", "v:0",
                 "-count_frames", "-show_entries", "stream=nb_read_frames",
                 "-of", "default=nw=1:nk=1", f],
                capture_output=True, text=True)
            frames = probe.stdout.strip()
            ok = size > 100_000 and frames.isdigit() and int(frames) >= 24
            print("%s %s %.0fs  %d 字节  %s 帧"
                  % ("OK" if ok else "空壳/坏文件", f, time.time() - t0, size,
                     frames or "读不出"), flush=True)
            print("H3_DONE" if ok else "H3_EMPTY", flush=True)
            return 0 if ok else 1
        if int(time.time() - t0) % 300 < 15:
            print("  ...已等 %.0f 分钟" % ((time.time() - t0) / 60), flush=True)
    print("H3_TIMEOUT", flush=True)
    return 1


if __name__ == "__main__":
    raise SystemExit(main() or 0)
