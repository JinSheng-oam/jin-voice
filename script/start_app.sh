#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

MODE_FILE=".deploy_mode"
ENV_FILE=".env"
DOCKER_HASH_FILE=".docker_build_hash"

has_flag() {
    local flag="$1"
    shift || true
    for arg in "$@"; do
        if [ "$arg" = "$flag" ]; then
            return 0
        fi
    done
    return 1
}

upsert_env() {
    local key="$1"
    local value="$2"

    touch "$ENV_FILE"
    sed -i '/\r$/d' "$ENV_FILE" 2>/dev/null || true
    if grep -q "^${key}=" "$ENV_FILE"; then
        sed -i "s#^${key}=.*#${key}=${value}#" "$ENV_FILE"
    else
        printf '\n%s=%s\n' "$key" "$value" >> "$ENV_FILE"
    fi
}

get_local_ip() {
    hostname -I 2>/dev/null | awk '{print $1}'
}

detect_public_ip() {
    if ! command -v curl >/dev/null 2>&1; then
        return 1
    fi

    local detected_ip
    detected_ip=$(curl -fsSL ip.sb 2>/dev/null | tr -d '\r\n[:space:]')

    if [ -n "$detected_ip" ]; then
        printf '%s' "$detected_ip"
        return 0
    fi

    return 1
}

compute_file_hash() {
    local target="$1"
    if command -v sha256sum >/dev/null 2>&1; then
        sha256sum "$target" | awk '{print $1}'
        return
    fi

    if command -v shasum >/dev/null 2>&1; then
        shasum -a 256 "$target" | awk '{print $1}'
        return
    fi

    if command -v python3 >/dev/null 2>&1; then
        python3 - <<PY
import hashlib
from pathlib import Path

print(hashlib.sha256(Path(r"$target").read_bytes()).hexdigest(), end="")
PY
        return
    fi

    return 1
}

docker_image_exists() {
    [ -n "$(docker compose images -q jinvoice-sfu 2>/dev/null)" ]
}

get_configured_image() {
    if [ -f "$ENV_FILE" ]; then
        grep "^JINVOICE_IMAGE=" "$ENV_FILE" | tail -1 | cut -d '=' -f2-
    fi
}

echo "========================================"
echo "🚀 JinVoice Docker 启动器"
echo "========================================"

if ! command -v docker >/dev/null 2>&1; then
    echo "❌ 未找到 Docker。"
    echo "   如果你要裸机部署，请改用: ./start_app_nodocker.sh"
    exit 1
fi

EXISTING_IP=""
if [ -f "$ENV_FILE" ]; then
    EXISTING_IP=$(grep "^MEDIASOUP_ANNOUNCED_IP=" "$ENV_FILE" | tail -1 | cut -d '=' -f2-)
fi

DETECTED_PUBLIC_IP=""
if DETECTED_PUBLIC_IP=$(detect_public_ip); then
    echo "✅ 已通过 curl ip.sb 自动获取公网 IP: $DETECTED_PUBLIC_IP"
    EXISTING_IP="$DETECTED_PUBLIC_IP"
elif [ -n "$EXISTING_IP" ]; then
    echo "⚠️  自动获取公网 IP 失败，回退使用 .env 中现有值: $EXISTING_IP"
else
    echo "⚠️  自动获取公网 IP 失败。"
    read -rp "请输入服务器公网 IP: " PUBLIC_IP
    if [ -z "$PUBLIC_IP" ]; then
        echo "❌ 必须提供公网 IP。"
        exit 1
    fi
    EXISTING_IP="$PUBLIC_IP"
fi

LOCAL_IP=$(get_local_ip)
LOCAL_IP=${LOCAL_IP:-0.0.0.0}

upsert_env "MEDIASOUP_ANNOUNCED_IP" "$EXISTING_IP"
upsert_env "MEDIASOUP_LISTEN_IP" "$LOCAL_IP"
upsert_env "DATABASE_URL" "file:../data/dev.db"
upsert_env "PORT" "5000"

mkdir -p data
if [ ! -f data/dev.db ] && [ -f prisma/dev.db ]; then
    cp prisma/dev.db data/dev.db
    echo "✅ 已迁移旧数据库 prisma/dev.db -> data/dev.db"
fi

echo "✅ MEDIASOUP_ANNOUNCED_IP=$EXISTING_IP"
echo "✅ MEDIASOUP_LISTEN_IP=$LOCAL_IP"
echo "docker" > "$MODE_FILE"

echo "🛑 停止旧容器..."
docker compose down --remove-orphans >/dev/null 2>&1 || true

BUILD_FLAG=""
SHOULD_BUILD="false"
CURRENT_DOCKER_HASH=""
CONFIGURED_IMAGE=$(get_configured_image)

if [ -n "$CONFIGURED_IMAGE" ]; then
    echo "📥 拉取 GitHub Actions 构建镜像: $CONFIGURED_IMAGE"
    docker compose pull jinvoice-sfu
else
    if CURRENT_DOCKER_HASH=$(compute_file_hash Dockerfile 2>/dev/null); then
        :
    fi

    if has_flag "--build" "$@"; then
        SHOULD_BUILD="true"
    elif ! docker_image_exists; then
        SHOULD_BUILD="true"
    elif [ -n "$CURRENT_DOCKER_HASH" ] && ! has_flag "--no-build" "$@" && { [ ! -f "$DOCKER_HASH_FILE" ] || [ "$(cat "$DOCKER_HASH_FILE")" != "$CURRENT_DOCKER_HASH" ]; }; then
        SHOULD_BUILD="true"
    fi

    if [ "$SHOULD_BUILD" = "true" ]; then
        BUILD_FLAG="--build"
        echo "🔨 检测到首次启动或镜像环境变化，执行 Docker 构建..."
    else
        echo "⚡ 复用现有 Docker 镜像，跳过重建..."
    fi
fi

echo "🚀 启动 Docker 服务..."
docker compose up -d $BUILD_FLAG --remove-orphans

if [ "$SHOULD_BUILD" = "true" ] && [ -n "$CURRENT_DOCKER_HASH" ]; then
    printf '%s' "$CURRENT_DOCKER_HASH" > "$DOCKER_HASH_FILE"
fi

echo "✅ Docker 部署已启动"
echo "   Web: http://${EXISTING_IP:-localhost}:5000"
echo "   日志: docker compose logs -f"
