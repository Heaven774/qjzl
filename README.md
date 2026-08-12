# 辣椒智慧农业系统

基于 Flask、Node.js 和 Android 的辣椒全产业链智慧农业解决方案，涵盖 **设备监控、AI 智能分析、病虫害识别、冷链运输监控、区块链产品溯源、设备远程控制、视频流监控** 等核心功能。

📖 **详细部署指南与配置说明请参阅子目录文档：**

- Web 端 + 后端服务：[`html/README.md`](html/README.md)
- Android 移动 App：[`smartfarm/README.md`](smartfarm/README.md)

---

## 📁 项目结构

```
qjzl/
├── html/                      # Web端项目 + 后端微服务
│   ├── Android_AI/            # AI 服务
│   │   ├── disease_recognition.py  # 病虫害识别 API (端口: 5000)
│   │   ├── AI.py              # AI 建议服务 (端口: 4000)
│   │   ├── requirements.txt   # Python 依赖
│   │   └── .env               # 本地开发环境变量
│   ├── qjzl/                  # 智慧农业主页面
│   │   ├── index.html         # 登录页
│   │   ├── Smart.html         # 产业数据监控
│   │   ├── sql.html           # 数据中心(历史查询)
│   │   ├── lenglian.html      # 冷链运输监控(高德地图)
│   │   ├── rtsp_server.py     # RTSP摄像头服务 (端口: 8081)
│   │   ├── server/            # Node.js 后端服务
│   │   │   └── server.js      # 主服务 (端口: 3000)
│   │   ├── js/                # JavaScript 文件
│   │   └── css/               # 样式文件
│   ├── trac/                  # 产品溯源服务 (含区块链存证)
│   │   ├── trac.py            # 溯源 API (端口: 5500)
│   │   └── requirements.txt   # Python 依赖
│   ├── deploy/                # Docker 部署配置
│   │   ├── docker-compose.yml # 7 个服务编排
│   │   ├── .env               # 环境变量(部署时填入)
│   │   ├── httpd.conf         # Apache 主配置
│   │   ├── docker-start.sh    # 一键部署脚本(安装Docker+启动)
│   │   ├── enable-autostart.sh # systemd 开机自启配置
│   │   ├── firewall-open-ports.sh # 放行端口脚本
│   │   └── README.md          # 详细部署文档
│   └── README.md              # Web 端详细文档
│
└── smartfarm/                 # Android 端移动应用 (JDK 17)
    ├── app/
    │   ├── src/main/
    │   │   ├── java/com/example/smartfarm/
    │   │   │   ├── LoginActivity.java          # 登录页面
    │   │   │   ├── LaunchScreenActivity.java   # 启动页面
    │   │   │   ├── MainActivity.java           # 主活动(底部导航)
    │   │   │   └── device/
    │   │   │       ├── DeviceMonitorFragment.java   # 设备监控
    │   │   │       ├── AIAnalysisFragment.java      # AI分析
    │   │   │       ├── DiseaseRecognitionFragment.java  # 病虫害识别
    │   │   │       ├── IntegratedControlFragment.java   # 综合控制
    │   │   │       └── TraceabilityFragment.java       # 产品溯源
    │   │   └── res/
    │   │       ├── layout/          # 布局文件
    │   │       ├── drawable/        # 图片资源
    │   │       ├── values/          # 配置资源
    │   │       └── anim/            # 动画资源
    │   ├── libs/nlecloudII/         # 物联网 SDK
    │   └── build.gradle.kts        # 构建配置
    └── README.md                   # Android 端详细文档
```

## 🛠️ 技术栈

### 后端服务
| 服务 | 技术 | 端口 | 源码文件 |
|------|------|------|----------|
| 病虫害识别 | Flask + DeepSeek Vision | 5000 | `html/Android_AI/disease_recognition.py` |
| AI 智能分析 | Flask + DeepSeek Chat | 4000 | `html/Android_AI/AI.py` |
| API 网关/设备数据 | Node.js + Express | 3000 | `html/qjzl/server/server.js` |
| 产品溯源 + 区块链存证 | Flask + MD5 | 5500 | `html/trac/trac.py` |
| RTSP 摄像头流 | Python + OpenCV | 8081 | `html/qjzl/rtsp_server.py` |
| 反向代理 / 静态托管 | Apache HTTPD | 80 | `html/deploy/httpd.conf` |

