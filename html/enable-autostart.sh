#!/bin/bash
# ============================================
# 辣椒智慧农业 - Docker 服务开机自启配置脚本
# ============================================
# 功能:
#   1. 启用 docker.service 开机自启
#   2. 创建 qjzl.service systemd unit,开机后自动拉起 docker-compose 项目
#   3. 支持 enable / disable / status / start / stop / restart 子命令
#
# 用法:
#   sudo bash enable-autostart.sh             # 默认 enable,配置并启动
#   sudo bash enable-autostart.sh enable      # 配置开机自启
#   sudo bash enable-autostart.sh disable     # 取消开机自启
#   sudo bash enable-autostart.sh status      # 查看服务状态
#   sudo bash enable-autostart.sh start       # 手动启动
#   sudo bash enable-autostart.sh stop        # 手动停止
#   sudo bash enable-autostart.sh restart     # 手动重启
# ============================================
set -e

# ---------- 路径常量 ----------
# 脚本位于 html/ 目录,项目部署目录为 html/deploy/
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_DIR="${SCRIPT_DIR}/deploy"
COMPOSE_FILE="${DEPLOY_DIR}/docker-compose.yml"
SERVICE_NAME="qjzl"
SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"

# ---------- root 权限检查 ----------
if [ "$(id -u)" != "0" ]; then
    echo "❌ 需要 root 权限,请使用 sudo"
    echo "   命令: sudo bash $0 ${1:-enable}"
    exit 1
fi

# ---------- 参数解析 ----------
ACTION="${1:-enable}"

# ---------- 路径检查 ----------
if [ ! -f "$COMPOSE_FILE" ]; then
    echo "❌ 未找到 docker-compose.yml: $COMPOSE_FILE"
    echo "   请确保本脚本位于项目 html/ 目录下"
    exit 1
fi

if ! command -v docker &> /dev/null; then
    echo "❌ Docker 未安装"
    echo "   请先运行: sudo bash deploy/docker-start.sh"
    exit 1
fi

if ! docker compose version &> /dev/null; then
    echo "❌ Docker Compose 不可用"
    exit 1
fi

# 找到 docker compose 二进制路径(供 systemd unit 使用,避免 PATH 问题)
COMPOSE_BIN="$(command -v docker)"
echo "  Docker 二进制路径: $COMPOSE_BIN"

# ============================================
# 生成 systemd unit 文件
# ============================================
create_unit_file() {
    cat > "$SERVICE_FILE" << EOF
[Unit]
Description=QJZL 辣椒智慧农业管理平台 - Docker Compose 服务
Documentation=internal
Requires=docker.service
After=docker.service network-online.target
Wants=network-online.target

[Service]
Type=oneshot
RemainAfterExit=yes

# 工作目录为 deploy/(docker-compose.yml 所在目录)
WorkingDirectory=${DEPLOY_DIR}

# 启动:拉起所有容器(已存在则跳过)
ExecStart=${COMPOSE_BIN} compose -f ${COMPOSE_FILE} up -d

# 停止:优雅关闭所有容器
ExecStop=${COMPOSE_BIN} compose -f ${COMPOSE_FILE} down

# 重启:先 down 再 up
ExecReload=${COMPOSE_BIN} compose -f ${COMPOSE_FILE} restart

# 超时与重试
TimeoutStartSec=300
TimeoutStopSec=120

# 日志输出到 journalctl
StandardOutput=journal
StandardError=journal
SyslogIdentifier=${SERVICE_NAME}

[Install]
WantedBy=multi-user.target
EOF
    chmod 644 "$SERVICE_FILE"
    echo "  ✓ 已创建 $SERVICE_FILE"
}

