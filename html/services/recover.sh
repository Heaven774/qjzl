#!/bin/bash
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║   辣椒智慧农业 — 一键恢复全部服务                             ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

# Docker 模式恢复
if docker info &>/dev/null; then
  echo ">>> Docker 模式恢复 ..."
  cd /var/www/html/deploy
  docker compose down 2>/dev/null
  docker compose up -d 2>&1
  sleep 10
  echo ""
  docker compose ps --format "table {{.Name}}\t{{.Status}}"
else
  echo ">>> systemd 模式恢复 ..."
  systemctl restart qjzl
  sleep 10
  for p in "80:qjzl-httpd" "3000:qjzl-node" "3306:qjzl-mariadb" "4000:qjzl-ai" "5000:qjzl-disease" "5500:qjzl-trace" "8081:qjzl-rtsp"; do
    port=${p%%:*}; name=${p##*:}
    ss -tlnp | grep -q ":$port " && echo "  ✅ :$port  $name" || echo "  ❌ :$port  $name"
  done
fi
echo ""
echo "恢复完成，刷新 http://YOUR_SERVER_IP"
