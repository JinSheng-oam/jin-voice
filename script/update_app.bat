@echo off
chcp 65001 >nul
setlocal EnableExtensions EnableDelayedExpansion

cd /d "%~dp0"

set "MODE_FILE=.deploy_mode"
set "PID_FILE=.jinvoice.win.pid"
set "ARCHIVE="
set "AUTO_CONFIRM=false"
set "VERSION_FILE=.jinvoice_version"
set "PREVIOUS_VERSION_FILE=.jinvoice_previous_version"

:parse_args
if "%~1"=="" goto after_parse_args
if /i "%~1"=="-y" (
    set "AUTO_CONFIRM=true"
    shift
    goto parse_args
)
if /i "%~1"=="--yes" (
    set "AUTO_CONFIRM=true"
    shift
    goto parse_args
)
if /i "%~1"=="-a" (
    if "%~2"=="" goto missing_archive_arg
    set "ARCHIVE=%~2"
    shift
    shift
    goto parse_args
)
if /i "%~1"=="--archive" (
    if "%~2"=="" goto missing_archive_arg
    set "ARCHIVE=%~2"
    shift
    shift
    goto parse_args
)
if /i "%~1"=="-h" goto usage
if /i "%~1"=="--help" goto usage
echo [错误] 未知参数: %~1
goto usage_error

:missing_archive_arg
echo [错误] --archive 缺少文件名。
goto usage_error

:usage
echo Usage:
echo   update_app.bat
echo   update_app.bat --yes --archive 更新包.zip
echo.
echo Options:
echo   -y, --yes              Skip confirmation for automation
echo   -a, --archive FILE     Use a zip or tar.gz archive in the current deploy directory
echo   -h, --help             Show help
exit /b 0

:usage_error
echo Usage: update_app.bat [--yes] [--archive FILE]
exit /b 2

:after_parse_args

if not defined ARCHIVE (
    for /f "usebackq delims=" %%i in (`powershell -NoProfile -Command "$item = Get-ChildItem -File | Where-Object { $_.Extension -eq '.zip' -or $_.Name -like '*.tar.gz' } | Sort-Object LastWriteTime -Descending | Select-Object -First 1; if ($item) { $item.Name }"`) do set "ARCHIVE=%%i"
)

echo ========================================
echo JinVoice 更新工具
echo ========================================

if not defined ARCHIVE (
    echo [错误] 未找到更新包（*.zip 或 *.tar.gz）。
    call :pause_if_interactive
    exit /b 1
)

powershell -NoProfile -Command ^
  "$name=$env:ARCHIVE;" ^
  "if ([string]::IsNullOrWhiteSpace($name)) { exit 1 }" ^
  "if ([IO.Path]::GetFileName($name) -ne $name) { exit 1 }" ^
  "if ($name.IndexOfAny([IO.Path]::GetInvalidFileNameChars()) -ge 0) { exit 1 }"
if errorlevel 1 (
    echo [错误] 更新包必须位于当前部署目录，且只能传入文件名。
    call :pause_if_interactive
    exit /b 1
)

powershell -NoProfile -Command ^
  "$name=($env:ARCHIVE).ToLowerInvariant();" ^
  "if ($name.EndsWith('.zip') -or $name.EndsWith('.tar.gz')) { exit 0 }" ^
  "exit 1"
if errorlevel 1 (
    echo [错误] 不支持的更新包格式: %ARCHIVE%
    call :pause_if_interactive
    exit /b 1
)

if not exist "%ARCHIVE%" (
    echo [错误] 更新包不存在: %ARCHIVE%
    call :pause_if_interactive
    exit /b 1
)

echo [信息] 找到更新包: %ARCHIVE%
if /i not "%AUTO_CONFIRM%"=="true" (
    set /p "CONFIRM=确认继续更新？[y/N]: "
    if /i not "!CONFIRM!"=="Y" (
        echo [信息] 更新已取消。
        exit /b 0
    )
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

if exist "%VERSION_FILE%" (
    copy /Y "%VERSION_FILE%" "%PREVIOUS_VERSION_FILE%" >nul
    echo [信息] 已备份上一个成功版本到 %PREVIOUS_VERSION_FILE%
)

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
    call :pause_if_interactive
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
    call :pause_if_interactive
    exit /b 1
)

:: 检查 dist_release 目录是否存在
if not exist "%TEMP_DIR%\dist_release" (
    echo [错误] 更新包内未找到 dist_release 目录，包格式可能不正确。
    echo        请确认使用 node script/build.js 生成的更新包。
    rd /s /q "%TEMP_DIR%" >nul 2>&1
    call :pause_if_interactive
    exit /b 1
)

powershell -NoProfile -Command ^
  "$root = '%CD%';" ^
  "$temp = '%TEMP_DIR%';" ^
  "$source = Join-Path $temp 'dist_release';" ^
  "$keep = @('.env', 'data', 'dev.db', 'logs', 'node_modules', '.deploy_mode', '.docker_build_hash', '.node_modules_lock_hash', '.prisma_schema_hash', '.jinvoice_version', '.jinvoice_previous_version', 'update_app.bat', '%ARCHIVE%');" ^
  "if (Test-Path (Join-Path $root 'public')) { Remove-Item (Join-Path $root 'public') -Recurse -Force }" ^
  "Get-ChildItem -Force $root | Where-Object { $keep -notcontains $_.Name } | Remove-Item -Recurse -Force;" ^
  "Get-ChildItem -Force $source | ForEach-Object { Copy-Item $_.FullName -Destination $root -Recurse -Force };" ^
  "$entry = Join-Path $root 'public\\index.html';" ^
  "$asset='';" ^
  "if (Test-Path $entry) { $match = Select-String -Path $entry -Pattern 'assets/index-[^\"'']*\.js' | Select-Object -First 1; if ($match) { $asset=$match.Matches[0].Value; Write-Host ('[信息] 更新后前端入口: ' + $asset) } }" ^
  "$versionLines = @('archive=%ARCHIVE%', ('updated_at=' + (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')));" ^
  "$releaseVersion = Join-Path $root '.release_version';" ^
  "if (Test-Path $releaseVersion) { $versionLines += Get-Content $releaseVersion }" ^
  "if ($asset) { $versionLines += ('frontend_asset=' + $asset) }" ^
  "Set-Content -Path (Join-Path $root '.jinvoice_version') -Value $versionLines -Encoding utf8;" ^
  "Write-Host '[信息] 当前版本记录: .jinvoice_version';" ^
  "Get-ChildItem -File $root | Where-Object { ($_.Extension -eq '.zip' -or $_.Name -like '*.tar.gz') -and $_.Name -ne '%ARCHIVE%' } | Remove-Item -Force;" ^
  "if (Test-Path (Join-Path $root '%ARCHIVE%')) { Remove-Item (Join-Path $root '%ARCHIVE%') -Force }"

if errorlevel 1 (
    echo [错误] 应用更新文件失败。
    call :pause_if_interactive
    exit /b 1
)

rd /s /q "%TEMP_DIR%" >nul 2>&1

if /i "%CURRENT_MODE%"=="docker" (
    call start_app.bat
) else (
    call start_app_nodocker.bat
)

exit /b %errorlevel%

:pause_if_interactive
if /i not "%AUTO_CONFIRM%"=="true" pause
exit /b 0
