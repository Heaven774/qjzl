# 辣椒智慧农业管理平台 - 技术文档

> **版本**: 2026
> **技术栈**: 纯前端 HTML/CSS/JavaScript + Node.js + MariaDB + Python Flask + Apache HTTPD
> **风格**: 科技深色主题（青蓝色 `#00f5ff` + 紫色 `#7e42ff`）

---

## 目录

1. [系统架构](#1-系统架构)
2. [前端页面配置](#2-前端页面配置)
3. [后端服务配置](#3-后端服务配置)
4. [摄像头/RTSP配置](#4-摄像头rtsp配置)
5. [数据库配置](#5-数据库配置)
6. [API接口文档](#6-api接口文档)
7. [传感器与执行器](#7-传感器与执行器)
8. [AI智能分析配置](#8-ai智能分析配置)
9. [AI建议服务（独立服务）](#9-ai建议服务独立服务)
10. [病虫害识别服务（独立服务）](#10-病虫害识别服务独立服务)
11. [登录认证配置](#11-登录认证配置)
12. [图表配置](#12-图表配置)
13. [可更改参数速查表](#13-可更改参数速查表)
14. [Docker 部署](#14-docker-部署)

---

## 1. 系统架构

### 1.1 页面流转

```
login.html → index.html → Smart.html  (产业数据监控)
                        → lenglian.html (冷链运输监控)
                        → sql.html      (历史数据中心)
                        → test-api.html  (API测试)
二维码扫描 → /trace?code=XXX  (产品溯源 + 区块链存证验证)
```

### 1.2 服务架构

所有外部请求通过 Apache HTTPD(80端口)统一接入,前端不再需要带端口号:

| 服务 | 技术 | 端口 | Apache 代理路径 | 容器名 |
|------|------|------|----------------|--------|
| Web服务器 | Apache HTTPD | 80 | - (静态文件直接返回) | qjzl-httpd |
| 后端API服务 | Node.js + Express | 3000 | `/api/*` | qjzl-node |
| 摄像头流服务 | Python + Flask | 8081 | `/rtsp/*` | qjzl-rtsp |
| AI建议服务 | Python + Flask | 4000 | `/ai-service/*` | qjzl-ai |
| 病虫害识别服务 | Python + Flask | 5000 | `/disease/*` | qjzl-disease |
| 溯源+区块链存证服务 | Python + Flask | 5500 | `/trace/*` | qjzl-trace |
| 数据库 | MariaDB 11.4 | 3306 | - (内部) | qjzl-mariadb |

### 1.3 项目目录结构

```
html/
├── index.html                 # 首页入口（导航卡片）
├── login.html                 # 用户登录
├── README.md                  # 本文件
├── Android_AI/                # AI 智能分析服务
│   ├── AI.py                  #   AI 建议服务（DeepSeek, port 4000）
│   ├── disease_recognition.py #   病虫害识别服务（DeepSeek, port 5000）
│   ├── .env                   #   DeepSeek API Key 配置
│   └── requirements.txt       #   Python 依赖
├── deploy/
│   ├── docker-compose.yml     # Docker 容器编排（MariaDB+Node+AI+病害+Trace+RTSP+HTTPD）
│   ├── Dockerfile.node        # Node.js 服务镜像
│   ├── Dockerfile.python      # Python 流服务镜像
│   ├── Dockerfile.trace       # Flask 溯源+区块链存证服务镜像（Rocky Linux）
│   ├── Dockerfile.ai          # AI 建议服务镜像（Rocky Linux）
│   ├── Dockerfile.disease     # 病虫害识别服务镜像（Rocky Linux）
│   ├── Dockerfile.httpd       # Apache HTTPD 镜像（Alpine）
│   ├── .env.example           # 环境变量模板
│   ├── .env                   # 环境变量配置
│   ├── httpd.conf             # Apache HTTPD 主配置(含反向代理+安全加固)
│   ├── httpd-custom.conf      # HTTPD 自定义配置
│   ├── httpd-vhosts.conf      # HTTPD 虚拟主机配置
│   ├── default.conf           # 默认站点配置
│   ├── docker-start.sh        # 一键部署脚本(含Docker安装+服务启动)
│   └── startup.bat            # Windows 启动脚本（含防火墙配置和开机自启）
├── qjzl/
│   ├── Smart.html             # 产业数据监控主页面
│   ├── lenglian.html          # 冷链运输监控
│   ├── sql.html               # 历史数据中心
│   ├── test-api.html          # API测试工具
│   ├── STARTUP_GUIDE.md       # 本地启动指南
│   ├── css/
│   │   ├── styles.css         # Smart.html 样式
│   │   ├── styles1.css        # lenglian.html 样式
│   │   └── floating-panel.css # 悬浮面板通用样式
│   ├── js/
│   │   ├── script.js          # Smart.html 主脚本
│   │   ├── script1.js         # lenglian.html + sql.html 脚本
│   │   ├── ai-predict.js      # AI 智能分析模块
│   │   ├── nlecloud-sdk.js    # NleCloud 云平台 SDK
│   │   ├── nlecloud-sdk.min.js# SDK 压缩版
│   │   ├── flv.min.js         # FLV 播放器
│   │   └── jquery.min.js      # jQuery
│   ├── server/
│   │   ├── server.js          # Express 服务端入口
│   │   ├── init-db.js         # 数据库初始化脚本
│   │   └── package.json       # 依赖配置
│   ├── sql/
│   │   ├── database.sql       # 建表语句
│   │   └── truncate_all.sql   # 清空所有数据并重置ID
│   ├── hls/                   # HLS 直播切片
│   │   ├── stream.m3u8
│   │   └── segment_*.ts
│   ├── rtsp_server.py         # Python 摄像头流服务器
│   ├── start_services.sh      # 本地一键启动脚本（支持 --reset 参数）
│   └── stop_services.sh       # 本地停止脚本
├── trac/
│   ├── trac.py                # Flask 溯源 + 区块链存证服务（主程序）
│   ├── requirements.txt       # Python 依赖
│   ├── image_stage_cache.json # 图片阶段缓存
│   └── qinla_images/          # 溯源展示图片
├── enable-autostart.sh        # systemd 开机自启配置脚本
```

---

## 2. 前端页面配置

### 2.1 后端API地址

所有前端页面使用相对路径,通过 Apache 反向代理访问后端服务,不再需要端口号:

| 文件 | 变量 | 当前值 |
|------|------|--------|
| `js/script.js` | `API_BASE` | `/api` |
| `js/script1.js` | `API_BASE` | `/api` |
| `js/ai-predict.js` | `window.API_BASE` | `/api` |
| `login.html` | `API_BASE` | `/api` |
| `Smart.html` | `RTSP_SERVER` | `/rtsp` |
| `sql.html` | `API_BASE` / `FLASK_API_BASE` | `/api` / `/disease/api` |

### 2.2 摄像头直播地址

配置在 `Smart.html` 中,通过 Apache 反向代理访问:

| 参数 | 当前值 |
|------|--------|
| MJPEG直播流 | `/rtsp/mjpeg` |
| 快照接口 | `/rtsp/snapshot` |
| PTZ控制 | `/rtsp/ptz`、`/rtsp/ptz/zoom`、`/rtsp/ptz/zoom/stop` |

### 2.3 云平台配置 (lenglian.html)

冷链监控页面的高德地图Key和新物联云平台账号密码已改为**配置驱动**,通过 Docker 环境变量注入:

1. **环境变量**(`deploy/.env`):
   ```env
   AMAP_KEY=你的高德JSAPI Key
   CLOUD_ACCOUNT=新物联云平台账号
   CLOUD_PASSWORD=新物联云平台密码
   CLOUD_POLLING_INTERVAL=10000
   ```

2. **Node 服务接口** `GET /api/config`:
   返回上述环境变量给前端

3. **前端动态加载** `js/script1.js`:
   - 页面加载时先调 `/api/config` 获取配置
   - 动态加载高德地图脚本(`AMAP_KEY`)
   - 用 `CLOUD_ACCOUNT`/`CLOUD_PASSWORD` 登录云平台

> **降级行为**:未配置 `AMAP_KEY` 时地图显示提示信息;未配置云平台账号时使用固定模拟数据。

### 2.4 样式变量

所有页面统一使用以下CSS变量体系（在各自 `<style>` 或 `.css` 文件中定义）：

```css
:root {
    --primary: #00f5ff;           /* 主色-青色 */
    --primary-dim: rgba(0,245,255,0.08);
    --secondary: #7e42ff;          /* 辅色-紫色 */
    --accent: #ff2a6d;             /* 强调色-红色 */
    --success: #00ff9d;            /* 成功色-绿色 */
    --dark: #0a0e17;               /* 深色背景 */
    --card-bg: rgba(12, 18, 30, 0.88);  /* 卡片背景 */
    --card-border: rgba(0,245,255,0.18); /* 边框 */
    --transition: 0.25s cubic-bezier(0.4, 0, 0.2, 1);  /* 统一缓动 */
}
```

### 2.5 页面路由

| 页面 | 用途 | 配置点 |
|------|------|--------|
| `index.html` | 首页导航 | 无特殊配置 |
| `login.html` | 登录 | API_BASE、sessionStorage键名 |
| `Smart.html` | 监控主页面 | API_BASE、摄像头URL、云平台配置、22个传感器标识、7个执行器标识 |
| `lenglian.html` | 冷链运输 | API_BASE、高德地图Key |
| `sql.html` | 历史数据 | API_BASE、各数据表API路由 |
| `test-api.html` | API测试 | API地址 |

---

## 3. 后端服务配置

### 3.1 启动命令

```bash
cd qjzl/server

# 安装依赖
npm install

# 开发模式（热重载）
npm run dev

# 生产模式
npm start

# 仅启动数据库服务
npm run start:db

# 仅启动RTSP服务
npm run start:rtsp
```

### 3.2 数据库连接配置 (`server.js`)

```javascript
const dbConfig = {
    host: process.env.DB_HOST || 'YOUR_SERVER_IP',      // 数据库地址
    port: parseInt(process.env.DB_PORT) || 3306,        // 数据库端口
    user: process.env.DB_USER || 'root',                 // 用户名
    password: process.env.DB_PASSWORD || '',             // 密码
    database: process.env.DB_NAME || 'qjzl',             // 数据库名
    charset: 'utf8mb4',
    connectionLimit: 10,                                 // 连接池上限
    waitForConnections: true,
    queueLimit: 0
};
```

### 3.3 服务器端口

```javascript
const PORT = process.env.PORT || 3000;  // Express监听端口
```

### 3.4 CORS配置

```javascript
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
```

### 3.5 请求体大小限制

```javascript
app.use(bodyParser.json({ limit: '10mb' }));       // JSON请求体
app.use(bodyParser.urlencoded({ limit: '10mb', extended: true }));  // 表单请求体
```

### 3.6 静态文件服务

```javascript
app.use(express.static(path.join(__dirname, '..')));     // qjzl 目录
app.use(express.static(path.join(__dirname, '../..')));  // html 上级目录
```

### 3.7 npm依赖 (`package.json`)

| 包名 | 版本 | 用途 |
|------|------|------|
| express | ^4.18.2 | Web框架 |
| mysql2 | ^3.6.0 | MySQL驱动 |
| cors | ^2.8.5 | 跨域支持 |
| body-parser | ^1.20.2 | 请求体解析 |
| concurrently | ^8.2.0 | 多命令并行 |
| nodemon (dev) | ^3.0.1 | 热重载 |

---

## 4. 摄像头/RTSP配置

### 4.1 Python依赖

```bash
pip install flask flask-cors requests opencv-python numpy
```

### 4.2 摄像头服务器配置

| 参数 | 代码位置 | 默认值 | 可改 |
|------|---------|--------|------|
| 监听地址 | `app.run(host='0.0.0.0', port=8081)` | `0.0.0.0:8081` | ✔ |
| 调试模式 | `debug=False` | `False` | ✔ |
| 多线程 | `threaded=True` | `True` | ✔ |

### 4.3 摄像头连接配置

```python
camera_config = {
    'ip': '你的摄像头局域网IP',    # 摄像头IP地址
    'port': 80,                    # HTTP端口
    'username': '你的摄像头用户名', # 登录用户名
    'password': '你的摄像头密码'    # 登录密码
}
```

### 4.4 RTSP地址格式

```python
main_rtsp_url = f"rtsp://{camera_config['username']}:{camera_config['password']}@{camera_config['ip']}:554/stream1"
sub_rtsp_url  = f"rtsp://{camera_config['username']}:{camera_config['password']}@{camera_config['ip']}:554/stream2"
```

### 4.5 画质与性能参数

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `JPEG_QUALITY` | `75` | MJPEG流图片质量 (0-100) |
| `FRAME_SKIP` | `0` | 跳帧数（0=不跳） |
| `BUFFER_SIZE` | `1` | OpenCV缓冲区大小 |
| `DISPLAY_WIDTH` | `854` | 流输出宽度 (px) |
| `DISPLAY_HEIGHT` | `480` | 流输出高度 (px) |
| `min_interval` | `1.0/20.0` | 帧发送最小间隔（约50fps上限） |

### 4.6 数字缩放参数

| 参数 | 默认值 | 范围 |
|------|--------|------|
| `digital_zoom_level` | `1.0` | 1.0 ~ 3.0 |
| `ZOOM_MIN` | `1.0` | 最小缩放 |
| `ZOOM_MAX` | `3.0` | 最大缩放 |

### 4.7 PTZ云台控制

| 参数 | 默认值 |
|------|--------|
| pan/tilt 速度 | `±0.5` |
| ProfileToken | `PTZNODETOKEN` |
| 请求超时 | `1`秒 |
| Web服务地址 | `http://{ip}:{port}/onvif/ptz_service` |

### 4.8 截图保存

```python
# 截图JPEG质量
snapshot_quality = 95

# 保存地址（Node.js后端）
DB_SERVER = 'http://YOUR_SERVER_IP:3000'
# 保存接口 POST /api/pictrue
```

### 4.9 重连机制

| 参数 | 默认值 |
|------|--------|
| 最大重试次数 | `3` |
| 重试等待 | 间隔2秒（超过次数后）/ 1秒（常规） |

### 4.10 后端数据库服务地址 (rtsp_server.py)

```python
DB_SERVER = 'http://YOUR_SERVER_IP:3000'  # 截图保存到的Node.js服务地址
```

---

## 5. 数据库配置

### 5.1 数据库全局设置

```sql
CREATE DATABASE IF NOT EXISTS qjzl
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_unicode_ci;
```

### 5.2 表结构

#### sensor_data（传感器数据）

| 字段 | 类型 | 说明 | 索引 |
|------|------|------|------|
| id | BIGINT AUTO_INCREMENT | 主键 | PK |
| device_id | VARCHAR(50) | 设备ID | INDEX |
| sensor_type | VARCHAR(50) | 传感器类型 | INDEX |
| sensor_name | VARCHAR(100) | 名称 | - |
| value | DECIMAL(10,2) | 数值 | - |
| unit | VARCHAR(20) | 单位 | - |
| location | VARCHAR(50) | 位置 | INDEX |
| record_time | DATETIME | 记录时间 | INDEX |
| timestamp | BIGINT | 时间戳 | - |

#### device_status_history（设备状态）

| 字段 | 类型 | 说明 | 索引 |
|------|------|------|------|
| id | BIGINT AUTO_INCREMENT | 主键 | PK |
| device_id | VARCHAR(50) | 设备ID | INDEX |
| device_name | VARCHAR(100) | 名称 | - |
| status | VARCHAR(20) | 状态(online/offline/error) | INDEX |
| action | VARCHAR(50) | 操作(start/stop/error) | - |
| location | VARCHAR(50) | 位置 | - |
| record_time | DATETIME | 记录时间 | INDEX |

#### login_logs（登录日志）

| 字段 | 类型 | 说明 | 索引 |
|------|------|------|------|
| id | BIGINT AUTO_INCREMENT | 主键 | PK |
| username | VARCHAR(100) | 用户名 | INDEX |
| login_time | DATETIME | 登录时间 | INDEX |
| ip_address | VARCHAR(50) | IP地址 | - |
| status | VARCHAR(20) | 状态(success/failed) | INDEX |
| failure_reason | TEXT | 失败原因 | - |

#### ai_analysis_history（AI分析记录）

| 字段 | 类型 | 说明 | 索引 |
|------|------|------|------|
| id | BIGINT AUTO_INCREMENT | 主键 | PK |
| analysis_type | VARCHAR(50) | 类型(prediction/optimization/risk) | INDEX |
| risk_level | VARCHAR(20) | 风险等级(low/medium/high) | INDEX |
| environment_assessment | TEXT | 环境评估 | - |
| analysis_time | DATETIME | 分析时间 | INDEX |
| model_version | VARCHAR(50) | 模型版本 | - |
| confidence_score | DECIMAL(5,2) | 置信度 | - |

#### vehicle_data（车辆数据）

| 字段 | 类型 | 说明 | 索引 |
|------|------|------|------|
| id | BIGINT AUTO_INCREMENT | 主键 | PK |
| vehicle_id | VARCHAR(50) | 车辆ID | INDEX |
| vehicle_number | VARCHAR(50) | 车牌号 | INDEX |
| location_latitude | DECIMAL(10,7) | 纬度 | - |
| location_longitude | DECIMAL(10,7) | 经度 | - |
| temperature | DECIMAL(5,2) | 温度 | - |
| humidity | DECIMAL(5,2) | 湿度 | - |
| co2_level | DECIMAL(8,2) | CO2浓度 | - |
| door_status | VARCHAR(20) | 车门状态 | - |
| record_time | DATETIME | 记录时间 | INDEX |

#### vehicle_config（车辆配置）

| 字段 | 类型 | 说明 | 约束 |
|------|------|------|------|
| id | BIGINT AUTO_INCREMENT | 主键 | PK |
| vehicle_number | VARCHAR(50) | 车辆编号 | UNIQUE, INDEX |
| main_device_id | VARCHAR(50) | 主设备ID | NOT NULL |
| cold_chain_device_id | VARCHAR(50) | 冷链设备ID | NOT NULL |
| sensor_tags | TEXT | 传感器标识配置(JSON) | - |
| coords | TEXT | 坐标(JSON) | - |

#### system_logs（系统日志）

| 字段 | 类型 | 说明 | 索引 |
|------|------|------|------|
| id | BIGINT AUTO_INCREMENT | 主键 | PK |
| log_type | VARCHAR(50) | 类型(info/warning/error) | INDEX |
| module | VARCHAR(100) | 模块名 | INDEX |
| message | TEXT | 日志消息 | - |
| record_time | DATETIME | 记录时间 | INDEX |

#### pictrue（图片存储）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | BIGINT AUTO_INCREMENT | 主键 PK |
| image_data | LONGBLOB | 图片二进制数据 |
| filename | VARCHAR(255) | 文件名 |
| filesize | INT | 文件大小(字节) |
| created_at | DATETIME | 创建时间, INDEX |

#### blockchain_proof（区块链存证记录）

| 字段 | 类型 | 说明 | 索引 |
|------|------|------|------|
| id | INT AUTO_INCREMENT | 主键 | PK |
| proof_code | VARCHAR(17) | 溯源码(e.g. 61011320251001A15) | INDEX |
| prod_date | VARCHAR(8) | 生产日期(YYYYMMDD) | - |
| region_code | VARCHAR(6) | 区域码 | - |
| variety_code | VARCHAR(1) | 品种码(A-E) | - |
| batch_no | VARCHAR(2) | 批次号(01-99) | - |
| salt_value | VARCHAR(32) | 密钥盐值(默认qinjiao) | - |
| raw_material | VARCHAR(200) | 拼接原文(用于MD5计算) | - |
| md5_hash | VARCHAR(32) | MD5存证哈希(32位大写) | INDEX |
| verify_code | VARCHAR(8) | 随机验证码(6位字母+数字) | INDEX |
| created_at | DATETIME | 存证时间 | INDEX |

---

## 6. API接口文档

### 6.1 健康检查

```
GET /api/health
→ { success: true, dbConnected: bool, dbState: string }
```

### 6.2 统计数据

```
GET /api/stats/overview
→ { success: true, data: { 表名: 记录数, ... } }
```

### 6.3 传感器数据

```
GET /api/sensor/data?keyword=&device_id=&sensor_type=&location=&start_time=&end_time=&limit=
→ { success: true, data: [...] }

POST /api/sensor/data
Body: { device_id, sensor_type, sensor_name, value, unit, location, record_time }
→ { success: true, id: number }
```

### 6.4 设备状态

```
GET /api/device/status?device_name=&status=&start_time=&end_time=&limit=
→ { success: true, data: [...] }

POST /api/device/status
Body: { device_id, device_name, status, action, location, record_time }
→ { success: true, id: number }
```

### 6.5 登录日志

```
GET /api/login/logs?username=&status=&start_time=&end_time=&limit=
→ { success: true, data: [...] }

POST /api/login/log
Body: { user_id, username, status, failure_reason, user_agent, session_id }
→ { success: true, id: number }
```

### 6.6 AI分析

```
GET /api/ai/analysis?analysis_type=&risk_level=&start_time=&end_time=&limit=
→ { success: true, data: [...] }

POST /api/ai/analysis
Body: { analysis_type, environment_assessment, risk_level, predictions, suggestions, ... }
→ { success: true, id: number }
```

### 6.7 车辆数据

```
GET /api/vehicle/data?vehicle_number=&start_time=&end_time=&limit=
→ { success: true, data: [...] }

GET /api/vehicle/numbers
→ { success: true, data: ['车牌号1', ...] }

POST /api/vehicle/data
Body: { vehicle_id, vehicle_number, location_latitude, location_longitude, ... }
→ { success: true, id: number }

POST /api/vehicle/config
Body: { vehicle_id, vehicle_number, main_device_id, cold_chain_device_id, sensor_tags, ... }
→ { success: true, id: number }

GET /api/vehicle/configs
→ { success: true, data: [...] }

DELETE /api/vehicle/config/:id
→ { success: true, message }
```

### 6.8 系统日志

```
GET /api/system/logs?module=&log_type=&start_time=&end_time=&limit=
→ { success: true, data: [...] }

POST /api/system/log
Body: { log_type, module, action, message, details, user_id }
→ { success: true, id: number }
```

### 6.9 图片管理

```
GET /api/pictrue?start_time=&end_time=&limit=
→ { success: true, data: [{ id, filename, filesize, created_at }] }

GET /api/pictrue/:id
→ 图片二进制 (Content-Type: image/jpeg)

POST /api/pictrue
Body: { image_base64: string, filename: string }
→ { success: true, id: number, filesize: number }
```

### 6.10 区块链存证

```
GET /api/blockchain?start_date=&end_date=
→ { success: true, data: [{ id, proof_code, prod_date, region_code, variety_code, batch_no, salt_value, raw_material, md5_hash, verify_code, created_at }] }

POST /api/blockchain/verify
Body: { record_id: number }
→ { success: true, data: { id, proof_code, raw_material, stored_hash, computed_hash, match: bool } }

POST /api/blockchain/verify-code
Body: { verify_code: string }
→ { success: true, data: { id, proof_code, raw_material, stored_hash, computed_hash, match: bool, verify_code, created_at } }
```

> **说明**: blockchain 数据由溯源页面(`/trace`)自动生成存证，每查询一次生成一条新记录（含随机批次号、品种码、区域码、验证码），无需手动录入。

### 6.11 数据清理

```
DELETE /api/cleanup?start_time=&end_time=
→ { success: true, message, deletedCount: number }
```

---

## 7. 传感器与执行器

### 7.0 设备ID获取与账号-设备绑定关系

本系统传感器数据全部从新物联云平台（NLECloud）拉取，需先在平台注册账号（参见图 20），然后在平台中创建设备并复制设备 ID 填入登录页。

**图 8：在新物联云平台获取主设备ID 和 冷链设备ID**
![设备ID获取](image/8.png)

**设备 ID 使用规则（重要）：**

| 使用场景 | 对应设备 ID | 说明 |
|---|---|---|
| 冷链运输区的 **CO₂ 传感器**（`r_co2`） | **冷链设备ID**（coldChainDeviceID） | 冷链二氧化碳数据单独走冷链专属设备 |
| 其他所有 **传感器**（温湿度/光照/土壤/环境等）及 **执行器**（水泵/补光灯/通风扇等） | **主设备ID**（deviceID） | 幼苗区、种植区、蓄水区、烘干区、预警等全部由主设备承载 |

两个设备（主设备、冷链设备）下都可以在新物联云平台独立添加其他的传感器和执行器设备，然后在前端 `js/script1.js` 的 `sensors` / `actuators` 配置中追加对应标识符即可自动上线。

### 7.1 完整传感器列表

| 标识符 | 名称 | 单位 | 区域 | 默认值 |
|--------|------|------|------|--------|
| s_temp | 幼苗区_温度 | °C | 幼苗区 | 25 |
| s_hum | 幼苗区_湿度 | %RH | 幼苗区 | 75 |
| s_lx | 幼苗区_光照 | lx | 幼苗区 | 17000 |
| s_sox | 幼苗区_有害气体 | ppm | 幼苗区 | 400 |
| e_tamb | 种植区_环境温度 | °C | 种植区 | 24 |
| e_ah | 种植区_环境湿度 | %RH | 种植区 | 65 |
| e_tvoc | 种植区_环境空气质量 | mg/m³ | 种植区 | 0.3 |
| e_bt | 种植区_环境人体 | 人 | 种植区 | 0 |
| e_pm | 种植区_环境PM2.5 | μg/m³ | 种植区 | 35 |
| e_patm | 种植区_环境大气压 | hPa | 种植区 | 1013 |
| ws | 种植区_环境风速 | m/s | 种植区 | 1.2 |
| p_temp | 种植区_土壤温度 | °C | 种植区 | 26 |
| p_hum | 种植区_土壤湿度 | %RH | 种植区 | 70 |
| p_ph | 种植区_土壤PH值 | - | 种植区 | 6.5 |
| p_N | 种植区_土壤氮值 | mg/kg | 种植区 | 150 |
| p_P | 种植区_土壤磷值 | mg/kg | 种植区 | 50 |
| p_K | 种植区_土壤钾值 | mg/kg | 种植区 | 180 |
| w_ll | 蓄水区_液位 | m | 蓄水区 | 0.2 |
| r_temp | 冷链运输区_温度 | °C | 冷链区 | 8 |
| r_hum | 冷链运输区_湿度 | %RH | 冷链区 | 93 |
| r_co2 | 冷链运输区_CO2 | ppm | 冷链区 | 500 |

> **配置位置**: `js/script1.js` 中的 `sensors` 数组（21个）

### 7.2 执行器列表

| 标识符 | 名称 |
|--------|------|
| s_light | 幼苗区_补光灯 |
| s_fan | 幼苗区_通风扇 |
| w_wp | 蓄水区_水泵 |
| d_drlamp | 烘干区_烘干灯 |
| d_cv | 烘干区_传送带 |
| d_fan | 烘干区_通风扇 |
| alight | 预警灯 |

> **配置位置**: `js/script1.js` 中的 `actuators` 数组

### 7.3 传感器适宜范围（AI分析用）

| 传感器 | 适宜范围 |
|--------|---------|
| s_temp (幼苗温度) | 25-30°C |
| s_hum (幼苗湿度) | 70-80% |
| s_lx (光照) | 15000-30000 lx |
| s_sox (有害气体) | <400ppm |
| e_tamb (环境温度) | 20-30°C |
| e_ah (环境湿度) | 60-80% |
| p_temp (土壤温度) | 23-28°C |
| p_hum (土壤湿度) | 70-80% |
| p_ph (PH值) | 6.0-7.0 |
| p_N (氮) | 100-200 mg/kg |
| p_P (磷) | 40-80 mg/kg |
| p_K (钾) | 150-250 mg/kg |
| w_ll (液位) | 0.5-1.5m |
| r_temp (冷链温度) | 7-10°C |
| r_hum (冷链湿度) | 90-95% |
| r_co2 (CO2) | 500-2000ppm |

> **配置位置**: `js/ai-predict.js` 中的 `sensorConfig` 对象

### 7.4 数据阈值（冷链用）

| 传感器 | 正常范围 | 用途 |
|--------|---------|------|
| 温度 | 7-10°C | 冷链运输 |
| 湿度 | 90-100% | 冷链运输 |
| CO2 | 300-30000ppm | 冷链运输 |

> **配置位置**: `js/script.js` 中

---

## 8. AI智能分析配置

### 8.1 DeepSeek API配置

```javascript
// js/ai-predict.js
const apiEndpoint = 'https://api.deepseek.com/chat/completions';
const model = 'deepseek-chat';
const max_tokens = 1500;
const temperature = 0.7;
const stream = false;
```

### 8.2 轮询间隔

| 参数 | 文件 | 默认值 |
|------|------|--------|
| AI预测间隔 | `js/ai-predict.js` | `300000`ms (5分钟) |
| 数据轮询 | `js/script.js` | `10000`ms (10秒) |
| 自动刷新 | `js/script1.js` | `5000`ms (5秒) |
| AI预测(script1) | `js/script1.js` | `900000`ms (15分钟) |

### 8.3 分析提示词

- **System角色**: 农业种植专家
- **输出内容**: 环境评估 + 未来趋势分析 + 优化建议
- **生成字数**: 约300字

### 8.4 响应解析

```javascript
// 正则匹配
总体评价: /总体评价：([^\n]+)/
预警级别: /预警级别[：:]([^\n]+)/ 或 /风险[：:]([^\n]+)/
```

---

## 9. AI建议服务（独立服务）

### 9.1 服务概述

独立的 AI 建议服务（[Android_AI/AI.py](file:///e:/2026-8/html/Android_AI/AI.py)），运行在 **端口 4000**，通过 DeepSeek API 对传感器数据进行智能分析，返回种植建议。

### 9.2 配置

```python
# Android_AI/.env
DEEPSEEK_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
DEEPSEEK_MODEL=deepseek-chat
```

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `DEEPSEEK_API_KEY` | - | DeepSeek API 密钥（必填） |
| `DEEPSEEK_MODEL` | `deepseek-chat` | 模型名称 |
| 监听端口 | `4000` | Flask 服务端口 |

### 9.3 API 接口

```
POST /ai/suggest
Body: { sensor_data: { "s_temp": 25.5, "s_hum": 75.0, ... }, analysis_type: "all"|"region"|"single", target: "区域名"|"传感器ID" }
→ { success: true, suggestion: "建议文本", analysis_type, target }

GET /ai/regions
→ { success: true, regions: ["幼苗区", "种植区_环境", "种植区_土壤", "烘干区"] }

GET /ai/sensors
→ { success: true, sensors: [{ id, name, category, unit }] }

POST /ai/analyze
Body: { sensor_data, analysis_type: "region"|"single", target }
→ { success: true, suggestion }
```

### 9.4 传感器分区

| 区域 | 包含传感器 |
|------|-----------|
| 幼苗区 | s_temp, s_hum, s_lx, s_sox |
| 种植区_环境 | e_tamb, e_ah, e_tvoc, e_bt, e_pm, e_patm, ws |
| 种植区_土壤 | p_temp, p_hum, p_ph, p_N, p_P, p_K |
| 烘干区 | d_temp, d_hum |

### 9.5 依赖安装

```bash
pip install flask flask-cors requests python-dotenv
```

---

## 10. 病虫害识别服务（独立服务）

### 10.1 服务概述

独立的病虫害识别服务（[Android_AI/disease_recognition.py](file:///e:/2026-8/html/Android_AI/disease_recognition.py)），运行在 **端口 5000**，通过 DeepSeek API 识别辣椒病虫害图片，返回诊断结果和防治建议。

### 10.2 配置

```python
# Android_AI/.env
DEEPSEEK_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
DEEPSEEK_MODEL=deepseek-chat
```

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `DEEPSEEK_API_KEY` | - | DeepSeek API 密钥（必填） |
| `DEEPSEEK_MODEL` | `deepseek-chat` | 模型名称 |
| 监听端口 | `5000` | Flask 服务端口 |

### 10.3 API 接口

```
POST /api/disease/recognize
Body: { image: "base64编码的图片数据" }
→ { success: true, raw_result, parsed_result: { disease_name, confidence, symptoms, causes, suggestions }, source }

GET /api/disease/suggestions
→ { success: true, suggestions: { 病害名: { description, symptoms, causes, prevention, treatment } } }

GET /api/images/stages
→ { success: true, data: { seedling: [...], grow: [...], harvest: [...] }, stage_names: { ... } }

GET /api/images/{id}
→ 图片二进制 (Content-Type: image/jpeg)
```

### 10.4 支持识别的病虫害

- 白粉病、霜霉病、炭疽病、叶斑病、灰霉病、疫病、病毒病、蚜虫、红蜘蛛
- 健康（正常植株）

### 10.5 依赖安装

```bash
pip install flask flask-cors requests python-dotenv pymysql
```

### 10.6 启动

```bash
cd Android_AI
python disease_recognition.py
# 服务启动在 http://0.0.0.0:5000
```

---

## 11. 登录认证配置

### 11.0 账号注册与登录页面

使用系统前，需要先在新物联云平台（NLECloud）注册账号并创建设备。登录页示例如下：

**图 7：系统登录页面**
![登录页面](image/7.png)

用户需要在登录页输入 **账号 + 密码 + 主设备ID + 冷链设备ID（可选）**，通过云平台验证后进入系统。

**图 20：在新物联云平台注册账号**
![云平台注册账号](image/20.png)

访问新物联云平台（或使用其提供的移动端入口）完成账号注册，获取的账号和密码即可直接用于本系统登录。

### 11.1 登录流程

1. 用户输入 账号 + 密码 + 主设备ID + 冷链设备ID(可选)
2. 调用 `NLECloudAPI.userLogin(account, password)` 验证
3. 成功后保存到 `sessionStorage.platformConfig`
4. 跳转到 `index.html`

### 11.2 存储结构

```javascript
sessionStorage.platformConfig = JSON.stringify({
    account: '你的云平台账号',
    password: '你的云平台密码',
    deviceID: '主设备ID',
    coldChainDeviceID: '冷链设备ID(可选)'
});
```

### 11.3 日志记录

登录成功后自动记录到后端 `POST /api/login/log`

---

## 12. 图表配置

### 12.1 Chart.js 版本

| 使用位置 | 版本 | 来源 |
|---------|------|------|
| Smart.html | Chart.js 4.4.0 | CDN |
| sql.html | Chart.js 4.4.0 | CDN |
| lenglian.html | Chart.js (最新) | CDN |

### 12.2 图表颜色配置 (script1.js)

每个传感器在图表中有独立颜色配置：

```javascript
const datasetConfigs = {
    s_temp:  { color: '#ff2a6d', fill: 'rgba(255,42,109,0.1)' },
    s_hum:   { color: '#00f5ff', fill: 'rgba(0,245,255,0.1)' },
    s_lx:    { color: '#ffde21', fill: 'rgba(255,222,33,0.1)' },
    r_temp:  { color: '#ff7e5e', fill: 'rgba(255,126,94,0.1)' },
    r_hum:   { color: '#00f5ff', fill: 'rgba(0,245,255,0.1)' },
    r_co2:   { color: '#7e42ff', fill: 'rgba(126,66,255,0.1)' },
    // ...
};
```

### 12.3 通用图表参数

| 参数 | 默认值 |
|------|--------|
| 类型 | `line` |
| 线条宽度 | `3` |
| tension曲线张力 | `0.4` |
| 点半径 | `4` |
| 最大数据点数 | `20` (Smart) / `15` (lenglian) |
| maintainAspectRatio | `false` |
| X轴最大标签数 | `6` |

---

## 13. 可更改参数速查表

### 13.1 网络地址

所有前端地址已改为 Apache 反向代理相对路径(无端口号):

| 参数 | 文件 | 当前值 |
|------|------|--------|
| API_BASE | `js/script.js` | `/api` |
| API_BASE | `js/script1.js` | `/api` |
| API_BASE | `js/ai-predict.js` | `/api` |
| API_BASE | `login.html` | `/api` |
| RTSP_SERVER | `Smart.html` | `/rtsp` |
| API_BASE / FLASK_API_BASE | `sql.html` | `/api` / `/disease/api` |

后端服务间内部调用(容器内 localhost,不对外暴露):

| 参数 | 文件 | 当前值 |
|------|------|--------|
| 后端地址 | `rtsp_server.py` | `http://localhost:3000`(环境变量 `DB_SERVER`) |
| 数据库主机 | `server.js` | `localhost`(环境变量 `DB_HOST`) |
| 摄像头IP | `rtsp_server.py` | `你的摄像头局域网IP`(按实际局域网摄像头地址配置) |

### 13.2 端口号

| 服务 | 参数位置 | 默认值 |
|------|---------|--------|
| Express | `process.env.PORT` | `3000` |
| Python流 | `port=8081` | `8081` |
| AI建议 | `port=4000` | `4000` |
| 病虫害识别 | `port=5000` | `5000` |
| 溯源+存证 | `port=5500` | `5500` |
| MariaDB | `process.env.DB_PORT` | `3306` |

### 13.3 服务器配置

| 参数 | 文件 | 默认值 |
|------|------|--------|
| DB连接池上限 | `server.js` | `10` |
| body大小限制 | `server.js` | `10mb` |
| CORS origin | `server.js` | `*` |
| Python debug | `rtsp_server.py` | `False` |
| MJPEG质量 | `rtsp_server.py` | `75` |
| 截图质量 | `rtsp_server.py` | `95` |
| 流分辨率 | `rtsp_server.py` | `854x480` |
| PTZ速度 | `rtsp_server.py` | `±0.5` |
| 数字缩放范围 | `rtsp_server.py` | `1.0 ~ 3.0` |

### 13.4 数据轮询

| 参数 | 文件 | 默认值 |
|------|------|--------|
| 传感器轮询 | `js/script.js` | `10`秒 |
| 页面刷新 | `js/script1.js` | `5`秒 |
| AI预测 | `js/ai-predict.js` | `5`分钟 |
| AI (script1) | `js/script1.js` | `15`分钟 |

### 13.5 地图配置

| 参数 | 位置 | 值 |
|------|------|-----|
| 高德Key | 环境变量 `AMAP_KEY`(通过 `/api/config` 接口注入) | 部署时在 `.env` 中配置 |
| 中心坐标 | `script.js` | `[108.706, 34.341]` (咸阳) |
| 初始缩放 | `script.js` | `12` |
| 视图模式 | `script.js` | `3D` |
| 默认地址 | `script.js` | `陕西省咸阳市秦都区` |

> **注意**:高德Key 已从代码中移除,改为通过 Docker 环境变量 `AMAP_KEY` 注入。未配置时地图区域显示提示信息,其他功能正常。

### 13.6 云平台登录

| 参数 | 来源 | 说明 |
|------|------|------|
| 云平台账号 | 环境变量 `CLOUD_ACCOUNT` | 通过 `/api/config` 接口注入到 `script1.js` |
| 云平台密码 | 环境变量 `CLOUD_PASSWORD` | 通过 `/api/config` 接口注入到 `script1.js` |
| 轮询间隔 | 环境变量 `CLOUD_POLLING_INTERVAL` | 默认 10000ms |

> **注意**:云平台账号密码已从代码中移除,改为通过 Docker 环境变量注入。未配置时使用固定模拟数据。

### 13.7 AI分析

| 参数 | 文件 | 默认值 |
|------|------|--------|
| API地址 | `js/ai-predict.js` | `https://api.deepseek.com/chat/completions` |
| 模型 | `js/ai-predict.js` | `deepseek-chat` |
| max_tokens | `js/ai-predict.js` | `1500` |
| temperature | `js/ai-predict.js` | `0.7` |

### 13.8 车辆管理

| 参数 | 文件 | 值 |
|------|------|-----|
| 在线图标 | `script.js` | `https://img.icons8.com/fluency/96/00ff9d/truck.png` |
| 离线图标 | `script.js` | `https://img.icons8.com/fluency/96/ffaa00/truck.png` |
| 图标大小 | `script.js` | `40x40` |

### 13.9 冷链固定数据

| 参数 | 文件 | 默认值 |
|------|------|--------|
| 温度 | `js/script.js` | `8.5`°C |
| 湿度 | `js/script.js` | `92.0`% |
| CO2 | `js/script.js` | `12000`ppm |

---

## 14. Docker 部署

### 14.1 架构说明

```
                    ┌─────────────────────────────────────┐
                    │   Apache httpd (qjzl-httpd :80)     │
                    │   ├─ 静态页面 login.html / Smart.html │
                    │   ├─ /api/*        → :3000 (node)   │
                    │   ├─ /ai-service/* → :4000 (ai)     │
                    │   ├─ /disease/*    → :5000 (disease)│
                    │   ├─ /trace/*      → :5500 (trace)  │
                    │   └─ /rtsp/*       → :8081 (rtsp)   │
                    └─────────────┬───────────────────────┘
                                  │
        ┌─────────────┬───────────┼───────────┬─────────────┐
        ▼             ▼           ▼           ▼             ▼
   :3000 node    :4000 ai    :5000 disease  :5500 trace  :8081 rtsp
   (Express)     (Flask)     (Flask)        (Flask)      (RTSP→MJPEG)
        │             │           │           │
        └─────────────┴───────────┴───────────┘
                              │
                       :3306 mariadb
                       (库: qjzl)
```

所有请求通过 **Apache HTTPD (80端口)** 统一入口：
- 静态文件（HTML/JS/CSS）由 HTTPD 直接返回
- `/api/*` 反向代理到 Node.js 服务(:3000)
- `/ai-service/*` 反向代理到 AI 建议服务(:4000)
- `/disease/*` 反向代理到 病虫害识别服务(:5000)
- `/trace/*` 反向代理到 溯源+区块链服务(:5500)
- `/rtsp/*` 反向代理到 摄像头流服务(:8081),含 `/rtsp/mjpeg`、`/rtsp/snapshot`、`/rtsp/ptz`

**安全加固:**
- 禁止访问 `.env`、`.git` 等隐藏文件
- 禁止访问 `deploy/`、`Android_AI/`、`services/`、`trac/`、`qjzl/server/`、`qjzl/sql/` 等目录
- 禁止下载 `.py`、`.sh`、`.bat`、`.sql`、`.yml`、`.conf` 等脚本和配置文件
- 关闭目录浏览

### 14.2 文件清单

所有 Docker 部署文件统一存放在 `deploy/` 目录中：

| 文件 | 用途 |
|------|------|
| `deploy/docker-compose.yml` | 容器编排（MariaDB + Node + AI + 病害 + RTSP + Trace + HTTPD） |
| `deploy/Dockerfile.node` | Node.js API 服务镜像构建 |
| `deploy/Dockerfile.python` | Python RTSP 流服务镜像构建 |
| `deploy/Dockerfile.trace` | Python Flask 溯源+区块链存证服务镜像构建（Rocky Linux） |
| `deploy/Dockerfile.ai` | AI 建议服务镜像构建（Rocky Linux） |
| `deploy/Dockerfile.disease` | 病虫害识别服务镜像构建（Rocky Linux） |
| `deploy/Dockerfile.httpd` | Apache HTTPD 镜像构建（Alpine） |
| `deploy/httpd.conf` | Apache HTTPD 主配置(含反向代理 + 安全加固) |
| `deploy/httpd-custom.conf` | HTTPD 自定义配置 |
| `deploy/httpd-vhosts.conf` | HTTPD 虚拟主机配置 |
| `deploy/default.conf` | 默认站点配置 |
| `deploy/.env.example` | 环境变量模板（复制为 `.env` 后使用） |
| `deploy/.env` | 环境变量配置 |
| `deploy/docker-start.sh` | 一键部署脚本(含 Docker 安装 + 服务启动,支持 Rocky/CentOS/Ubuntu) |
| `deploy/startup.bat` | Windows 部署脚本（含防火墙配置+开机自启） |
| `enable-autostart.sh` | systemd 开机自启配置脚本(位于 html/ 目录) |

### 14.3 环境要求

- **Docker** 20.10+
- **Docker Compose** 2.0+（或 Docker Desktop 自带）
- **服务器配置建议**: 4核8G以上（含AI+病害+摄像头流处理）

### 14.4 快速部署

所有 Docker 操作均在 `deploy/` 目录中执行。

#### 方式一：一键部署（推荐）

```bash
# 一键安装 Docker + 启动所有服务(支持 Rocky/CentOS/Ubuntu)
sudo bash deploy/docker-start.sh

# 编辑配置文件,填入密钥
vi deploy/.env
#   AMAP_KEY=你的高德JSAPI Key
#   CLOUD_ACCOUNT=新物联云平台账号
#   CLOUD_PASSWORD=新物联云平台密码
#   DEEPSEEK_API_KEY=你的DeepSeek API Key

# 重启 node 容器让环境变量生效
cd deploy && docker compose restart node

# (可选) 配置开机自启
sudo bash enable-autostart.sh
```

#### 方式二：手动部署

```bash
# 1. 进入部署目录
cd deploy

# 2. 配置环境变量
cp .env.example .env
# 编辑 .env 填入 AMAP_KEY / CLOUD_ACCOUNT / CLOUD_PASSWORD / DEEPSEEK_API_KEY

# 3. 构建并启动
docker compose up -d --build

# 4. 查看启动日志
docker compose logs -f

# 5. 停止服务
docker compose down
```

#### 数据库重置

```bash
# 清空所有表数据,ID 从 1 重新开始
sudo bash deploy/docker-start.sh --reset
```

#### 部署过程图解（1-6）

下面按步骤展示服务器上完整的部署流程：

**步骤 1：上传项目代码到服务器，进入 deploy 目录，检查 docker-compose.yml**
![部署步骤1：上传项目并检查docker-compose](image/1.png)

**步骤 2：部署完成**
![部署步骤2：部署完成](image/2.png)

**步骤 3：放行对应端口**
![部署步骤3：放行端口](image/3.png)

**步骤 4：查看放行的端口**
![部署步骤4：查看放行端口](image/4.png)

**步骤 5：编辑 .env 文件**
![部署步骤5：编辑.env](image/5.png)

**步骤 6：配置 .env 环境变量**
![部署步骤6：配置.env](image/6.png)

### 14.5 环境变量说明

编辑 `deploy/.env` 文件可配置以下参数：

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `MYSQL_ROOT_PASSWORD` | `root` | MariaDB root 密码 |
| `MYSQL_DATABASE` | `qjzl` | 数据库名 |
| `MYSQL_USER` | `qjzl` | 普通用户 |
| `MYSQL_PASSWORD` | `qjzl123456` | 普通用户密码 |
| `DEEPSEEK_API_KEY` | - | DeepSeek API 密钥（AI建议+病害识别） |
| `AMAP_KEY` | - | 高德地图 Web JS API Key(冷链监控页地图) |
| `CLOUD_ACCOUNT` | - | 新物联云平台账号(冷链传感器数据) |
| `CLOUD_PASSWORD` | - | 新物联云平台密码 |
| `CLOUD_POLLING_INTERVAL` | `10000` | 云平台数据轮询间隔(毫秒) |
| `CAMERA_IP` | - | RTSP摄像头IP地址 |
| `CAMERA_PORT` | `80` | 摄像头HTTP端口 |
| `CAMERA_USER` | - | 摄像头登录用户名 |
| `CAMERA_PASSWORD` | - | 摄像头登录密码 |

### 14.6 访问地址

启动完成后通过以下地址访问：

| 页面 | 地址 |
|------|------|
| 首页 | `http://服务器IP/` |
| 监控主页 | `http://服务器IP/qjzl/Smart.html` |
| 冷链追踪 | `http://服务器IP/qjzl/lenglian.html` |
| 数据中心 | `http://服务器IP/qjzl/sql.html` |
| 登录页 | `http://服务器IP/login.html` |

### 14.7 常用 Docker 命令

```bash
# 先进入部署目录
cd deploy

# 查看所有容器状态
docker compose ps

# 查看实时日志
docker compose logs -f

# 查看各服务日志
docker compose logs -f node
docker compose logs -f rtsp
docker compose logs -f ai
docker compose logs -f disease
docker compose logs -f trace
docker compose logs -f httpd

# 重启某个服务
docker compose restart node

# 重新构建并启动（修改代码后）
docker compose up -d --build

# 停止并删除容器（保留数据卷）
docker compose down

# 完全清理（删除数据卷）
docker compose down -v
```

### 14.7.1 开机自启管理

```bash
# 配置 systemd 开机自启
sudo bash enable-autostart.sh

# 管理命令
sudo systemctl status qjzl         # 查看状态
sudo systemctl start qjzl          # 启动
sudo systemctl stop qjzl           # 停止
sudo systemctl restart qjzl        # 重启
sudo journalctl -u qjzl -f         # 查看日志

# 取消开机自启
sudo bash enable-autostart.sh disable
```

### 14.8 数据持久化

MariaDB 数据库存储在 Docker 数据卷 `mariadb_data` 中，`docker compose down` 不会删除数据。如需彻底清除数据：

```bash
cd deploy && docker compose down -v
```

### 14.9 摄像头配置

部署后如需修改摄像头配置，可编辑 `qjzl/rtsp_server.py` 中的参数，然后重建 RTSP 镜像：

```bash
cd deploy && docker compose up -d --build rtsp
```

### 14.10 注意事项

1. **首次启动**：MariaDB 首次初始化需要 30-60 秒，Node.js 服务会自动等待数据库就绪
2. **时区设置**：所有容器已设置为 `Asia/Shanghai`
3. **网络模式**：使用 `network_mode: host`，容器直接使用宿主机网络,Apache 反向代理统一 80 端口入口
4. **镜像体积**：Python 镜像因 OpenCV 依赖较大（约 1.5GB），首次构建较慢
5. **Windows 部署**：建议以管理员身份运行 `startup.bat`，自动配置防火墙和开机自启
6. **前端地址**：所有前端页面使用相对路径(`/api`、`/rtsp`、`/disease` 等),通过 Apache 反向代理访问,浏览器无需端口号
7. **安全加固**：Apache 已禁止访问 `.env`、`deploy/`、`Android_AI/` 等敏感目录和文件
8. **配置驱动**：高德Key、云平台账号密码、DeepSeek Key 全部通过环境变量注入,不硬编码在代码中

### 14.11 功能页面展示（9-15）

以下截图展示了系统部署完成后各业务页面的实际效果：

**图 9：index.html 首页（登录后首页）**
![首页index](image/9.png)

系统登录后进入的首页，展示各功能模块的导航入口与概览信息。

**图 10：产业数据监控（Smart.html）总览**
![产业数据监控Smart](image/10.png)

包括幼苗区、种植区、蓄水区、烘干区等分区的实时传感器面板、设备状态卡片、以及右侧的监控视频流。

**图 11：数据中心（sql.html）历史数据查询与导出**
![数据中心](image/11.png)

按时间段、设备 ID、传感器类型等多条件查询历史数据，支持查看详情与导出。

**图 12：冷链运输监控（lenglian.html）车辆定位与地图追踪**
![冷链运输监控](image/12.png)

冷链车辆在高德地图上的定位、行驶路径、实时传感器数据与地理围栏显示。

**图 13：病虫害识别页面操作与识别结果**
![病虫害识别](image/13.png)

选择图片后调用病害识别服务，识别病害类型、置信度并给出防治建议。

**图 14：区块链溯源页面（产品信息与区块链存证）①**
![区块链溯源-1](image/14.png)

扫码或输入溯源码后查看完整的种植、采摘、加工、运输等全链路信息，以及区块链 MD5 哈希存证。

**图 15：区块链溯源页面（存证验证与全流程）②**
![区块链溯源-2](image/15.png)

完整生产流程时间线展示，支持区块哈希校验，确保每一步记录不可篡改。

---

## 附录

### A. 常用命令（本地开发）

```bash
# 启动全部服务
cd qjzl/server && npm start

# 开发模式（热重载）
npm run dev

# 仅启动数据库API
npm run start:db

# 仅启动摄像头流
npm run start:rtsp

# 安装全部依赖
npm run install-all

# 停止全部服务
bash qjzl/stop_services.sh
```

### B. AI 服务启动

```bash
# 启动 AI 建议服务（端口 4000）
cd Android_AI && python AI.py

# 启动 病虫害识别服务（端口 5000）
cd Android_AI && python disease_recognition.py

# 启动 溯源+区块链存证服务（端口 5500）
cd trac && python trac.py
```

### C. 浏览器兼容性

- Chrome 80+
- Firefox 75+
- Safari 13+
- Edge 80+

### D. 外部依赖

- [Chart.js 4.4.0](https://www.chartjs.org/) - 图表库
- [高德地图JS API v2.0](https://lbs.amap.com/) - 地图服务
- [NLECloud SDK](https://www.nlecloud.com/) - 物联网云平台
- [DeepSeek API](https://platform.deepseek.com/) - AI 智能分析
- [SheetJS](https://sheetjs.com/) - XLS 导出
- [JSZip](https://stuk.github.io/jszip/) - ZIP 打包
- [FileSaver.js](https://github.com/eligrey/FileSaver.js/) - 文件下载

---

> © 2026 辣椒智慧农业管理平台 · 用技术守护每一颗辣椒
