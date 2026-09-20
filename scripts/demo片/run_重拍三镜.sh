#!/usr/bin/env bash
# 第二轮构图。**服务已经活着就不重启** —— 装 67GB 权重要 11 分钟,一轮被否掉就
# 重来一次的话,这 11 分钟会被反复浪费。只在端口不返 200 时才起服务。
#
# 判活用 curl 拿真 200,不看 systemctl is-active:本机被「服务 active 但端口返
# 000」骗过。
set -u
UNIT=comfyui-h3.service
LOG=/tmp/comfyui-h3.log

alive() { [ "$(curl -s -o /dev/null -w '%{http_code}' --max-time 4 http://127.0.0.1:8189/system_stats || true)" = "200" ]; }

if alive; then
  echo "ComfyUI-H3 已在跑且返真 200,复用,不重装权重"
else
  systemctl --user stop h3.service 2>/dev/null
  systemctl --user restart "$UNIT" || { echo "起不来"; exit 1; }
  echo "等 ComfyUI-H3 起来(最多 900s)..."
  ok=0
  for i in $(seq 1 180); do
    sleep 5
    if alive; then echo "  真 200,用了 $((i*5))s"; ok=1; break; fi
  done
  [ "$ok" = 1 ] || { echo "超时"; tail -40 "$LOG" 2>/dev/null; systemctl --user stop "$UNIT"; exit 1; }
fi

/home/liyakun/miniconda3/envs/comfyui-h3/bin/python \
  /home/liyakun/文档/Monad_Circle/scripts/demo片/h3_重拍三镜.py
rc=$?

systemctl --user stop "$UNIT" 2>/dev/null
echo "退出码 $rc"
exit $rc
