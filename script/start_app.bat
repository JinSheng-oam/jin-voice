@echo off
chcp 65001 >nul
setlocal EnableExtensions EnableDelayedExpansion

cd /d "%~dp0"

set "ENV_FILE=.env"
set "MODE_FILE=.deploy_mode"
set "DOCKER_HASH_FILE=.docker_build_hash"

echo ========================================
echo JinVoice Docker 启动器
echo ========================================

docker --version >nul 2>&1
if errorlevel 1 (
    echo [错误] 未安装 Docker。
    echo        如果你要非 Docker 部署，请改用: start_app_nodocker.bat
    pause
    exit /b 1
)

set "EXISTING_IP="
if exist "%ENV_FILE%" (
    for /f "tokens=1* delims==" %%a in ('type "%ENV_FILE%"') do (
        if /i "%%a"=="MEDIASOUP_ANNOUNCED_IP" set "EXISTING_IP=%%b"
    )
)

set "DETECTED_IP="
for /f "usebackq delims=" %%i in (`curl -fsSL ip.sb 2^>nul`) do if not defined DETECTED_IP set "DETECTED_IP=%%i"
if defined DETECTED_IP (
    set "DETECTED_IP=!DETECTED_IP: =!"
    echo [信息] 已通过 curl ip.sb 自动获取公网 IP: !DETECTED_IP!
    set "EXISTING_IP=!DETECTED_IP!"
) else if defined EXISTING_IP (
    echo [警告] 自动获取公网 IP 失败，回退使用 .env 中现有值: !EXISTING_IP!
) else (
    echo [警告] 自动获取公网 IP 失败。
    set /p "PUBLIC_IP=请输入服务器公网 IP: "
    if not defined PUBLIC_IP (
        echo [错误] 必须提供公网 IP。
        pause
        exit /b 1
    )
    set "EXISTING_IP=%PUBLIC_IP%"
)

for /f "usebackq delims=" %%i in (`powershell -NoProfile -Command "$ip = Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notlike '169.254*' -and $_.IPAddress -ne '127.0.0.1' } | Select-Object -First 1 -ExpandProperty IPAddress; if ($ip) { $ip } else { '0.0.0.0' }"`) do set "LOCAL_IP=%%i"
if not defined LOCAL_IP set "LOCAL_IP=0.0.0.0"

powershell -NoProfile -Command ^
  "$envFile='%CD%\\%ENV_FILE%';" ^
  "$pairs=@{ 'MEDIASOUP_ANNOUNCED_IP'='%EXISTING_IP%'; 'MEDIASOUP_LISTEN_IP'='%LOCAL_IP%'; 'DATABASE_URL'='file:../data/dev.db'; 'PORT'='5000' };" ^
  "if (Test-Path $envFile) { $lines = Get-Content $envFile } else { $lines = @() };" ^
  "foreach ($key in $pairs.Keys) {" ^
  "  $value = $pairs[$key];" ^
  "  $match = '^' + [regex]::Escape($key) + '=';" ^
  "  if ($lines -match $match) { $lines = $lines | ForEach-Object { if ($_ -match $match) { $key + '=' + $value } else { $_ } } }" ^
  "  else { $lines += ($key + '=' + $value) }" ^
  "}" ^
  "Set-Content -Path $envFile -Value $lines -Encoding utf8"

if errorlevel 1 (
    echo [错误] 更新 .env 失败。
    pause
    exit /b 1
)

if not exist "%CD%\data" mkdir "%CD%\data"
if not exist "%CD%\data\dev.db" if exist "%CD%\prisma\dev.db" (
    copy /Y "%CD%\prisma\dev.db" "%CD%\data\dev.db" >nul
    echo [信息] 已迁移旧数据库 prisma\dev.db 到 data\dev.db
)

> "%MODE_FILE%" echo docker

echo [信息] MEDIASOUP_ANNOUNCED_IP=%EXISTING_IP%
echo [信息] MEDIASOUP_LISTEN_IP=%LOCAL_IP%
echo [信息] 停止旧容器...
docker compose down --remove-orphans >nul 2>&1

set "BUILD_ARG="
set "SHOULD_BUILD="

echo %* | findstr /c:"--build" >nul 2>&1
if not errorlevel 1 set "SHOULD_BUILD=1"

if not defined SHOULD_BUILD (
    for /f "usebackq delims=" %%i in (`docker compose images -q jinvoice-sfu 2^>nul`) do if not defined IMAGE_ID set "IMAGE_ID=%%i"
    if not defined IMAGE_ID set "SHOULD_BUILD=1"
)

for /f "usebackq delims=" %%i in (`powershell -NoProfile -Command "(Get-FileHash -Algorithm SHA256 '%CD%\\Dockerfile').Hash.ToLowerInvariant()"`) do set "CURRENT_DOCKER_HASH=%%i"

if not defined SHOULD_BUILD (
    echo %* | findstr /c:"--no-build" >nul 2>&1
    if errorlevel 1 (
        set "SAVED_DOCKER_HASH="
        if exist "%DOCKER_HASH_FILE%" set /p "SAVED_DOCKER_HASH="<"%DOCKER_HASH_FILE%"
        if /i not "!SAVED_DOCKER_HASH!"=="!CURRENT_DOCKER_HASH!" set "SHOULD_BUILD=1"
    )
)

if defined SHOULD_BUILD (
    set "BUILD_ARG=--build"
    echo [信息] 检测到首次启动或镜像环境变化，执行 Docker 构建...
) else (
    echo [信息] 复用现有 Docker 镜像，跳过重建...
)

echo [信息] 启动 Docker 服务...
docker compose up -d %BUILD_ARG% --remove-orphans
if errorlevel 1 (
    echo [错误] 启动 Docker 服务失败。
    pause
    exit /b 1
)

powershell -NoProfile -Command ^
  "$ok=$false;" ^
  "for ($i=0; $i -lt 20; $i++) {" ^
  "  try { $body = Invoke-RestMethod -Uri 'http://127.0.0.1:5000/api/health' -TimeoutSec 3; $body | ConvertTo-Json -Compress; $ok=$true; break }" ^
  "  catch { Start-Sleep -Seconds 1 }" ^
  "};" ^
  "if (-not $ok) { Write-Host '[错误] 健康检查失败: http://127.0.0.1:5000/api/health'; exit 1 }"
if errorlevel 1 (
    echo [错误] 请检查日志: docker compose logs --tail=120 jinvoice-sfu
    pause
    exit /b 1
)

if defined SHOULD_BUILD (
    > "%DOCKER_HASH_FILE%" <nul set /p ="%CURRENT_DOCKER_HASH%"
)

echo.
echo [成功] Docker 部署已启动。
echo URL: http://%EXISTING_IP%:5000
echo 日志: docker compose logs -f
echo.
pause