### 前端
| 平台 | 技术 | 说明 |
|------|------|------|
| Web 管理平台 | HTML5 + CSS3 + JavaScript + 高德地图 JSAPI | 登录/监控/数据中心/冷链/病害/溯源 |
| Android 移动 App | Java (JDK 17) + Android SDK 34 | 设备监控/AI分析/拍照识别/溯源扫码 |

### 数据库
- MariaDB 11.4+（兼容 MySQL）

### 核心库
| 库 | 用途 |
|----|------|
| OkHttp 4.x | Android 网络请求 |
| Retrofit 2.x | REST API 调用 |
| RxJava | 异步编程 |
| Gson | JSON 解析 |
| nlecloudII | 新物联云平台设备通信 |

## ✨ 功能特性

### 🔐 用户登录
- 账号密码登录（前端校验）
- 启动页动画展示

### 📊 设备监控
- 实时温湿度 / 光照 / 土壤监测
- 设备状态卡片展示

### 🤖 AI 智能分析
- 传感器数据智能分析
- 生长趋势预测
- 异常预警提醒
- 后端依赖：`html/Android_AI/AI.py`（调用 DeepSeek Chat API）

### 🌶️ 病虫害识别
- 拍照 / 相册选图 / 历史图片识别
- 按育苗期 / 生长期 / 收获期分类
- 后端依赖：`html/Android_AI/disease_recognition.py`（调用 DeepSeek Vision API）

### 🎛️ 综合控制
- 远程设备控制（物联网设备）
- 智能灌溉 / 环境调节

### 🔍 产品溯源 + 区块链存证
- 溯源码扫码 / 输入查询
- 种植→采摘→加工→运输全链路展示
- 后端依赖：`html/trac/trac.py`（MD5 哈希区块链存证）

### � 冷链运输监控
- 高德地图实时车辆定位
- 车厢温度/湿度/CO₂ 监测
- 后端依赖：`html/qjzl/server/server.js`（云平台数据轮询）

### �📹 视频监控
- RTSP 摄像头接入
- MJPEG 实时流 + PTZ 云台控制

## 🚀 快速开始

### 环境要求
- Linux 服务器（Ubuntu / CentOS / Rocky）
- Docker + Docker Compose
- Android Studio Hedgehog + JDK 17（编译 App）

### 方式一：Docker 一键部署（推荐）

```bash
# 1. 上传项目到服务器，进入 deploy 目录
cd html/deploy

# 2. （首次）一键安装 Docker 并启动所有服务
sudo bash docker-start.sh

# 3. 编辑 .env 文件，填入必需密钥
#    AMAP_KEY=你的高德 JSAPI Key
#    CLOUD_ACCOUNT=新物联云平台账号
#    CLOUD_PASSWORD=新物联云平台密码
#    DEEPSEEK_API_KEY=你的 DeepSeek API Key
#    CAMERA_IP=摄像头 IP（可选）
#    CAMERA_USER / CAMERA_PASSWORD（可选）

# 4. 重启 node 容器使环境变量生效
docker compose restart node

# 5. （可选）配置 systemd 开机自启
sudo bash enable-autostart.sh
```

### 方式二：手动启动（开发调试用）

```bash
# 1. 启动 Node.js API
cd html/qjzl/server
npm install
node server.js

# 2. 启动病虫害识别服务
cd html/Android_AI
pip install -r requirements.txt
python disease_recognition.py

# 3. 启动 AI 建议服务
python AI.py

# 4. 启动溯源 + 区块链服务
cd html/trac
pip install -r requirements.txt
python trac.py

# 5. 启动 RTSP 摄像头服务
cd html/qjzl
python rtsp_server.py
```

### 方式三：Android 端编译运行

```bash
# 使用 Android Studio 打开 smartfarm/ 目录
# 全局搜索 YOUR_SERVER_IP，替换为服务器 IP（不带端口）
# 真机：同局域网 IP；模拟器：10.0.2.2
# 点击 Run
```

## 🌐 API 接口（统一经 Apache 反代 80 端口访问）

所有接口通过 Apache 反向代理访问，**Android 端和前端都使用 80 端口**，无需指定后端端口：

### 病虫害识别
```
POST /disease/api/disease/recognize
Content-Type: multipart/form-data
参数: image - 图片文件
```

### AI 建议
```
POST /ai-service/ai/suggest
Content-Type: application/json
Body: { sensor_data, analysis_type, target }
```

### 设备监控 / 数据接口
```
GET /api/device/status          # 设备状态
GET /api/config                 # 前端动态配置(AMAP_KEY等)
```

