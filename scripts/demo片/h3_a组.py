#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Demo 片 A 组第一批:不依赖前一镜尾帧的四个镜头。

拆成两批是因为 A5/A6/A8 要拿 A2/A7b 的**尾帧**当首帧 —— 那些帧现在还不存在。
第一批出来、人工挑过之后再抽帧跑第二批。

这一批全部**纯文生**(不给 first_frame)。本机验过:ref2va 会被参考图把机位钉死,
出来是幻灯片;fl2va 不给首帧就是纯文生,机位自由。代价是跨镜头人脸会漂,
所以 A2/A7a 的构图刻意避开正脸(背侧角度 / 纯背影)。
"""
import glob, json, os, subprocess, time, urllib.request, uuid

SRV = "http://127.0.0.1:8189"
OUT = os.path.expanduser("~/ComfyUI-H3/output/peerproof_demo_a")
W, H, LENGTH, STEPS = 1024, 576, 120, 25   # 120 帧 / 24fps = 5 秒

STYLE = (
    "cinematic 3D animated film render, Pixar-style stylised characters with soft rounded shapes, "
    "warm skin tones. Deep navy and indigo environment, strong violet and magenta light, small "
    "glints of mint green. Volumetric haze, shallow depth of field, night. "
)

# 每条都带。扩散模型写不出可读的字,屏幕上但凡出现字母就是乱码;所有真实 UI 后期合成。
NO_TEXT = (
    "There is absolutely no text anywhere in the frame: no letters, no words, no numbers, no "
    "logos, no signs, no banners, no captions. Every screen and every sign shows only an abstract "
    "glowing gradient and soft geometric shapes. "
)

# 只锁机位不锁人。上一轮把"不许动"写宽了,人跟着一起冻住,相邻帧差 0.236,像幻灯片。
ALIVE = (
    "The stated camera move is the only camera move; everything else is alive — light shifts, haze "
    "drifts, screen glow pulses, the character breathes and shifts their weight. "
)

SHOTS = [
    ("a1", 7101, STYLE +
     "A modern startup office at night, deep navy walls. One large monitor is the main light "
     "source, washing violet across the desk and the man's face. A stylised young man in a dark "
     "shirt sits at the desk, leaning forward on one elbow, looking at the monitor with a tired, "
     "worried expression — not angry, just deflated. He exhales, rubs the back of his neck, then "
     "turns his head slightly to look off-camera as if asking someone a question. Slow gentle "
     "dolly-in on his face. " + ALIVE + NO_TEXT),

    ("a2", 7202, STYLE +
     "A dim living room at night, deep navy and indigo, a single warm lamp behind the sofa. A "
     "stylised young person lies sprawled sideways across a low sofa, head resting on a cushion, "
     "holding a phone up above their face with one hand. The phone's glow is the key light on "
     "their cheek. They flick the screen twice with a thumb, let the hand drop onto their chest, "
     "and sigh with their eyes closing. Static medium shot from three-quarters behind the sofa "
     "back, so the face is only half seen. " + ALIVE + NO_TEXT),

    ("a4", 7303, STYLE +
     "A single bright violet ribbon of light bursts out of a glowing monitor and flies out through "
     "a window into a stylised night city of deep navy towers, threading between the buildings and "
     "leaving a soft magenta trail behind it. It curves down towards a phone lying on a sofa in a "
     "warm-lit window. Fast flying camera following the ribbon from behind, motion blur, thick "
     "volumetric haze. One single ribbon of light, not particles. " + NO_TEXT),

    ("a7a", 7404, STYLE +
     "Inside a stylised event venue at night. A huge stage screen at the back is by far the "
     "brightest thing in the frame and it lights the entire room: violet and magenta wash over the "
     "floor, the haze and the people, throwing long soft shadows towards camera. Bright and "
     "luminous, not a dark murky room. A sparse scattering of people stand in small groups, "
     "talking. A person seen entirely from behind walks in through the entrance into the room, "
     "their shoulders and the back of their head in the near foreground. The stage lights sweep "
     "slowly across the room, thick haze drifts through the beams, people shift and gesture. The "
     "camera tracks slowly forward behind them. " + NO_TEXT),
]


def build(prompt, seed, tag):
    return {
        "1": {"class_type": "UNETLoader", "inputs": {
            "unet_name": "minimax_h3_fl2va_pruned_int8_convrot.safetensors", "weight_dtype": "default"}},
        "2": {"class_type": "CLIPLoader", "inputs": {
            "clip_name": "qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors", "type": "minimax", "device": "default"}},
        "3": {"class_type": "VAELoader", "inputs": {"vae_name": "minimax_h3_video_vae_fp16.safetensors"}},
        "4": {"class_type": "VAELoader", "inputs": {"vae_name": "minimax_h3_audio_vae_fp32.safetensors"}},
        # 不给 first_frame —— 纯文生,机位自由。
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


def usable(path):
    """真数帧。别用 ffprobe —— PATH 上那个是 compat 包装,忽略 -show_entries 只回显时长。"""
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
        t0, done = time.time(), False
        while time.time() - t0 < 2700:
            time.sleep(15)
            new = set(hit()) - before
            if new:
                f = sorted(new)[0]
                time.sleep(3)
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
    print("A组第一批_DONE" if bad == 0 else f"A组第一批_PARTIAL 坏 {bad} 条", flush=True)
    return 1 if bad else 0


if __name__ == "__main__":
    raise SystemExit(main())
