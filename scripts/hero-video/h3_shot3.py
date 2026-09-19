#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""第三镜:圆点飞出、镜头跟着上升(原第二镜骨架:一个人低头操作手机(原 h3_scene2 的骨架 —— 镜头面向大屏幕,前景两个背影,人群稀疏。

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
OUT = os.path.expanduser("~/ComfyUI-H3/output/peerproof_shot3")
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

# 第二镜:一个人低头操作手机。用户原话「不用展示手机屏幕」——这一条同时解决了
# 扩散模型写不出字的老问题:屏幕不入画,就没有字要渲染。
#
# 光和画风锚定在 e 上(用户选定的第一镜):同一个场馆、背后同一块大屏当主光、
# 紫色轮廓光打在头发和肩膀上。两镜要能剪在一起,画风漂了就白做。
SHOTS = [
    ("j", 6101, STYLE +
     "Continuing the same unbroken shot: the SAME young woman with curly hair stays exactly where "
     "she is in the crowd, still holding her phone in both hands. She looks UP from the screen, "
     "blinks, and her eyes follow something small and bright rising slowly in the air in front of "
     "her; her expression softens into quiet surprise. Her head tilts up as she tracks it. The "
     "camera rises gently with her gaze. Nobody else moves much. " + BRIGHT + NO_TEXT),
    ("k", 6202, STYLE +
     "The same shot continues without a cut. The same young woman in the same position lifts her "
     "eyes from her phone and watches something float upward past her face; she blinks twice and "
     "smiles faintly. The camera cranes slowly upward past her shoulder, the crowd and the bright "
     "stage screen opening out below. " + BRIGHT + NO_TEXT),
    ("l", 6303, STYLE +
     "Unbroken continuation of the same shot. The same young woman stands in the same spot; she "
     "raises her head from her phone, her eyes tracking upward, mouth opening slightly. The camera "
     "rises and pulls back at the same time, revealing more and more of the crowd around her, each "
     "of them holding a glowing phone. " + BRIGHT + NO_TEXT),
]


def build(prompt, seed, tag):
    return {
        "1": {"class_type": "UNETLoader", "inputs": {
            "unet_name": "minimax_h3_fl2va_pruned_int8_convrot.safetensors", "weight_dtype": "default"}},
        "2": {"class_type": "CLIPLoader", "inputs": {
            "clip_name": "qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors", "type": "minimax", "device": "default"}},
        "3": {"class_type": "VAELoader", "inputs": {"vae_name": "minimax_h3_video_vae_fp16.safetensors"}},
        "4": {"class_type": "VAELoader", "inputs": {"vae_name": "minimax_h3_audio_vae_fp32.safetensors"}},
        "5": {"class_type": "LoadImage", "inputs": {"image": "shot3_from_i.png"}},
        # 第三镜的第一帧 = 第二镜(i)的最后一帧。人物、衣服、发型、站位、灯光全部接得上,
        # 剪在一起看不出切口 —— 用户原话:「要一样的人物一样的位置,让人觉得非常连贯
        # 而不是换镜头了」。
        #
        # 这条路在本机验过边界:**同一个连续镜头切成两段**时接得住,摄影机之后可以自由
        # 升起走开;**跨场景**硬接则会在前一两秒 morph 成照片重影。这次是前者。
        "10": {"class_type": "MiniMaxH3ImageToVideo", "inputs": {
            "clip": ["2", 0], "vae": ["3", 0], "prompt": prompt,
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
            "video": ["42", 0], "filename_prefix": f"peerproof_shot3/{tag}", "format": "mp4", "codec": "h264"}},
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
    print("SHOT3_DONE" if bad == 0 else f"SHOT3_PARTIAL 坏 {bad} 条", flush=True)
    return 1 if bad else 0


if __name__ == "__main__":
    raise SystemExit(main())
