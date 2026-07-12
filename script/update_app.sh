#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

MODE_FILE=".deploy_mode"
PID_FILE=".jinvoice.pid"
ARCHIVE=""
AUTO_CONFIRM="false"
VERSION_FILE=".jinvoice_version"
PREVIOUS_VERSION_FILE=".jinvoice_previous_version"
TEMP_DIR=""
CURRENT_MODE=""
ROLLBACK_DOCKER_IMAGE=""

PRESERVE_ITEMS=(
    ".env"
    "data"
    "dev.db"
    "logs"
    "node_modules"
    ".deploy_mode"
    ".docker_build_hash"
    ".node_modules_lock_hash"
    ".prisma_schema_hash"
    ".jinvoice.pid"
    ".jinvoice.win.pid"
    ".jinvoice_version"
    ".jinvoice_previous_version"
    ".jinvoice_last_successful_version"
)

REQUIRED_RELEASE_FILES=(
    ".release_version"
    "package.json"
    "server.js"
    "public/index.html"
    "start_app.sh"
    "start_app_nodocker.sh"
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

prepare_docker_rollback_image() {
    if [ "$CURRENT_MODE" != "docker" ] || ! command -v docker >/dev/null 2>&1; then
        return
    fi

    local image_id
    image_id=$(docker inspect --format '{{.Image}}' jinvoice-sfu 2>/dev/null || true)
    if [ -n "$image_id" ]; then
        ROLLBACK_DOCKER_IMAGE="jinvoice-sfu:rollback"
        docker tag "$image_id" "$ROLLBACK_DOCKER_IMAGE"
        echo "[信息] 已保留当前 Docker 镜像用于失败回滚。"
    fi
}

restore_docker_rollback_image() {
    if [ -z "$ROLLBACK_DOCKER_IMAGE" ]; then
        return
    fi

    touch .env
    if grep -q '^JINVOICE_IMAGE=' .env; then
        sed -i "s#^JINVOICE_IMAGE=.*#JINVOICE_IMAGE=${ROLLBACK_DOCKER_IMAGE}#" .env
    else
        printf '\nJINVOICE_IMAGE=%s\n' "$ROLLBACK_DOCKER_IMAGE" >> .env
    fi
}

start_current_mode() {
    local mode="$1"
    if [ "$mode" = "docker" ]; then
        ./start_app.sh
    else
        ./start_app_nodocker.sh
    fi
}

is_preserved_item() {
    local name="$1"
    local reserved
    for reserved in "${PRESERVE_ITEMS[@]}"; do
        if [ "$name" = "$reserved" ]; then
            return 0
        fi
    done
    return 1
}

copy_directory_contents() {
    local source_dir="$1"
    local target_dir="$2"

    mkdir -p "$target_dir"
    shopt -s dotglob nullglob
    local item
    for item in "$source_dir"/*; do
        cp -a "$item" "$target_dir/"
    done
    shopt -u dotglob nullglob
}

cleanup_release_files() {
    shopt -s dotglob nullglob
    local item base
    for item in "$SCRIPT_DIR"/*; do
        base=$(basename "$item")
        if is_preserved_item "$base" || [ "$base" = "$ARCHIVE" ]; then
            continue
        fi
        rm -rf "$item"
    done
    shopt -u dotglob nullglob
}

backup_current_release() {
    local backup_dir="$1"
    mkdir -p "$backup_dir"

    shopt -s dotglob nullglob
    local item base
    for item in "$SCRIPT_DIR"/*; do
        base=$(basename "$item")
        if is_preserved_item "$base" || [ "$base" = "$ARCHIVE" ]; then
            continue
        fi
        case "$base" in
            *.zip|*.tar.gz) continue ;;
        esac
        cp -a "$item" "$backup_dir/"
    done
    shopt -u dotglob nullglob

    for base in "$VERSION_FILE" "$PREVIOUS_VERSION_FILE" ".jinvoice_last_successful_version"; do
        if [ -f "$base" ]; then
            cp -a "$base" "$backup_dir/"
        fi
    done
}

backup_database() {
    local backup_dir="$1"
    mkdir -p "$backup_dir"
    shopt -s nullglob
    local db_file
    for db_file in data/dev.db data/dev.db-wal data/dev.db-shm; do
        if [ -f "$db_file" ]; then
            cp -a "$db_file" "$backup_dir/"
        fi
    done
    shopt -u nullglob
}

restore_database() {
    local backup_dir="$1"
    rm -f data/dev.db data/dev.db-wal data/dev.db-shm
    if [ -d "$backup_dir" ]; then
        copy_directory_contents "$backup_dir" "data"
    fi
}

record_previous_version() {
    if [ -f "$VERSION_FILE" ]; then
        cp "$VERSION_FILE" "$PREVIOUS_VERSION_FILE"
    fi
}

write_current_version() {
    local archive="$1"
    local asset_line="${2:-}"

    {
        printf 'archive=%s\n' "$archive"
        printf 'updated_at=%s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
        if [ -f ".release_version" ]; then
            cat ".release_version"
        fi
        if [ -n "$asset_line" ]; then
            printf 'frontend_asset=%s\n' "$asset_line"
        fi
    } > "$VERSION_FILE"
}

extract_archive() {
    local archive="$1"
    local target_dir="$2"

    if [[ "$archive" == *.tar.gz ]]; then
        local entry normalized
        while IFS= read -r entry; do
            normalized="${entry#./}"
            case "/$normalized/" in
                *"/../"*)
                    echo "[错误] 更新包包含不安全路径: $entry"
                    return 1
                    ;;
            esac
            case "$normalized" in
                /*)
                    echo "[错误] 更新包包含绝对路径: $entry"
                    return 1
                    ;;
            esac
        done < <(tar -tzf "$archive")
        tar -xzf "$archive" -C "$target_dir" --no-same-owner
        return
    fi

    if command -v python3 >/dev/null 2>&1; then
        python3 - "$archive" "$target_dir" <<'PY'
import sys
import zipfile
from pathlib import Path, PurePosixPath

archive = Path(sys.argv[1])
target = Path(sys.argv[2]).resolve()

with zipfile.ZipFile(archive, "r") as zf:
    for info in zf.infolist():
        normalized = info.filename.replace("\\", "/")
        path = PurePosixPath(normalized)
        if path.is_absolute() or ".." in path.parts:
            raise SystemExit(f"unsafe archive path: {info.filename}")
        output = (target / normalized).resolve()
        if output != target and target not in output.parents:
            raise SystemExit(f"archive path escapes target: {info.filename}")
    zf.extractall(target)
PY
        return
    fi

    unzip -t "$archive" >/dev/null
    unzip -o "$archive" -d "$target_dir" >/dev/null
}

validate_release_directory() {
    local source_dir="$1"
    local required

    if [ ! -d "$source_dir" ]; then
        echo "[错误] 更新包内未找到 dist_release 目录。"
        return 1
    fi

    for required in "${REQUIRED_RELEASE_FILES[@]}"; do
        if [ ! -f "$source_dir/$required" ]; then
            echo "[错误] 更新包缺少必要文件: dist_release/$required"
            return 1
        fi
    done
}

rollback_release() {
    local release_backup_dir="$1"
    local database_backup_dir="$2"

    echo "[回滚] 新版本启动失败，正在恢复上一版本..."
    stop_current_mode "$CURRENT_MODE" || true
    cleanup_release_files || return 1
    copy_directory_contents "$release_backup_dir" "$SCRIPT_DIR" || return 1
    restore_database "$database_backup_dir" || return 1
    restore_docker_rollback_image || return 1

    if start_current_mode "$CURRENT_MODE"; then
        echo "[回滚] 上一版本已恢复并通过健康检查。"
    else
        echo "[严重] 上一版本也未能启动，请立即检查服务日志。"
    fi
}

switch_to_staged_release() {
    local source_dir="$1"

    cleanup_release_files || return 1
    copy_directory_contents "$source_dir" "$SCRIPT_DIR" || return 1
    chmod +x ./*.sh 2>/dev/null || true
}

restart_unchanged_release() {
    echo "[恢复] 更新准备失败，正在重新启动原版本..."
    if ! start_current_mode "$CURRENT_MODE"; then
        echo "[严重] 原版本未能重新启动，请立即检查服务日志。"
    fi
}

echo "===================================================="
echo "JinVoice 安全更新工具"
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

TEMP_DIR=$(mktemp -d)
trap 'rm -rf "$TEMP_DIR"' EXIT
STAGE_DIR="$TEMP_DIR/stage"
RELEASE_BACKUP_DIR="$TEMP_DIR/release-backup"
DATABASE_BACKUP_DIR="$TEMP_DIR/database-backup"
mkdir -p "$STAGE_DIR"

echo "[信息] 在停服前解压并验证更新包..."
extract_archive "$ARCHIVE" "$STAGE_DIR"
SOURCE_DIR="$STAGE_DIR/dist_release"
validate_release_directory "$SOURCE_DIR"

CURRENT_MODE=$(detect_mode)
echo "[信息] 当前部署模式: $CURRENT_MODE"
backup_current_release "$RELEASE_BACKUP_DIR"
prepare_docker_rollback_image

stop_current_mode "$CURRENT_MODE"
if ! backup_database "$DATABASE_BACKUP_DIR"; then
    restart_unchanged_release
    exit 1
fi
if ! record_previous_version; then
    restart_unchanged_release
    exit 1
fi

echo "[信息] 切换到新版本文件..."
if ! switch_to_staged_release "$SOURCE_DIR"; then
    rollback_release "$RELEASE_BACKUP_DIR" "$DATABASE_BACKUP_DIR" || true
    exit 1
fi

ASSET_LINE=""
if [ -f "./public/index.html" ]; then
    ASSET_LINE=$(grep -o 'assets/index-[^" ]*\.js' ./public/index.html | head -n 1 || true)
fi

echo "[信息] 启动新版本并执行健康检查..."
if start_current_mode "$CURRENT_MODE"; then
    if ! write_current_version "$ARCHIVE" "$ASSET_LINE"; then
        echo "[警告] 服务已更新，但版本记录写入失败。"
    fi
    find . -maxdepth 1 -type f \( -name '*.zip' -o -name '*.tar.gz' \) -delete || \
        echo "[警告] 服务已更新，但旧更新包清理失败。"
    echo "===================================================="
    echo "[成功] 更新完成，新版本已通过健康检查。"
    echo "===================================================="
else
    rollback_release "$RELEASE_BACKUP_DIR" "$DATABASE_BACKUP_DIR" || true
    exit 1
fi
