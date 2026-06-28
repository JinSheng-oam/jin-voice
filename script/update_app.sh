#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

MODE_FILE=".deploy_mode"
PID_FILE=".jinvoice.pid"
ARCHIVE=""
AUTO_CONFIRM="false"
KEEP_ITEMS=(
    ".env"
    "data"
    "dev.db"
    "logs"
    "node_modules"
    ".deploy_mode"
    ".docker_build_hash"
    ".node_modules_lock_hash"
    ".prisma_schema_hash"
    "update_app.sh"
)

usage() {
    cat <<'EOF'
用法:
  ./update_app.sh
  ./update_app.sh --yes --archive <更新包>

参数:
  -y, --yes              跳过交互确认，供自动部署使用
  -a, --archive <文件>   指定当前部署目录中的 zip 或 tar.gz 更新包
  -h, --help             显示帮助
EOF
}

parse_args() {
    while [ "$#" -gt 0 ]; do
        case "$1" in
            -y|--yes)
                AUTO_CONFIRM="true"
                shift
                ;;
            -a|--archive)
                if [ "$#" -lt 2 ]; then
                    echo "[错误] --archive 缺少文件名。"
                    exit 2
                fi
                ARCHIVE="$2"
                shift 2
                ;;
            -h|--help)
                usage
                exit 0
                ;;
            *)
                echo "[错误] 未知参数: $1"
                usage
                exit 2
                ;;
        esac
    done
}

validate_archive() {
    if [ -z "$ARCHIVE" ]; then
        ARCHIVE=$(find . -maxdepth 1 -type f \( -name '*.zip' -o -name '*.tar.gz' \) -printf '%T@ %f\n' 2>/dev/null \
            | sort -nr \
            | head -n 1 \
            | cut -d ' ' -f2-)
    fi

    if [ -z "$ARCHIVE" ]; then
        echo "[错误] 未找到更新包（*.zip 或 *.tar.gz）。"
        exit 1
    fi

    if [ "$(basename "$ARCHIVE")" != "$ARCHIVE" ]; then
        echo "[错误] 更新包必须位于当前部署目录，且只能传入文件名。"
        exit 1
    fi

    case "$ARCHIVE" in
        *.zip|*.tar.gz) ;;
        *)
            echo "[错误] 不支持的更新包格式: $ARCHIVE"
            exit 1
            ;;
    esac

    if [ ! -f "$ARCHIVE" ]; then
        echo "[错误] 更新包不存在: $ARCHIVE"
        exit 1
    fi
}

detect_mode() {
    if [ -f "$MODE_FILE" ]; then
        cat "$MODE_FILE"
        return
    fi

    if command -v docker >/dev/null 2>&1; then
        echo "docker"
    else
        echo "nodocker"
    fi
}

stop_current_mode() {
    local mode="$1"

    if [ "$mode" = "docker" ] && command -v docker >/dev/null 2>&1; then
        echo "[信息] 停止 Docker 服务..."
        docker compose down --remove-orphans 2>/dev/null || true
        return
    fi

    if [ -f "$PID_FILE" ]; then
        local pid
        pid=$(cat "$PID_FILE")
        if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
            echo "[信息] 停止非 Docker 进程: $pid"
            kill "$pid" || true
            sleep 1
        fi
        rm -f "$PID_FILE"
    fi
}

copy_release_contents() {
    local source_dir="$1"

    shopt -s dotglob
    for item in "$source_dir"/*; do
        [ -e "$item" ] || continue
        cp -a "$item" "$SCRIPT_DIR/"
    done
    shopt -u dotglob
}

cleanup_old_archives() {
    local keep_archive="$1"

    find . -maxdepth 1 -type f \( -name '*.zip' -o -name '*.tar.gz' \) | while read -r archive_path; do
        local base
        base=$(basename "$archive_path")
        if [ "$base" != "$keep_archive" ]; then
            rm -f "$archive_path"
        fi
    done
}

extract_archive() {
    local archive="$1"
    local temp_dir="$2"

    if [[ "$archive" == *.tar.gz ]]; then
        tar -xzf "$archive" -C "$temp_dir"
        return
    fi

    if command -v python3 >/dev/null 2>&1; then
        python3 - <<PY
import zipfile
from pathlib import Path

archive = Path(r"$archive")
target = Path(r"$temp_dir")

with zipfile.ZipFile(archive, "r") as zf:
    for info in zf.infolist():
        info.filename = info.filename.replace("\\\\", "/")
        zf.extract(info, target)
PY
        return
    fi

    unzip -o "$archive" -d "$temp_dir" >/dev/null
}

echo "===================================================="
echo "JinVoice 更新工具"
echo "===================================================="

parse_args "$@"
validate_archive

echo "[信息] 找到更新包: $ARCHIVE"
if [ "$AUTO_CONFIRM" != "true" ]; then
    read -rp "确认继续更新？(y/N) " CONFIRM
    if [[ ! "$CONFIRM" =~ ^[Yy]$ ]]; then
        echo "[信息] 更新已取消。"
        exit 0
    fi
fi

CURRENT_MODE=$(detect_mode)
echo "[信息] 当前部署模式: $CURRENT_MODE"
stop_current_mode "$CURRENT_MODE"

mkdir -p data
if [ ! -f data/dev.db ] && [ -f prisma/dev.db ]; then
    cp prisma/dev.db data/dev.db
    echo "[信息] 已迁移旧数据库 prisma/dev.db -> data/dev.db"
fi

TEMP_DIR=$(mktemp -d)
trap 'rm -rf "$TEMP_DIR"' EXIT

echo "[信息] 解压更新包..."
extract_archive "$ARCHIVE" "$TEMP_DIR"

SOURCE_DIR="$TEMP_DIR/dist_release"
if [ ! -d "$SOURCE_DIR" ]; then
    echo "[错误] 更新包内未找到 dist_release 目录，包格式可能不正确。"
    echo "       请确认使用 node script/build.js 生成的更新包。"
    exit 1
fi

echo "[信息] 清理旧静态资源..."
rm -rf ./public

echo "[信息] 清理旧发布文件..."
find . -mindepth 1 -maxdepth 1 | while read -r item; do
    base=$(basename "$item")
    keep="false"
    for reserved in "${KEEP_ITEMS[@]}"; do
        if [ "$base" = "$reserved" ] || [ "$base" = "$ARCHIVE" ]; then
            keep="true"
            break
        fi
    done

    if [ "$keep" = "false" ]; then
        rm -rf "$item"
    fi
done

echo "[信息] 复制新版本文件..."
copy_release_contents "$SOURCE_DIR"
chmod +x ./*.sh 2>/dev/null || true

cleanup_old_archives "$ARCHIVE"
rm -f "$ARCHIVE"

if [ -f "./public/index.html" ]; then
    ASSET_LINE=$(grep -o 'assets/index-[^"]*\.js' ./public/index.html | head -n 1)
    if [ -n "$ASSET_LINE" ]; then
        echo "[信息] 更新后前端入口: $ASSET_LINE"
    fi
fi

echo "[信息] 重启服务..."
if [ "$CURRENT_MODE" = "docker" ]; then
    ./start_app.sh
else
    ./start_app_nodocker.sh
fi

echo "===================================================="
echo "[成功] 更新完成。"
echo "===================================================="
