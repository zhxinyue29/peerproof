#!/usr/bin/env bash
# 起 ComfyUI(8188) -> 等到真 200 -> 跑 hero 动效 -> 停服务还内存。
#
# 这个脚本自己**不**判断内存/显存,那是 大活排队.sh 的活。调用方式:
#   NEED_GB=34 NEED_VRAM_GB=14 RELEASE=comfyui-wan.service \
#     大活排队.sh peerproof-hero /home/liyakun/文档/Monad_Circle/scripts/hero-video/run.sh
#
# 等条件用 curl 拿真 200,不用 systemctl is-active——本机被
# "服务 active 但端口返 000" 骗过。冷启动 75 秒以上是常态。
set -u
UNIT=comfyui-wan
LOG=/tmp/comfyui-wan.log

systemctl --user stop "$UNIT" 2>/dev/null
: > "$LOG"

systemd-run --user --unit="$UNIT" --property=ManagedOOMPreference=omit \
  --property=StandardOutput=append:$LOG --property=StandardError=append:$LOG \
  --working-directory=/home/liyakun/ComfyUI \
  /home/liyakun/miniconda3/envs/comfyui/bin/python main.py --listen 127.0.0.1 --port 8188 \
  || { echo "起不来"; exit 1; }

echo "等 ComfyUI 起来(最多 300s)..."
ok=0
for i in $(seq 1 100); do
  sleep 3
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 4 http://127.0.0.1:8188/system_stats || true)
  if [ "$code" = "200" ]; then echo "  真 200,用了 $((i*3))s"; ok=1; break; fi
done
[ "$ok" = 1 ] || { echo "超时,端口没返 200。日志尾:"; tail -40 "$LOG"; systemctl --user stop "$UNIT"; exit 1; }

/home/liyakun/miniconda3/envs/comfyui/bin/python \
  /home/liyakun/文档/Monad_Circle/scripts/hero-video/animate_hero.py
rc=$?

systemctl --user stop "$UNIT" 2>/dev/null
echo "退出码 $rc"
exit $rc
