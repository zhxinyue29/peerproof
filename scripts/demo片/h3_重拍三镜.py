#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""替换 a4 / a7b / a8 的三条新镜头,用 ref2va 锁角色。

    H3_R01_proofline_transition.mp4   替换 a4
    H3_R02_builder_arrival.mp4        替换 a7a/a7b 里的主角部分
    H3_R03_venue_approach.mp4         替换 a7b + a8

## 为什么这次用 ref2va,而前面几镜用的是 fl2va

fl2va 只能约束**首帧**。要让「同一个人出现在一个全新场景里」,首帧是错的工具:
R02 的首帧应该是会场门口,不是 a5 里那张沙发上的近景;硬拿跨场景的帧当首帧,
本机实测前 1-2 秒会 morph 成照片重影。

ref2va 收的是**参考图**,提示词里用 `<Picture i>` 指代,这才是"这个人,换个场景"的正解。
记忆里那条「ref2va 机位被图钉死 = 幻灯片根因」是**拿整张场景图当参考**时的结论;
拿角色肖像当参考是它的正用法,机位由提示词决定。

`ref_image_size` 先用 "match"(参考图缩到生成分辨率的像素面积)。节点文档说 "max"
(2048 短边)身份保真更好但**慢好几倍** —— 参考 token 要跟着走完每一步采样。
先跑 match,人脸对不上再升 max,不要一上来就买单。

## 唯一一处偏离指令

指令要求 R01 结尾那个人"必须和 a5/a6 是同一个人"。R01 同时还要从 organizer 的房间
出发、穿过城市。ref2va 一次只生成一个连续镜头,把两个角色和三个场景压进 5 秒里,
参考图会互相打架(实测过同类:两个约束打架时模型自己造第三种东西来调和)。

