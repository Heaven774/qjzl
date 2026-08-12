@echo off
chcp 65001 >nul
echo ============================================
echo  辣椒智慧农业管理平台 - 一键部署脚本
echo ============================================
echo.

set "DEPLOY_DIR=%~dp0"
set "PROJECT_DIR=%DEPLOY_DIR%.."
set "COMPOSE_FILE=%DEPLOY_DIR%docker-compose.yml"

set "DOCKER_FOUND=false"
set "COMPOSE_FOUND=false"
set "DOCKER_RUNNING=false"

echo [1/4] 系统环境检查...
echo --------------------------------------------

echo   检查 Docker 是否安装...
docker --version >nul 2>&1
if %errorlevel% equ 0 (
    for /f "tokens=3" %%i in ('docker --version') do (
        echo   ✓ Docker 已安装: %%i
        set "DOCKER_FOUND=true"
    )
) else (
    echo   ✗ Docker 未安装
    echo     请先安装 Docker Desktop: https://www.docker.com/products/docker-desktop/
)

echo.
echo   检查 Docker Compose 是否可用...
docker compose version >nul 2>&1
if %errorlevel% equ 0 (
    for /f "tokens=4" %%i in ('docker compose version') do (
        echo   ✓ Docker Compose 已安装: %%i
        set "COMPOSE_FOUND=true"
    )
) else (
    echo   ✗ Docker Compose 不可用
    echo     请确保 Docker Desktop 包含 Compose 功能
)

echo.
echo   检查 Docker 服务是否运行...
docker info >nul 2>&1
if %errorlevel% equ 0 (
    echo   ✓ Docker 服务正在运行
    set "DOCKER_RUNNING=true"
) else (
    echo   ✗ Docker 服务未运行
    echo     请启动 Docker Desktop 或运行: net start docker
)

echo.
echo   检查 docker-compose.yml 文件...
if exist "%COMPOSE_FILE%" (
    echo   ✓ docker-compose.yml 文件存在
) else (
    echo   ✗ docker-compose.yml 文件不存在
    echo     请确保在 deploy 目录下运行本脚本
    pause
    exit /b 1
)

echo.
echo   检查项目文件...
if exist "%PROJECT_DIR%\qjzl\server\server.js" (
    echo   ✓ Node.js 服务端代码存在
) else (
    echo   ✗ Node.js 服务端代码不存在
)

if exist "%PROJECT_DIR%\qjzl\sql\database.sql" (
    echo   ✓ 数据库初始化脚本存在
) else (
    echo   ✗ 数据库初始化脚本不存在
)



echo.
echo   检查 .env 文件...
if exist "%DEPLOY_DIR%.env" (
    echo   ✓ .env 文件存在
) else (
    echo   ⚠️  .env 文件不存在，将使用默认配置
)

echo.
echo   环境检查汇总:
echo   --------------------------
echo   Docker 安装:     %DOCKER_FOUND%
echo   Compose 安装:    %COMPOSE_FOUND%
echo   Docker 运行:     %DOCKER_RUNNING%
echo   --------------------------

if not "%DOCKER_FOUND%"=="true" (
    echo.
    echo   ❌ Docker 未安装，无法继续部署
    pause
    exit /b 1
)

if not "%COMPOSE_FOUND%"=="true" (
    echo.
    echo   ❌ Docker Compose 不可用，无法继续部署
    pause
    exit /b 1
)

if not "%DOCKER_RUNNING%"=="true" (
    echo.
    echo   ❌ Docker 服务未运行，请先启动 Docker
    pause
    exit /b 1
)

echo.
echo [2/4] 正在配置 Windows 防火墙规则...
echo --------------------------------------------

netsh advfirewall firewall add rule name="qjzl-httpd" dir=in action=allow protocol=TCP localport=80 >nul 2>&1
echo   ✓ HTTP 80 端口已放行

netsh advfirewall firewall add rule name="qjzl-mariadb" dir=in action=allow protocol=TCP localport=3306 >nul 2>&1
echo   ✓ MariaDB 3306 端口已放行

netsh advfirewall firewall add rule name="qjzl-node" dir=in action=allow protocol=TCP localport=3000 >nul 2>&1
echo   ✓ Node.js API 3000 端口已放行

netsh advfirewall firewall add rule name="qjzl-disease" dir=in action=allow protocol=TCP localport=5000 >nul 2>&1
echo   ✓ 病虫害识别 5000 端口已放行

netsh advfirewall firewall add rule name="qjzl-ai" dir=in action=allow protocol=TCP localport=4000 >nul 2>&1
echo   ✓ AI建议 4000 端口已放行

netsh advfirewall firewall add rule name="qjzl-trace" dir=in action=allow protocol=TCP localport=5500 >nul 2>&1
echo   ✓ 溯源服务 5500 端口已放行

netsh advfirewall firewall add rule name="qjzl-rtsp" dir=in action=allow protocol=TCP localport=8081 >nul 2>&1
echo   ✓ 摄像头流 8081 端口已放行

echo.
echo [3/4] 正在启动 Docker 容器...
echo --------------------------------------------

cd /d "%DEPLOY_DIR%"
docker compose -f "%COMPOSE_FILE%" up -d --build

if %errorlevel% equ 0 (
    echo   ✓ 所有容器启动成功
) else (
    echo   ✗ 容器启动失败，请检查 Docker 是否已启动
    pause
    exit /b 1
)

echo.
echo [4/4] 正在设置开机自启...
echo --------------------------------------------

echo   创建计划任务 qjzl...
schtasks /create /tn "qjzl" /tr "\"%~f0\"" /sc onstart /rl highest /f >nul 2>&1
if %errorlevel% equ 0 (
    echo   ✓ 开机自启已设置
) else (
    echo   ⚠️  开机自启设置失败，请以管理员身份运行本脚本
)

echo.
echo ============================================
echo  部署完成！
echo ============================================
echo.
echo 访问地址：
echo   Web 前端: http://localhost/
echo   API 接口: http://localhost/api/
echo   AI 建议: http://localhost/ai/
echo.
echo 容器列表：
docker compose ps
echo.
pause