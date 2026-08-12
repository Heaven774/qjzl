#!/bin/bash
# ============================================
# 辣椒智慧农业 - Docker 一键部署脚本 (Rocky/CentOS/Ubuntu)
# ============================================
# 用法:
#   sudo bash docker-start.sh            # 首次安装 + 启动
#   sudo bash docker-start.sh --reset    # 清空数据后启动
#   bash docker-start.sh                 # 跳过安装步骤,仅启动
# ============================================
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "============================================"
echo " 辣椒智慧农业管理平台 - Docker 部署"
echo "============================================"
echo ""

# ============================================
# [1/5] root 权限检测(仅安装 Docker 时需要)
# ============================================
NEED_INSTALL_DOCKER=false
if ! command -v docker &> /dev/null; then
    NEED_INSTALL_DOCKER=true
fi

if [ "$NEED_INSTALL_DOCKER" = "true" ] && [ "$(id -u)" != "0" ]; then
    echo "❌ 检测到 Docker 未安装,需要 root 权限进行安装"
    echo "   命令: sudo bash $0"
    exit 1
fi

# ============================================
# [2/5] Docker 安装(按需,Rocky/CentOS 优先)
# ============================================
if [ "$NEED_INSTALL_DOCKER" = "true" ]; then
    echo "[1/5] 安装 Docker..."
    echo "--------------------------------------------"

    # 判断包管理器
    if command -v yum &> /dev/null; then
        # ---------- Rocky / CentOS / RHEL ----------
        echo "  检测到 yum,按 RHEL 系安装..."
        yum install -y -q wget curl yum-utils device-mapper-persistent-data lvm2

        yum remove -y -q docker docker-client docker-client-latest docker-common \
            docker-latest docker-latest-logrotate docker-logrotate docker-engine 2>/dev/null || true

        # 优先官方源,失败则用阿里云镜像
        if ! yum-config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo 2>/dev/null; then
            yum-config-manager --add-repo https://mirrors.aliyun.com/docker-ce/linux/centos/docker-ce.repo
        fi

        yum install -y -q docker-ce docker-ce-cli containerd.io \
            docker-buildx-plugin docker-compose-plugin

    elif command -v apt &> /dev/null; then
        # ---------- Ubuntu / Debian ----------
        echo "  检测到 apt,按 Debian 系安装..."
        apt update -qq
        apt install -y -y ca-certificates curl gnupg lsb-release

        install -m 0755 -d /etc/apt/keyrings
        if [ ! -f /etc/apt/keyrings/docker.gpg ]; then
            curl -fsSL https://download.docker.com/linux/$(. /etc/os-release; echo "$ID")/gpg | \
                gpg --dearmor -o /etc/apt/keyrings/docker.gpg
        fi
        chmod a+r /etc/apt/keyrings/docker.gpg

        echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
https://download.docker.com/linux/$(. /etc/os-release; echo "$ID") \
$(lsb_release -cs) stable" > /etc/apt/sources.list.d/docker.list

        apt update -qq
        apt install -y -y docker-ce docker-ce-cli containerd.io \
            docker-buildx-plugin docker-compose-plugin
    else
        echo "  ✗ 未识别的 Linux 发行版,请手动安装 Docker"
        exit 1
    fi

    # 配置镜像加速器
    mkdir -p /etc/docker
    cat > /etc/docker/daemon.json << 'EOF'
{
    "registry-mirrors": [
        "https://docker.m.daocloud.io",
        "https://hub-mirror.c.163.com",
        "https://mirrors.aliyun.com/dockerhub"
    ],
    "exec-opts": ["native.cgroupdriver=systemd"],
    "log-driver": "json-file",
    "log-opts": { "max-size": "100m" },
    "storage-driver": "overlay2"
}
EOF

    systemctl daemon-reload
    systemctl enable docker
    systemctl start docker

    # 防火墙放行端口(架构表里的7个对外端口)
    if systemctl is-active --quiet firewalld; then
        for port in 80 443 3000 3306 4000 5000 5500 8081; do
            firewall-cmd --permanent --add-port=${port}/tcp
        done
        firewall-cmd --reload
        echo "  ✓ 防火墙端口已放行"
    fi

    echo "  ✓ Docker 安装完成: $(docker --version)"
    echo ""
else
    echo "[1/5] Docker 已安装,跳过安装步骤"
    echo "  $(docker --version)"
    echo ""
fi

# ============================================
# [3/5] Docker 服务运行状态检查
# ============================================
echo "[2/5] Docker 服务检查..."
echo "--------------------------------------------"
if ! docker info &> /dev/null; then
    echo "  Docker 服务未运行,尝试启动..."
    systemctl start docker
    sleep 2
    if ! docker info &> /dev/null; then
        echo "❌ Docker 服务启动失败"
        exit 1
    fi
fi
echo "  ✓ Docker 服务正在运行"