所以 R01 **只给 participant 的两张参考**,organizer 那头只用文字描述"a dark modern
room with a large glowing screen"——它在画面里只出现不到一秒,而且是背景。
真要 organizer 出镜,那是另一条镜头的事。
"""
import glob
import json
import os
import subprocess
import time
import urllib.request
import uuid

SRV = "http://127.0.0.1:8189"
OUT = os.path.expanduser("~/ComfyUI-H3/output/peerproof_r")
REF = os.path.expanduser("~/文档/Monad_Circle/出片/demo片_参考帧")
IN = os.path.expanduser("~/ComfyUI-H3/input")
W, H, LENGTH, STEPS = 1024, 576, 124, 25   # 124 帧 ≈ 5.2s，节点文档说训练区间从 124 起

# ── PeerProof H3 Style Bible ──────────────────────────────────────────────
# 用户定的,逐条照抄。色值取自线上 globals.css(那份是从设计稿量出来的)。
STYLE = (
    "This scene belongs to the exact same visual universe as the PeerProof website and the "
    "provided character reference images. Premium stylized 3D character design, polished "
    "editorial product-film quality. Dark deep-navy environment, close to #010e1d and #09162a. "
    "PeerProof violet #6e54ff and soft violet #9a88ff are used only for brand signals, actions "
    "and subtle proof connections — do not flood the scene with neon. Soft cinematic lighting, "
    "clean composition, modern builder and Web3 community atmosphere. "
)

# 否定项也照抄。薄荷绿是「已验证」专用色,普通叙事镜头里不许出现。
NEG = (
    "Not photorealistic live action, not anime, not chibi, not childlike cartoon, not a cyberpunk "
    "nightclub, not generic crypto neon advertising. No cyberpunk city aesthetics. No thick laser "
    "beams. No random holograms. No mint green anywhere — mint is reserved for a verified state "
    "and must not appear here. "
)

NO_TEXT = (
    "There is absolutely no readable text anywhere in the frame: no letters, no words, no numbers, "
    "no logos, no signs, no captions, and no QR codes of any kind. No app interface and no website "
    "interface is visible. Every screen shows only a soft abstract gradient. "
)

ORGANIZER = os.path.basename(glob.glob(os.path.join(REF, "01_organizer*"))[0])
PART_1 = os.path.basename(glob.glob(os.path.join(REF, "02_participant_ref_a5*"))[0])
PART_2 = os.path.basename(glob.glob(os.path.join(REF, "03_participant_ref2_a6*"))[0])

# (tag, seed, 参考图列表, 提示词)
SHOTS = [
    # R01 栽了两次,两次都是城市那一段。
    #
    # v1 写 "No giant billboards, no green signs" —— 广告牌确实没有,楼却被勾满霓虹边。
    # v2 改成正面描述("楼是实心暗块、唯一的光是窗户里的暖白"),同时保留了一串
    #    "no glowing outlines / no green light / no pink light" —— **更糟**,霓虹更密了。
    #
    # 根因看清了:**扩散模型里,否定句中的名词本身就是强信号**。我一遍遍写 "no neon"、
    # "not cyberpunk",等于一遍遍提醒它这里该有霓虹。而且 "city / towers / skyline"
    # 这几个词在训练数据里本来就和赛博朋克天际线绑死。
    #
    # 所以 v3 **把城市整个删掉**。这一镜真正需要的只是"光从一处传到另一处",
    # 不需要天际线:从 organizer 的窗口飞出,穿过夜色,飞进 participant 的窗口。
    # 画面里不出现 city / skyline / towers / buildings 这些词,也就没有东西可以被勾边。
    ("H3_R01_proofline_transition", 8121, [PART_1, PART_2], STYLE +
     "<Picture 1> and <Picture 2> show the young woman at the end of this shot: short brown hair, "
     "pale grey hoodie, same face and same stylized 3D proportions. Keep her identical. "
     "Beat one: a dark quiet room at night. A large screen on the desk shows a soft abstract violet "
     "gradient and is the only light. A single violet thread of light, as fine as a strand of "
     "spider silk with a faint soft glow, lifts off the screen and slips out through the open "
     "window into the dark. "
     "Beat two: the camera flies with the thread through open night air. The frame is almost "
     "entirely empty darkness and soft deep-navy atmosphere — drifting haze, a few faint stars, and "
     "far below, small scattered points of warm yellow window light, tiny and out of focus, like "
     "distant candles. Nothing else is in frame. No architecture is visible in silhouette or detail. "
     "The violet thread is the only thing the eye can follow, and it stays exactly as fine as it "
     "started. "
     "Beat three: the thread slips through another window into a second dim room and settles gently "
     "onto the phone in the young woman's hands. She is sitting on a sofa, holding the phone upright "
     "in portrait orientation; it glows faintly violet and lights her face from below. " +
     NEG + NO_TEXT),

    ("H3_R02_builder_arrival", 8202, [PART_1, PART_2], STYLE +
     "<Picture 1> and <Picture 2> are the same young woman who walks into this room. Keep her face, "
     "her short brown hair, her pale grey hoodie, her age and her body proportions exactly as shown. "
     "She walks into a modern Web3 builder meetup: small groups of young builders and creators "
     "standing and talking naturally, a few standing tables, a few open laptops, casual clothing, a "
     "subtle stage with a large soft display far in the background. Deep navy room, restrained "
     "violet event lighting, soft haze. It is a relaxed working meetup, not a gala, not an awards "
     "ceremony, not a nightclub, not a fashion show and not a huge empty auditorium. She steps in, "
     "looks around the room, sees people genuinely talking and building, and her expression warms "
     "into interest. Restrained handheld camera following her in. " + NEG + NO_TEXT),
]

# R03 接 R02 的尾帧（同一个空间的下一秒），尾帧在运行时抽。
CHAINED = [
    ("H3_R03_venue_approach", 8303, "H3_R02_builder_arrival", [PART_1, PART_2], STYLE +
     "<Picture 1> and <Picture 2> are the same young woman; keep her identical. Continuing inside "
     "the same builder meetup, she notices a tall clean vertical display standing near the "
     "entrance. The display's content stays visually simple and completely unreadable from this "
     "distance — a soft plain violet gradient panel, with no pattern of squares, no code and no "
     "interface. The camera sits just behind her right shoulder as she walks towards the display. "
     "At the very end she begins to raise her phone, held UPRIGHT IN PORTRAIT ORIENTATION, tall and "
     "narrow, never turned sideways. The shot ends before the phone's screen becomes large or "
     "readable. " + NEG + NO_TEXT),
]


def usable(path, limit=420):
    """等到文件**真的能解码**为止,而不是等它"大小不再变"。

    ComfyUI 先建文件写一个 48 字节的头,然后停下来编码。按大小判定会落进那段停顿里,
    把好片判成坏片——实测 a5/a8/a6 三条 422KB/756KB/557KB 的好片全被判成 48 字节。
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


def stage_refs():
    """参考图要放进 ComfyUI 的 input 目录才能被 LoadImage 读到。"""
    os.makedirs(IN, exist_ok=True)
    for f in glob.glob(os.path.join(REF, "0[123]_*.png")):
        dst = os.path.join(IN, os.path.basename(f))
        if not os.path.exists(dst) or os.path.getsize(dst) != os.path.getsize(f):
            subprocess.run(["cp", f, dst], check=True)
    print("参考图已就位:", ", ".join(sorted(os.path.basename(f) for f in glob.glob(os.path.join(REF, "0[123]_*.png")))), flush=True)


