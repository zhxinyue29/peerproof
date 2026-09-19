# -*- coding: utf-8 -*-
"""给首页 hero 生成一段循环动效素材（Wan2.2 ti2v-5B，图生视频）。

这张图是最难的一类输入：三张卡通脸 + 六块可读文字（三张 "You were here /
Verified"、手写的 "Proof comes from peers."、舞台横幅 "Good People Build
Together" 和 "PeerProof"）。扩散模型守不住文字，也常把脸推歪。所以这里不求
"动起来"，求"只动该动的"：环上的光流动、背景舞台灯扫过、雾气飘——人和字一律
按住不动。

提示词里没有一个词让人物做动作，负向词里也**删掉了**山海经管线那条
"静态，画面静止"——那条是用来逼画面动的，在这里正好帮倒忙。
"""
import json, time, urllib.request

SRV = "http://127.0.0.1:8188"
IMG = "peerproof_hero.png"
W, H, L = 1280, 736, 81          # 81 帧 @24fps = 3.4s；帧数宁少不降精度
STEPS, CFG, SHIFT = 20, 5.0, 8.0

NEG = ("色调艳丽，过曝，细节模糊不清，字幕，最差质量，低质量，畸形，"
       "多余的手指，画得不好的手部，畸形的肢体，杂乱的背景，"
       "文字变形，扭曲的文字，乱码文字，脸部扭曲，变形的脸，五官错位，"
       "人物走动，人物转头，人物换姿势，镜头晃动，画面抖动")

SHOTS = [
    ("A_breath_s101",
     "the camera is locked off and completely still, a soft pulse of purple light "
     "flows along the glowing ring, faint volumetric light beams and thin haze "
     "drift slowly across the dark venue in the background, the three characters "
     "hold their pose exactly, only light and atmosphere move, "
     "3D animated film render, cinematic, subtle ambient motion", 101),
    ("B_breath_s202",
     "the camera is locked off and completely still, a soft pulse of purple light "
     "flows along the glowing ring, faint volumetric light beams and thin haze "
     "drift slowly across the dark venue in the background, the three characters "
     "hold their pose exactly, only light and atmosphere move, "
     "3D animated film render, cinematic, subtle ambient motion", 202),
    ("C_stage_s303",
     "the camera holds perfectly still, stage lights sweep slowly across the dark "
     "hall behind, haze drifting through the beams, the glowing ring shimmers, "
     "the characters and all signs stay perfectly still and unchanged, "
     "3D animated film render, cinematic", 303),
]


def run(name, motion, seed):
    wf = {
      "37": {"class_type": "UNETLoader", "inputs": {"unet_name": "wan2.2_ti2v_5B_fp16.safetensors", "weight_dtype": "default"}},
      "38": {"class_type": "CLIPLoader", "inputs": {"clip_name": "umt5_xxl_fp8_e4m3fn_scaled.safetensors", "type": "wan", "device": "default"}},
      "39": {"class_type": "VAELoader", "inputs": {"vae_name": "wan2.2_vae.safetensors"}},
      "48": {"class_type": "ModelSamplingSD3", "inputs": {"model": ["37", 0], "shift": SHIFT}},
      "6":  {"class_type": "CLIPTextEncode", "inputs": {"clip": ["38", 0], "text": motion}},
      "7":  {"class_type": "CLIPTextEncode", "inputs": {"clip": ["38", 0], "text": NEG}},
      "56": {"class_type": "LoadImage", "inputs": {"image": IMG}},
      "55": {"class_type": "Wan22ImageToVideoLatent", "inputs": {"vae": ["39", 0], "width": W, "height": H, "length": L, "batch_size": 1, "start_image": ["56", 0]}},
      "3":  {"class_type": "KSampler", "inputs": {"model": ["48", 0], "seed": seed, "steps": STEPS, "cfg": CFG, "sampler_name": "uni_pc", "scheduler": "simple", "positive": ["6", 0], "negative": ["7", 0], "latent_image": ["55", 0], "denoise": 1.0}},
      "8":  {"class_type": "VAEDecode", "inputs": {"samples": ["3", 0], "vae": ["39", 0]}},
      "57": {"class_type": "CreateVideo", "inputs": {"images": ["8", 0], "fps": 24.0}},
      "58": {"class_type": "SaveVideo", "inputs": {"video": ["57", 0], "filename_prefix": f"peerproof_hero/{name}", "format": "auto", "codec": "auto"}},
    }
    req = urllib.request.Request(f"{SRV}/prompt",
                                 data=json.dumps({"prompt": wf}).encode(),
                                 headers={"Content-Type": "application/json"})
    pid = json.load(urllib.request.urlopen(req))["prompt_id"]
    print("提交", name, flush=True)
    t0 = time.time()
    while time.time() - t0 < 2400:
        time.sleep(6)
        h = json.load(urllib.request.urlopen(f"{SRV}/history/{pid}"))
        if pid in h and h[pid]["status"].get("completed"):
            print(f"  OK {name} {time.time()-t0:.0f}s", flush=True)
            return
        if pid in h and h[pid]["status"].get("status_str") == "error":
            print(f"  FAIL {name}", flush=True)
            print(json.dumps(h[pid]["status"], ensure_ascii=False)[:2000], flush=True)
            return
    print(f"  TIMEOUT {name}", flush=True)


for name, motion, seed in SHOTS:
    run(name, motion, seed)
print("HERO_ANIM_DONE")
