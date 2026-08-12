# 辣椒智慧农业系统 - Android端

基于 Android 的辣椒智慧农业管理移动应用，提供设备监控、AI分析、病虫害识别、综合控制和产品溯源等功能。

## 项目结构

```
smartfarm/
├── app/
│   ├── src/main/
│   │   ├── java/com/example/smartfarm/
│   │   │   ├── LoginActivity.java              # 登录页面
│   │   │   ├── LaunchScreenActivity.java       # 启动页面
│   │   │   ├── MainActivity.java               # 主活动（底部导航）
│   │   │   └── device/
│   │   │       ├── DeviceMonitorFragment.java  # 设备监控模块
│   │   │       ├── AIAnalysisFragment.java     # AI分析模块
│   │   │       ├── DiseaseRecognitionFragment.java  # 病虫害识别模块
│   │   │       ├── IntegratedControlFragment.java   # 综合控制模块
│   │   │       └── TraceabilityFragment.java   # 产品溯源模块
│   │   ├── res/
│   │   │   ├── layout/
│   │   │   │   ├── activity_login.xml          # 登录页面布局
│   │   │   │   ├── activity_launch_screen.xml  # 启动页面布局
│   │   │   │   ├── activity_main.xml           # 主页面布局
│   │   │   │   ├── fragment_device_monitor.xml # 设备监控布局
│   │   │   │   ├── fragment_ai_analysis.xml    # AI分析布局
│   │   │   │   ├── fragment_disease_recognition.xml  # 病虫害识别布局
│   │   │   │   ├── fragment_integrated_control.xml   # 综合控制布局
│   │   │   │   ├── fragment_traceability.xml   # 溯源布局
│   │   │   │   └── dialog_settings_menu.xml    # 设置对话框布局
│   │   │   ├── drawable/                       # 图片资源
│   │   │   ├── values/                         # 字符串、颜色、样式
│   │   │   ├── anim/                           # 动画资源
│   │   │   ├── raw/                            # 原始资源（音频等）
│   │   │   └── mipmap-*/                       # 应用图标
│   │   └── AndroidManifest.xml                 # 应用配置
│   ├── libs/                                   # 第三方库
│   │   └── nlecloudII/                         # 物联网SDK
│   ├── build.gradle.kts                        # 模块构建配置
│   └── proguard-rules.pro                      # 混淆规则
├── gradle/                                     # Gradle配置
├── build.gradle                                # 项目构建配置
├── gradle.properties                           # Gradle属性
└── settings.gradle                             # 项目设置
```

## 技术栈

### 开发环境
- Android Studio Hedgehog (2023.1)+ 
- JDK 17 (JavaVersion.VERSION_17)
- Gradle 8.13+
- Android SDK 34 (compileSdk) / 24 (minSdk)

### 核心库
| 库 | 用途 |
|----|------|
| OkHttp 4.x | 网络请求 |
| Retrofit 2.x | REST API调用 |
| RxJava | 异步编程 |
| Gson | JSON解析 |
| nlecloudII | 物联网设备通信 |

### 功能模块
| 模块 | 功能 | Fragment | 后端依赖 |
|------|------|----------|----------|
| 设备监控 | 温湿度、光照等设备数据展示 | DeviceMonitorFragment | Node.js API (`html/qjzl/server/`) |
| AI分析 | 智能数据分析与预测 | AIAnalysisFragment | **`html/Android_AI/AI.py`** (Flask, 端口 4000) |
| 病虫害识别 | 拍照/选图进行病虫害诊断 | DiseaseRecognitionFragment | **`html/Android_AI/disease_recognition.py`** (Flask, 端口 5000) |
| 综合控制 | 设备远程控制 | IntegratedControlFragment | Node.js API (`html/qjzl/server/`) |
| 产品溯源 | 产品信息查询与区块链溯源 | TraceabilityFragment | **`html/trac/trac.py`** (Flask, 端口 5500) |

## 功能特性

### 🔐 用户登录
- 支持账号密码登录
- 启动页动画展示