def build(prompt, seed, tag, refs):
    g = {
        "1": {"class_type": "UNETLoader", "inputs": {
            "unet_name": "minimax_h3_ref2va_pruned_int8_convrot.safetensors", "weight_dtype": "default"}},
        "2": {"class_type": "CLIPLoader", "inputs": {
            "clip_name": "qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors", "type": "minimax", "device": "default"}},
        "3": {"class_type": "VAELoader", "inputs": {"vae_name": "minimax_h3_video_vae_fp16.safetensors"}},
        "4": {"class_type": "VAELoader", "inputs": {"vae_name": "minimax_h3_audio_vae_fp32.safetensors"}},
        "10": {"class_type": "MiniMaxH3ReferenceToVideo", "inputs": {
            "clip": ["2", 0], "vae": ["3", 0], "audio_vae": ["4", 0], "prompt": prompt,
            "width": W, "height": H, "length": LENGTH, "ref_image_size": "match"}},
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
            "video": ["42", 0], "filename_prefix": f"peerproof_r/{tag}", "format": "mp4", "codec": "h264"}},
    }
    # 参考图的 key 是 `ref_images.ref_image_N`,**带父字段前缀、从 0 起编号**。
    #
    # 第一次写成了 `ref_image_1`,提交能过校验但执行时报
    # `execute() got an unexpected keyword argument 'ref_image_1'` ——
    # 而 ComfyUI 的队列会立刻清空,看起来就像"任务凭空消失":队列 0 个在跑、显存只占 1.1G,
    # 而我的脚本还在傻等一个永远不会出现的文件。
    #
    # 正确写法是从官方示例工作流里读出来的:
    # ~/ComfyUI-H3/user/default/workflows/MiniMax-H3/video_minimax_h3_r2v.json
    # 里那个节点的输入名就是 `ref_images.ref_image_0` / `ref_images.ref_image_1`。
    # 别再从框架源码反推 Autogrow 的命名规则——有现成的示例就读示例。
    #
    # 提示词里的 <Picture 1> 对应 ref_image_0(标号是 1-based,key 是 0-based)。
    for i, name in enumerate(refs):
        node = str(100 + i)
        g[node] = {"class_type": "LoadImage", "inputs": {"image": name}}
        g["10"]["inputs"][f"ref_images.ref_image_{i}"] = [node, 0]
    return g


def run_one(tag, seed, refs, prompt):
    hit = lambda: glob.glob(os.path.join(OUT, f"{tag}_*.mp4"))
    if hit():
        print(f"跳过 {tag}(已有)", flush=True)
        return 0
    before = set(hit())
    urllib.request.urlopen(urllib.request.Request(
        SRV + "/prompt",
        data=json.dumps({"prompt": build(prompt, seed, tag, refs),
                         "client_id": str(uuid.uuid4())}).encode(),
        headers={"Content-Type": "application/json"}))
    print(f"提交 {tag}  {W}x{H}  {LENGTH}帧  seed={seed}  参考图 {len(refs)} 张", flush=True)
    t0 = time.time()
    while time.time() - t0 < 4200:
        time.sleep(15)
        new = set(hit()) - before
        if new:
            f = sorted(new)[0]
            ok = usable(f)
            print("%s %s  %.0f分钟  %d 字节" % ("OK" if ok else "坏文件", os.path.basename(f),
                                                (time.time() - t0) / 60, os.path.getsize(f)), flush=True)
            return 0 if ok else 1
        if int(time.time() - t0) % 300 < 15:
            print("  ...%s 已等 %.0f 分钟" % (tag, (time.time() - t0) / 60), flush=True)
    print(f"  超时 {tag}", flush=True)
    return 1


def main():
    os.makedirs(OUT, exist_ok=True)
    stage_refs()
    bad = 0
    for tag, seed, refs, prompt in SHOTS:
        bad += run_one(tag, seed, refs, prompt)

    for tag, seed, dep, refs, prompt in CHAINED:
        hit = glob.glob(os.path.join(OUT, f"{dep}_*.mp4"))
        if not hit:
            print(f"跳过 {tag}:依赖的 {dep} 没出片", flush=True)
            bad += 1
            continue
        name = f"{dep}_tail.png"
        subprocess.run(["/home/liyakun/bin/ffmpeg", "-v", "error", "-sseof", "-0.15",
                        "-i", sorted(hit)[0], "-vframes", "1", os.path.join(IN, name), "-y"], check=True)
        print(f"  抽出 {dep} 的尾帧 → {name}", flush=True)
        # 尾帧作为第三张参考图,和两张角色图一起进去:既接住空间,又不把机位钉死。
        bad += run_one(tag, seed, refs + [name], prompt)

    print("重拍三镜_DONE" if bad == 0 else f"重拍三镜_PARTIAL 坏 {bad} 条", flush=True)
    return 1 if bad else 0


if __name__ == "__main__":
    raise SystemExit(main())