### 产品溯源 + 区块链
```
GET /trace/get_qr?code=xxx      # 获取溯源二维码
GET /trace/api/trace/{code}     # 查询溯源详情
```

### RTSP 视频流
```
GET /rtsp/mjpeg                 # MJPEG 实时流
POST /rtsp/ptz                  # 云台控制
```

## 📱 Android 端模块说明

### Activity 组件
| Activity | 描述 |
|----------|------|
| LoginActivity | 登录页面 |
| LaunchScreenActivity | 启动闪屏 |
| MainActivity | 主页面（底部导航） |

### Fragment 组件
| Fragment | 功能 | 后端依赖 |
|----------|------|----------|
| DeviceMonitorFragment | 设备监控（传感器数据） | Node.js `/api/*` |
| AIAnalysisFragment | AI 智能分析 | `html/Android_AI/AI.py` (端口 4000) |
| DiseaseRecognitionFragment | 病虫害识别（拍照/选图） | `html/Android_AI/disease_recognition.py` (端口 5000) |
| IntegratedControlFragment | 综合控制（设备远程控制） | Node.js `/api/*` |
| TraceabilityFragment | 产品溯源（扫码查询） | `html/trac/trac.py` (端口 5500) |

## ⚙️ 环境变量配置（`.env`）

部署时编辑 `html/deploy/.env`，填入以下变量：

```env
# ======= 必需 =======
# 高德地图 JSAPI Key（用于冷链地图）
AMAP_KEY=

# 新物联云平台账号密码（用于设备数据轮询）
CLOUD_ACCOUNT=
CLOUD_PASSWORD=

# DeepSeek AI API Key（用于 AI 分析 / 病害识别）
DEEPSEEK_API_KEY=

# ======= 可选 =======
# RTSP 摄像头配置
CAMERA_IP=
CAMERA_PORT=80
CAMERA_USER=
CAMERA_PASSWORD=

# 服务器公网 IP（部分场景需要）
SERVER_IP=
```

## 📋 Docker Compose 服务清单

| 服务 | 容器名 | 端口 | 说明 |
|------|--------|------|------|
| Apache HTTPD | qjzl-httpd | 80 | 反代 + 静态托管（统一入口） |
| Node.js API | qjzl-node | 3000 | 设备数据、登录、云平台轮询 |
| MariaDB | qjzl-mariadb | 3306 | 数据库（持久化） |
| 病虫害识别 | qjzl-disease | 5000 | DeepSeek Vision API |
| AI 建议 | qjzl-ai | 4000 | DeepSeek Chat API |
| 溯源+区块链 | qjzl-trace | 5500 | MD5 区块链存证 |
| RTSP 摄像头 | qjzl-rtsp | 8081 | OpenCV 视频流 |

> 所有服务使用 `network_mode: host`，彼此通过 `localhost:端口` 通信，外部仅暴露 80 端口。

## 📝 访问地址

| 页面 / 服务 | 地址 |
|------------|------|
| Web 登录页 | `http://服务器IP/login.html` |
| 产业数据监控 | `http://服务器IP/Smart.html` |
| 数据中心 | `http://服务器IP/sql.html` |
| 冷链运输监控 | `http://服务器IP/lenglian.html` |
| 产品溯源 | `http://服务器IP/trace?code=xxx` |
| API 统一入口 | `http://服务器IP/api/` |

## ❓ 常见问题

### Q: Web 页面地图不显示？
A: 检查 `.env` 中 `AMAP_KEY` 是否已填入；需重启 node 容器生效。

### Q: 病虫害识别 / AI 分析报错？
A: 检查 `DEEPSEEK_API_KEY` 是否已填入；查看 `docker compose logs qjzl-ai` 或 `qjzl-disease`。

### Q: 冷链页二氧化碳数据为空？
A: 冷链设备使用独立设备 ID，需在云平台添加时使用冷链设备 ID。

### Q: Docker 服务启动失败？
A: 检查端口占用；查看 `docker compose logs`；确认 `.env` 格式正确。

### Q: Android 模拟器无法连接？
A: 使用 `10.0.2.2` 代替服务器 IP；确保后端已启动。

### Q: 如何完全重建？
A: `cd html/deploy && docker compose down && docker compose up -d --force-recreate`

### Q: 忘记环境变量怎么办？
A: 查看 `html/deploy/.env`；详细说明见 `html/README.md`。

## 📄 License

MIT License

---

**项目维护**: 辣椒智慧农业开发团队