### 📊 设备监控
- 实时温湿度监测
- 光照强度显示
- 设备状态监控

### 🤖 AI分析
- 智能数据分析
- 生长趋势预测
- 异常预警提醒
- **后端依赖**：`html/Android_AI/AI.py`（Flask 服务，端口 4000）
  - 接收 App 传来的传感器数据，调用 DeepSeek API 生成种植建议与趋势分析
  - 通过 Apache 反向代理 `/ai-service/*` → `ai:4000/*` 访问

### 🌶️ 病虫害识别
- 拍照识别功能
- 从相册选择图片
- 从数据库选择历史图片
- 按育苗期/生长期/收获期分类
- 接入DeepSeek AI模型诊断
- 专业防治建议
- **后端依赖**：`html/Android_AI/disease_recognition.py`（Flask 服务，端口 5000）
  - 接收 App 上传的图片，调用 DeepSeek Vision API 识别病害类型并返回防治建议
  - 图片管理接口支持按生长期分类查询历史图片
  - 通过 Apache 反向代理 `/disease/*` → `disease:5000/*` 访问

### 🎛️ 综合控制
- 远程设备控制
- 智能灌溉控制
- 环境调节功能

### 🔍 产品溯源
- 溯源码扫描
- 产品信息查询
- 生产记录展示
- 区块链 MD5 哈希存证验证
- **后端依赖**：`html/trac/trac.py`（Flask 服务，端口 5500）
  - 从 MariaDB 数据库实时获取传感器数据、图片和生产记录
  - 动态生成溯源二维码，每个溯源码对应独立溯源界面
  - 对生产全链路数据计算 MD5 哈希，实现区块链存证
  - 通过 Apache 反向代理 `/trace/*` → `trace:5500/*` 访问

## 快速开始

### 环境要求
- Android Studio Hedgehog (2023.1)+
- JDK 17
- Android SDK 34 (compileSdk) / 24 (minSdk)

### 运行步骤

1. **打开项目**
   ```bash
   # 使用 Android Studio 打开 smartfarm/ 目录
   ```

2. **配置服务器地址**

   所有 API 调用通过 Apache 反向代理(80 端口,无端口号),只需修改 3 个 Fragment 中的 `YOUR_SERVER_IP`:

   | 文件 | 路径常量 | 替换为 |
   |------|---------|--------|
   | `DiseaseRecognitionFragment.java` | `http://YOUR_SERVER_IP/disease/api/disease/recognize` | `http://你的服务器IP/disease/...` |
   | `AIAnalysisFragment.java` | `http://YOUR_SERVER_IP/ai-service/ai/suggest` | `http://你的服务器IP/ai-service/...` |
   | `TraceabilityFragment.java` | `http://YOUR_SERVER_IP/trace/get_qr` | `http://你的服务器IP/trace/get_qr` |

   全局搜索 `YOUR_SERVER_IP` 替换为你的服务器 IP 即可。

3. **运行应用**
   - 连接真机或启动模拟器
   - 点击 "Run" 按钮

## 主要组件说明

### Activity 组件

| Activity | 描述 | 布局文件 |
|----------|------|----------|
| LoginActivity | 登录页面 | activity_login.xml |
| LaunchScreenActivity | 启动闪屏 | activity_launch_screen.xml |
| MainActivity | 主页面，包含底部导航 | activity_main.xml |

### Fragment 组件

#### DeviceMonitorFragment
设备监控界面，展示传感器数据：
- 温度/湿度显示
- 光照强度
- 设备状态指示灯

#### AIAnalysisFragment
AI分析界面：
- 数据分析图表
- 趋势预测
- 预警信息

#### DiseaseRecognitionFragment
病虫害识别界面：
- 拍照按钮
- 图片选择（数据库/相册）
- 识别结果展示
- 时期筛选按钮

#### IntegratedControlFragment
综合控制界面：
- 设备列表
- 控制按钮
- 状态反馈

