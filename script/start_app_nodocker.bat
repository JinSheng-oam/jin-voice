@echo off
setlocal EnableExtensions EnableDelayedExpansion

cd /d "%~dp0"

set "ENV_FILE=.env"
set "MODE_FILE=.deploy_mode"
set "PID_FILE=.jinvoice.win.pid"
set "LOG_DIR=%CD%\logs"
set "OUT_LOG=%LOG_DIR%\server.out.log"
set "ERR_LOG=%LOG_DIR%\server.err.log"
set "DEPS_HASH_FILE=.node_modules_lock_hash"

echo ========================================
echo JinVoice 非 Docker 启动器
echo ========================================

node --version >nul 2>&1
if errorlevel 1 (
    echo [错误] 未安装 Node.js。
    pause
    exit /b 1
)

npm --version >nul 2>&1
if errorlevel 1 (
    echo [错误] npm 不可用。
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

> "%MODE_FILE%" echo nodocker

if exist "%PID_FILE%" (
    set /p "OLD_PID="<"%PID_FILE%"
    if defined OLD_PID (
        taskkill /PID !OLD_PID! /T /F >nul 2>&1
    )
    del "%PID_FILE%" >nul 2>&1
)

if not exist "%LOG_DIR%" mkdir "%LOG_DIR%"
if not exist "%CD%\data" mkdir "%CD%\data"
if not exist "%CD%\data\dev.db" if exist "%CD%\prisma\dev.db" (
    copy /Y "%CD%\prisma\dev.db" "%CD%\data\dev.db" >nul
    echo [信息] 已迁移旧数据库 prisma\dev.db 到 data\dev.db
)

:: 检查端口 5000 是否被占用
powershell -NoProfile -Command "$conn = Get-NetTCPConnection -LocalPort 5000 -ErrorAction SilentlyContinue; if ($conn) { exit 1 } else { exit 0 }"
if errorlevel 1 (
    echo [错误] 端口 5000 已被占用，请先停止占用该端口的进程。
    echo    查看占用: powershell "Get-NetTCPConnection -LocalPort 5000"
    pause
    exit /b 1
)

for /f "usebackq delims=" %%i in (`node -e "const fs=require('fs'); const crypto=require('crypto'); const target=fs.existsSync('package-lock.json') ? 'package-lock.json' : 'package.json'; process.stdout.write(crypto.createHash('sha256').update(fs.readFileSync(target)).digest('hex'));"`) do set "CURRENT_DEPS_HASH=%%i"
set "SAVED_DEPS_HASH="
if exist "%DEPS_HASH_FILE%" set /p "SAVED_DEPS_HASH="<"%DEPS_HASH_FILE%"

set "REINSTALL=0"
echo %* | findstr /c:"--reinstall" >nul 2>&1
if not errorlevel 1 set "REINSTALL=1"

if not exist "node_modules" set "REINSTALL=1"
if not "%REINSTALL%"=="1" if /i not "%CURRENT_DEPS_HASH%"=="%SAVED_DEPS_HASH%" set "REINSTALL=1"

if "%REINSTALL%"=="1" (
    echo [信息] 安装服务端依赖...
    call npm install --foreground-scripts
    if errorlevel 1 (
        echo [错误] npm install 失败。
        pause
        exit /b 1
    )
    > "%DEPS_HASH_FILE%" <nul set /p ="%CURRENT_DEPS_HASH%"
) else (
    echo [信息] 依赖未变化，跳过 npm install
)

echo [信息] 同步 Prisma 数据库...
call npx prisma migrate deploy
if errorlevel 1 (
    echo [错误] Prisma migrate deploy 失败。
    pause
    exit /b 1
)

for /f "usebackq delims=" %%i in (`where node`) do if not defined NODE_EXE set "NODE_EXE=%%i"
if not defined NODE_EXE (
    echo [错误] 无法定位 node.exe
    pause
    exit /b 1
)

for /f "usebackq delims=" %%i in (`powershell -NoProfile -Command "$p = Start-Process -FilePath '%NODE_EXE%' -ArgumentList 'server.js' -WorkingDirectory '%CD%' -PassThru -WindowStyle Hidden -RedirectStandardOutput '%OUT_LOG%' -RedirectStandardError '%ERR_LOG%'; $p.Id"`) do set "APP_PID=%%i"

if not defined APP_PID (
    echo [错误] 启动后台进程失败。
    pause
    exit /b 1
)

> "%PID_FILE%" echo %APP_PID%

echo.
echo [成功] 非 Docker 部署已启动。
echo PID: %APP_PID%
echo URL: http://%EXISTING_IP%:5000
echo 日志: %OUT_LOG% 和 %ERR_LOG%
echo 提示: 此模式不会自动启动 TURN，如需 TURN 请自行部署 coturn 或继续使用 Docker 部署。
echo.
pause
