#!/usr/bin/env bash
# 起 ComfyUI-H3(8189) -> 等到真 200 -> 跑 hero 对照组 -> 停服务还内存。
#
# 用已有的 comfyui-h3.service,不另起 unit:8189 上有 comfyui-h3 和 h3 两个重复
# 的 unit,同时起会互相抢端口。
#
# 冷启动要装 67 GB 权重,比 Wan 那套慢得多,所以给 900 秒;而且**只认 curl 的真
# 200**,不看 systemctl is-active —— 本机被 "active 但端口返 000" 骗过。
set -u
UNIT=comfyui-h3.service
LOG=/tmp/comfyui-h3.log

systemctl --user stop h3.service 2>/dev/null
systemctl --user restart "$UNIT" || { echo "起不来"; exit 1; }

echo "等 ComfyUI-H3 起来(最多 900s,要装 67GB 权重)..."
ok=0
for i in $(seq 1 180); do
  sleep 5
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 4 http://127.0.0.1:8189/system_stats || true)
  if [ "$code" = "200" ]; then echo "  真 200,用了 $((i*5))s"; ok=1; break; fi
done
[ "$ok" = 1 ] || { echo "超时,端口没返 200。日志尾:"; tail -40 "$LOG" 2>/dev/null; systemctl --user stop "$UNIT"; exit 1; }

/home/liyakun/miniconda3/envs/comfyui-h3/bin/python \
  /home/liyakun/文档/Monad_Circle/scripts/hero-video/h3_scene.py
rc=$?

systemctl --user stop "$UNIT" 2>/dev/null
echo "退出码 $rc"
exit $rc
