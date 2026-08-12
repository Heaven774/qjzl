#!/bin/bash
# ============================================================
# 放行辣椒智慧农业项目相关端口的防火墙规则
#
# 放行端口列表:
#   80    - Apache HTTPD(Web 前端 + 反向代理)
#   443   - HTTPS(预留)
#   3000  - Node.js API 服务
#   3306  - MariaDB 数据库
#   4000  - AI 建议服务
#   5000  - 病虫害识别服务
#   5500  - 溯源+区块链服务
#   8081  - RTSP 摄像头流服务
#
# 用法:
#   sudo bash firewall-open-ports.sh
# ============================================================
set -e

PORTS=(80 443 3000 3306 4000 5000 5500 8081)

echo "============================================"
echo " 放行防火墙端口规则"
echo "============================================"
echo "  端口: ${PORTS[*]}"
echo ""

if [ "$(id -u)" != "0" ]; then
    echo "❌ 请以 root 身份运行: sudo bash $0"
    exit 1
fi

# ============================================================
# 检测防火墙类型并执行操作
# ============================================================
FIREWALL_TYPE=""

if systemctl is-active --quiet firewalld 2>/dev/null; then
    FIREWALL_TYPE="firewalld"
elif systemctl is-active --quiet ufw 2>/dev/null; then
    FIREWALL_TYPE="ufw"
elif command -v firewall-cmd &> /dev/null; then
    FIREWALL_TYPE="firewalld"
elif command -v ufw &> /dev/null; then
    FIREWALL_TYPE="ufw"
else
    echo "⚠️  未检测到 firewalld 或 ufw,跳过防火墙配置"
    echo "    如果使用 iptables,请手动执行:"
    echo "    iptables -A INPUT -p tcp --dport <port> -j ACCEPT"
    exit 0
fi

echo "  防火墙类型: $FIREWALL_TYPE"
echo "--------------------------------------------"

if [ "$FIREWALL_TYPE" = "firewalld" ]; then
    for port in "${PORTS[@]}"; do
        echo "  🔓 放行端口 $port/tcp ..."
        firewall-cmd --permanent --add-port="$port/tcp" 2>/dev/null || true
    done
    echo ""
    echo "  重新加载防火墙规则..."
    firewall-cmd --reload
    echo ""
    echo "  当前永久开放的端口:"
    OPEN_PORTS=$(firewall-cmd --permanent --list-ports 2>/dev/null)
    if [ -z "$OPEN_PORTS" ]; then
        echo "    (无)"
    else
        echo "    $OPEN_PORTS"
    fi

elif [ "$FIREWALL_TYPE" = "ufw" ]; then
    for port in "${PORTS[@]}"; do
        echo "  🔓 放行端口 $port/tcp ..."
        ufw allow "$port/tcp" 2>/dev/null || true
    done
    echo ""
    echo "  当前 ufw 规则:"
    ufw status numbered 2>/dev/null || ufw status
fi

echo ""
echo "============================================"
echo " ✓ 端口已放行,外部可访问"
echo "============================================"
