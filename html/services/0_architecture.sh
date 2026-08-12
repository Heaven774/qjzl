#!/bin/bash
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║     辣椒智慧农业 — 自主开发服务器架构                          ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""
echo "  ╔══════════════════════════════════════════════════════════╗"
echo "  ║     前后端分离 + 7 微服务架构                             ║"
echo "  ╠══════════════════════════════════════════════════════════╣"
echo "  ║                                                          ║"
echo "  ║  Android / 浏览器                                        ║"
echo "  ║       │                                                  ║"
echo "  ║  ┌────┴────────┐                                         ║"
echo "  ║  │ qjzl-httpd  │  :80   httpd:alpine  Web前端            ║"
echo "  ║  └────┬────────┘                                         ║"
echo "  ║       │                                                  ║"
echo "  ║  ┌────┴────────┐   Node.js → 高并发 API (事件驱动)       ║"
echo "  ║  │ qjzl-node   │  :3000  Node.js/Express  API交通枢纽     ║"
echo "  ║  └────┬────────┘                                         ║"
echo "  ║       │                                                  ║"
echo "  ║  ┌────┼──────────┬──────────┬──────────┬──────────┐     ║"
echo "  ║  │    │          │          │          │          │     ║"
echo "  ║  ▼    ▼          ▼          ▼          ▼          ▼     ║"
echo "  ║ :3306  :4000     :5000      :5500      :8081            ║"
echo "  ║ MariaDB AI分析   病害识别   区块链溯源  摄像头RTSP        ║"
echo "  ║                                                        ║"
echo "  ║  Python → AI 推理 + 图像处理 (天然优势)                  ║"
echo "  ║  各取所长 · 独立更新 · 互不绑定                           ║"
echo "  ╚══════════════════════════════════════════════════════════╝"
echo ""
echo "  ┌─────────────────────────────────────────────────────┐"
echo "  │  Docker 一键化全自动部署                               │"
echo "  │  cd /var/www/html/deploy && docker compose up -d      │"
echo "  │  network_mode: host  ·  7 容器并行启动                 │"
echo "  │  httpd:alpine | node:18-alpine | python:3.12-alpine  │"
echo "  │  mariadb:11.4                                        │"
echo "  └─────────────────────────────────────────────────────┘"
echo ""

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║  Docker 部署状态  (实时)                                     ║"
echo "╠══════════════════════════════════════════════════════════════╣"

if docker info &>/dev/null; then
  cd /var/www/html/deploy 2>/dev/null
  total=0 up=0
  while IFS= read -r line; do
    name=$(echo "$line" | awk '{print $1}')
    raw=$(echo "$line" | awk '{$1=""; print $0}' | xargs)
    case "$raw" in
      *Up*)
        icon="🟢"; up=$((up+1))
        t=$(echo "$raw" | sed "s/Up //; s/ (healthy)//")
        # 翻译
        t=$(echo "$t" | sed "s/About a minute/约1分钟/")
        t=$(echo "$t" | sed "s/less than a second/不到1秒/")
        t=$(echo "$t" | sed "s/\([0-9]*\) seconds/\1秒/")
        t=$(echo "$t" | sed "s/\([0-9]*\) minutes/\1分钟/")
        t=$(echo "$t" | sed "s/\([0-9]*\) hours/\1小时/")
        t=$(echo "$t" | sed "s/\([0-9]*\) days/\1天/")
        status="运行中 $t"
        ;;
      *Restarting*) icon="🟡"; status="重启中";;
      *Exited*)      icon="🔴"; status="已停止";;
      *)             icon="🔴"; status="$raw";;
    esac
    total=$((total+1))
    printf "  %-18s %s  %s\n" "$name" "$icon" "$status"
  done < <(docker compose ps --format "{{.Name}} {{.Status}}" 2>/dev/null)
  echo "  ─────────────────────────────────"
  echo "  共计 ${total} 容器  |  运行中 ${up}  |  待启动 $((total - up))"
else
  echo "  Docker 未运行"
fi
echo "╚══════════════════════════════════════════════════════════════╝"