# ============================================
# 子命令实现
# ============================================
case "$ACTION" in
    enable)
        echo "============================================"
        echo " 配置 ${SERVICE_NAME} 开机自启"
        echo "============================================"

        # 1. 启用 docker.service 开机自启(前置依赖)
        echo ""
        echo "[1/4] 启用 docker.service 开机自启..."
        systemctl enable docker
        systemctl start docker
        echo "  ✓ docker.service 已启用"

        # 2. 创建 systemd unit
        echo ""
        echo "[2/4] 创建 systemd unit 文件..."
        create_unit_file

        # 3. 重新加载 systemd 配置
        echo ""
        echo "[3/4] 重新加载 systemd 配置..."
        systemctl daemon-reload
        echo "  ✓ systemd 配置已重载"

        # 4. 启用 qjzl.service
        echo ""
        echo "[4/4] 启用 ${SERVICE_NAME}.service 开机自启..."
        systemctl enable "${SERVICE_NAME}.service"
        echo "  ✓ ${SERVICE_NAME}.service 已设置为开机自启"

        echo ""
        echo "============================================"
        echo " ✓ 配置完成!"
        echo "============================================"
        echo ""
        echo "  服务架构(开机后自动拉起):"
        echo "    :80    qjzl-httpd     Web 前端"
        echo "    :3000  qjzl-node      API 服务"
        echo "    :3306  qjzl-mariadb   数据库"
        echo "    :4000  qjzl-ai        AI 分析"
        echo "    :5000  qjzl-disease   病害识别"
        echo "    :5500  qjzl-trace     区块链溯源"
        echo "    :8081  qjzl-rtsp      摄像头流"
        echo ""
        echo "  现在手动启动服务?(y/N)"
        read -p "  > " confirm
        if [ "$confirm" = "y" ] || [ "$confirm" = "Y" ]; then
            systemctl start "${SERVICE_NAME}.service"
            echo "  ✓ 服务已启动"
            echo ""
            echo "  查看状态: sudo systemctl status ${SERVICE_NAME}"
            echo "  查看日志: sudo journalctl -u ${SERVICE_NAME} -f"
        else
            echo "  跳过启动,下次开机后会自动拉起"
            echo "  手动启动: sudo systemctl start ${SERVICE_NAME}"
        fi
        ;;

    disable)
        echo "取消 ${SERVICE_NAME} 开机自启..."
        systemctl disable "${SERVICE_NAME}.service" 2>/dev/null || true
        rm -f "$SERVICE_FILE"
        systemctl daemon-reload
        echo "  ✓ ${SERVICE_NAME}.service 已禁用并删除 unit 文件"
        ;;

    start)
        echo "启动 ${SERVICE_NAME}..."
        systemctl start "${SERVICE_NAME}.service"
        systemctl status "${SERVICE_NAME}.service" --no-pager || true
        ;;

    stop)
        echo "停止 ${SERVICE_NAME}..."
        systemctl stop "${SERVICE_NAME}.service"
        echo "  ✓ 已停止"
        ;;

    restart)
        echo "重启 ${SERVICE_NAME}..."
        systemctl restart "${SERVICE_NAME}.service"
        systemctl status "${SERVICE_NAME}.service" --no-pager || true
        ;;

    status)
        echo "============================================"
        echo " ${SERVICE_NAME} 服务状态"
        echo "============================================"
        echo ""
        echo "[systemd 状态]"
        systemctl status "${SERVICE_NAME}.service" --no-pager || true
        echo ""
        echo "[Docker 容器状态]"
        cd "$DEPLOY_DIR"
        docker compose ps --format "table {{.Name}}\t{{.Status}}\t{{.Ports}}" 2>/dev/null || docker compose ps
        ;;

    *)
        echo "用法: $0 {enable|disable|start|stop|restart|status}"
        echo ""
        echo "  enable   - 配置开机自启(默认)"
        echo "  disable  - 取消开机自启"
        echo "  start    - 手动启动"
        echo "  stop     - 手动停止"
        echo "  restart  - 手动重启"
        echo "  status   - 查看状态"
        exit 1
        ;;
esac
