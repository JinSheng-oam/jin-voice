@echo off
setlocal EnableExtensions EnableDelayedExpansion

cd /d "%~dp0"

set "MODE_FILE=.deploy_mode"
set "PID_FILE=.jinvoice.win.pid"
set "ARCHIVE="

for /f "usebackq delims=" %%i in (`powershell -NoProfile -Command "$item = Get-ChildItem -File | Where-Object { $_.Extension -eq '.zip' -or $_.Name -like '*.tar.gz' } | Sort-Object LastWriteTime -Descending | Select-Object -First 1; if ($item) { $item.Name }"`) do set "ARCHIVE=%%i"

echo ========================================
echo JinVoice 更新工具
echo ========================================

if not defined ARCHIVE (
    echo [错误] 未找到更新包（*.zip 或 *.tar.gz）。
    pause
    exit /b 1
)

echo [信息] 找到更新包: %ARCHIVE%
set /p "CONFIRM=确认继续更新？[y/N]: "
if /i not "%CONFIRM%"=="Y" (
    echo [信息] 更新已取消。
    exit /b 0
)

set "CURRENT_MODE="
if exist "%MODE_FILE%" set /p CURRENT_MODE=<"%MODE_FILE%"
if not defined CURRENT_MODE (
    docker --version >nul 2>&1
    if errorlevel 1 (
        set "CURRENT_MODE=nodocker"
    ) else (
        set "CURRENT_MODE=docker"
    )
)

echo [信息] 当前部署模式: %CURRENT_MODE%

if /i "%CURRENT_MODE%"=="docker" (
    docker compose down --remove-orphans >nul 2>&1
) else (
    if exist "%PID_FILE%" (
        set /p "OLD_PID="<"%PID_FILE%"
        if defined OLD_PID taskkill /PID !OLD_PID! /T /F >nul 2>&1
        del "%PID_FILE%" >nul 2>&1
    )
)

if not exist "%CD%\data" mkdir "%CD%\data"
if not exist "%CD%\data\dev.db" if exist "%CD%\prisma\dev.db" (
    copy /Y "%CD%\prisma\dev.db" "%CD%\data\dev.db" >nul
    echo [信息] 已迁移旧数据库 prisma\dev.db 到 data\dev.db
)

for /f "usebackq delims=" %%i in (`powershell -NoProfile -Command "$tmp = Join-Path ([System.IO.Path]::GetTempPath()) ('jinvoice-update-' + [guid]::NewGuid().ToString()); New-Item -ItemType Directory -Path $tmp | Out-Null; $tmp"`) do set "TEMP_DIR=%%i"

if not defined TEMP_DIR (
    echo [错误] 创建临时目录失败。
    pause
    exit /b 1
)

powershell -NoProfile -Command ^
  "if ('%ARCHIVE%'.ToLower().EndsWith('.tar.gz')) {" ^
  "  tar -xzf '%CD%\%ARCHIVE%' -C '%TEMP_DIR%'" ^
  "} else {" ^
  "  Expand-Archive -Path '%CD%\%ARCHIVE%' -DestinationPath '%TEMP_DIR%' -Force" ^
  "}"
if errorlevel 1 (
    echo [错误] 解压更新包失败。
    pause
    exit /b 1
)

:: 检查 dist_release 目录是否存在
if not exist "%TEMP_DIR%\dist_release" (
    echo [错误] 更新包内未找到 dist_release 目录，包格式可能不正确。
    echo        请确认使用 node script/build.js 生成的更新包。
    rd /s /q "%TEMP_DIR%" >nul 2>&1
    pause
    exit /b 1
)

powershell -NoProfile -Command ^
  "$root = '%CD%';" ^
  "$temp = '%TEMP_DIR%';" ^
  "$source = Join-Path $temp 'dist_release';" ^
  "$keep = @('.env', 'data', 'dev.db', 'logs', 'node_modules', '.deploy_mode', '.docker_build_hash', '.node_modules_lock_hash', '.prisma_schema_hash', 'update_app.bat', '%ARCHIVE%');" ^
  "if (Test-Path (Join-Path $root 'public')) { Remove-Item (Join-Path $root 'public') -Recurse -Force }" ^
  "Get-ChildItem -Force $root | Where-Object { $keep -notcontains $_.Name } | Remove-Item -Recurse -Force;" ^
  "Get-ChildItem -Force $source | ForEach-Object { Copy-Item $_.FullName -Destination $root -Recurse -Force };" ^
  "$entry = Join-Path $root 'public\\index.html';" ^
  "if (Test-Path $entry) { $match = Select-String -Path $entry -Pattern 'assets/index-[^\"'']*\.js' | Select-Object -First 1; if ($match) { Write-Host ('[信息] 更新后前端入口: ' + $match.Matches[0].Value) } }" ^
  "Get-ChildItem -File $root | Where-Object { ($_.Extension -eq '.zip' -or $_.Name -like '*.tar.gz') -and $_.Name -ne '%ARCHIVE%' } | Remove-Item -Force;" ^
  "if (Test-Path (Join-Path $root '%ARCHIVE%')) { Remove-Item (Join-Path $root '%ARCHIVE%') -Force }"

if errorlevel 1 (
    echo [错误] 应用更新文件失败。
    pause
    exit /b 1
)

rd /s /q "%TEMP_DIR%" >nul 2>&1

if /i "%CURRENT_MODE%"=="docker" (
    call start_app.bat
) else (
    call start_app_nodocker.bat
)