if ! docker compose version &> /dev/null; then
    echo "❌ Docker Compose 不可用"
    exit 1
fi
echo "  ✓ Docker Compose: $(docker compose version | awk '{print $4}')"

# ============================================
# [4/5] 配置文件检查与初始化
# ============================================
echo ""
echo "[3/5] 配置文件检查..."
echo "--------------------------------------------"

if [ ! -f docker-compose.yml ]; then
    echo "❌ docker-compose.yml 不存在,请确保在 deploy 目录运行"
    exit 1
fi
echo "  ✓ docker-compose.yml 存在"

# 检查关键源码文件
PROJECT_DIR=".."
for f in "$PROJECT_DIR/qjzl/server/server.js" \
         "$PROJECT_DIR/qjzl/sql/database.sql" \
         "$PROJECT_DIR/qjzl/rtsp_server.py"; do
    if [ -f "$f" ]; then
        echo "  ✓ $(basename $f) 存在"
    else
        echo "  ⚠️  $f 不存在"
    fi
done

# .env 自动从模板创建
if [ ! -f .env ]; then
    echo "  - .env 不存在,从 .env.example 创建..."
    cp .env.example .env
    echo "  ⚠️  已创建 .env,请编辑填写 AMAP_KEY / CLOUD_ACCOUNT / CLOUD_PASSWORD"
else
    echo "  ✓ .env 已存在"
fi

# ============================================
# 处理 --reset 参数
# ============================================
if [ "${1:-}" = "--reset" ] || [ "${1:-}" = "-r" ]; then
    echo ""
    echo "⚠️  检测到 --reset 参数"
    echo "  将清空数据库中所有表的数据,ID 从 1 重新开始!"
    read -p "  确认继续?(y/N): " confirm
    if [ "$confirm" != "y" ] && [ "$confirm" != "Y" ]; then
        echo "❌ 已取消重置"
        exit 0
    fi

    echo ""
    echo "[重置] 启动 MariaDB 容器..."
    docker compose up -d mariadb
    echo "[重置] 等待 MariaDB 就绪..."
    sleep 15

    MYSQL_ROOT_PASSWORD="${MYSQL_ROOT_PASSWORD:-root}"
    DB_NAME="${MYSQL_DATABASE:-qjzl}"

    SQL_FILE="../qjzl/sql/truncate_all.sql"
    if [ -f "$SQL_FILE" ]; then
        docker compose exec -T mariadb mysql -u root -p${MYSQL_ROOT_PASSWORD} ${DB_NAME} < "$SQL_FILE"
        echo "[重置] ✅ 所有数据已清空,ID 已重置"
    else
        echo "[重置] ❌ 未找到 $SQL_FILE"
        exit 1
    fi
fi

# ============================================
# [5/5] 构建并启动所有容器
# ============================================
echo ""
echo "[4/5] 构建 Docker 镜像(首次较慢,后续走缓存)..."
echo "--------------------------------------------"
docker compose build

echo ""
echo "[5/5] 启动所有服务..."
echo "--------------------------------------------"
docker compose up -d

echo ""
echo "  - 等待数据库和 API 服务就绪(15s)..."
sleep 15

# 打印容器状态
echo ""
echo "  容器状态:"
docker compose ps --format "table {{.Name}}\t{{.Status}}\t{{.Ports}}" 2>/dev/null || docker compose ps

echo ""
echo "============================================"
echo " ✓ 部署完成!"
echo "============================================"
echo ""
echo "  【架构】"
echo "    :80    qjzl-httpd     Web 前端     (httpd:alpine, login.html)"
echo "    :3000  qjzl-node      API 服务     (Express, 30 REST)"
echo "    :3306  qjzl-mariadb   数据库       (MariaDB 11.4, 库 qjzl)"
echo "    :4000  qjzl-ai        AI 分析      (Flask → DeepSeek)"
echo "    :5000  qjzl-disease   病害识别     (Flask → DeepSeek Vision)"
echo "    :5500  qjzl-trace     区块链溯源   (Flask + hashlib + qrcode)"
echo "    :8081  qjzl-rtsp      摄像头流     (RTSP→MJPEG, PTZ)"
echo ""
echo "  【访问地址】(Apache 反向代理,统一走 80 端口)"
echo "    登录页:        http://<服务器IP>/login.html"
echo "    监控主页:      http://<服务器IP>/qjzl/Smart.html"
echo "    冷链追踪:      http://<服务器IP>/qjzl/lenglian.html"
echo "    数据中心:      http://<服务器IP>/qjzl/sql.html"
echo ""
echo "  【常用命令】"
echo "    查看日志:      docker compose logs -f"
echo "    查看状态:      docker compose ps"
echo "    停止服务:      docker compose down"
echo "    重启某服务:    docker compose restart node"
echo ""
echo "  【开机自启】(可选)"
echo "    bash ../enable-autostart.sh    # 配置 systemd 开机自动拉起"
echo ""