#### TraceabilityFragment
溯源界面：
- 溯源码输入
- 产品信息展示
- 生产记录

## API接口

所有接口通过 Apache 反向代理(80 端口)访问,无需端口号:

### 病虫害识别（后端：`html/Android_AI/disease_recognition.py`，端口 5000）
```
POST http://{host}/disease/api/disease/recognize
Content-Type: multipart/form-data
参数: image - 图片文件
```

### 图片管理（后端：`html/Android_AI/disease_recognition.py`，端口 5000）
```
GET http://{host}/disease/api/images/stages
返回: 各时期图片列表
```

### AI 建议（后端：`html/Android_AI/AI.py`，端口 4000）
```
POST http://{host}/ai-service/ai/suggest
Content-Type: application/json
Body: { sensor_data, analysis_type, target }
```

### 设备监控(Node.js)（后端：`html/qjzl/server/`，端口 3000）
```
GET http://{host}/api/device/status
返回: 设备状态数据
```

### 产品溯源+区块链存证（后端：`html/trac/trac.py`，端口 5500）
```
GET http://{host}/trace/get_qr
GET http://{host}/trace/api/trace/{code}
返回: 产品溯源信息（含区块链 MD5 哈希存证）
```

## 权限说明

| 权限 | 用途 |
|------|------|
| CAMERA | 拍照功能 |
| READ_EXTERNAL_STORAGE | 读取相册图片 |
| INTERNET | 网络请求 |
| ACCESS_NETWORK_STATE | 网络状态检测 |

## 资源文件说明

### 布局文件
| 文件 | 说明 |
|------|------|
| activity_main.xml | 主页面，包含 BottomNavigationView |
| fragment_*.xml | 各功能模块布局 |
| dialog_settings_menu.xml | 设置菜单对话框 |

### Drawable资源
| 文件 | 说明 |
|------|------|
| btn_*.xml | 各种按钮样式 |
| bg_*.xml | 背景样式 |
| ic_*.xml | 图标资源 |

### 动画资源
| 文件 | 说明 |
|------|------|
| slide_in_right.xml | 右侧滑入动画 |
| slide_out_right.xml | 右侧滑出动画 |

## 注意事项

1. **网络配置**
   - 真机：确保与后端服务在同一局域网
   - 模拟器：使用 `10.0.2.2` 访问主机服务

2. **后端服务**
   - 确保所有后端服务已启动(Docker 部署见 `html/deploy/docker-start.sh`)
   - 所有 API 通过 Apache 反向代理(80 端口)访问,Android 端无需指定端口
   - 后端源码与代理路径映射:

     | 后端源码 | 服务 | 端口 | 代理路径 | 说明 |
     |----------|------|------|----------|------|
     | `html/qjzl/server/` | Node.js API | 3000 | `/api/*` | 设备监控、登录认证、数据接口 |
     | `html/Android_AI/AI.py` | Flask | 4000 | `/ai-service/*` | AI 智能分析与种植建议 |
     | `html/Android_AI/disease_recognition.py` | Flask | 5000 | `/disease/*` | 病虫害图像识别 |
     | `html/trac/trac.py` | Flask | 5500 | `/trace/*` | 产品溯源+区块链存证 |
     | RTSP 服务 | - | 8081 | `/rtsp/*` | 摄像头流服务 |

3. **权限请求**
   - 首次运行会请求相机和存储权限
   - 用户需授予权限才能使用相关功能

## 常见问题

### Q: 按钮点击无反应？
A: 确保后端服务已启动，检查网络连接，确认API地址配置正确。

### Q: 图片无法加载？
A: 检查网络权限，确认图片API地址正确。

### Q: 模拟器无法连接？
A: 使用 `10.0.2.2` 代替局域网IP地址。

### Q: 设备无法控制？
A: 检查物联网设备是否在线，确认设备ID配置正确。

### Q: Docker部署后如何访问？
A: 浏览器访问 `http://服务器IP/` 即可，Apache HTTPD反代了所有后端服务。

## License

MIT License