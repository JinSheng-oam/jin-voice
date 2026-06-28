#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

ENV_FILE=".env"
MODE_FILE=".deploy_mode"
PID_FILE=".jinvoice.pid"
LOG_DIR="logs"
LOG_FILE="$LOG_DIR/server.log"
DEPS_HASH_FILE=".node_modules_lock_hash"

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

compute_dep_hash() {
    node -e "const fs=require('fs'); const crypto=require('crypto'); const target=fs.existsSync('package-lock.json') ? 'package-lock.json' : 'package.json'; process.stdout.write(crypto.createHash('sha256').update(fs.readFileSync(target)).digest('hex'));"
}

stop_existing_process() {
    if [ -f "$PID_FILE" ]; then
        local pid
        pid=$(cat "$PID_FILE")
        if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
            echo "🛑 停止旧进程: $pid"
            kill "$pid" || true
            sleep 1
        fi
        rm -f "$PID_FILE"
    fi
}

check_port_available() {
    local port="$1"

    if command -v ss >/dev/null 2>&1; then
        if ss -tlnp 2>/dev/null | grep -q ":${port} "; then
            return 1
        fi
    elif command -v netstat >/dev/null 2>&1; then
        if netstat -tlpn 2>/dev/null | grep -q ":${port} "; then
            return 1
        fi
    fi

    return 0
}

echo "========================================"
echo "🚀 JinVoice 非 Docker 启动器"
echo "========================================"

for cmd in node npm; do
    if ! command -v "$cmd" >/dev/null 2>&1; then
        echo "❌ 缺少依赖: $cmd"
        exit 1
    fi
done

for cmd in make g++ pkg-config; do
    if ! command -v "$cmd" >/dev/null 2>&1; then
        echo "⚠️  未检测到 $cmd，mediasoup 首次安装可能失败。"
    fi
done

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

echo "nodocker" > "$MODE_FILE"

mkdir -p "$LOG_DIR" data
if [ ! -f data/dev.db ] && [ -f prisma/dev.db ]; then
    cp prisma/dev.db data/dev.db
    echo "✅ 已迁移旧数据库 prisma/dev.db -> data/dev.db"
fi
stop_existing_process

if ! check_port_available 5000; then
    echo "❌ 端口 5000 已被占用，请先停止占用该端口的进程。"
    if command -v ss >/dev/null 2>&1; then
        echo "   查看占用: ss -tlnp | grep :5000"
    else
        echo "   查看占用: netstat -tlpn | grep :5000"
    fi
    exit 1
fi

CURRENT_DEPS_HASH=$(compute_dep_hash)
SAVED_DEPS_HASH=""
if [ -f "$DEPS_HASH_FILE" ]; then
    SAVED_DEPS_HASH=$(cat "$DEPS_HASH_FILE")
fi

if [ ! -d node_modules ] || has_flag "--reinstall" "$@" || [ "$CURRENT_DEPS_HASH" != "$SAVED_DEPS_HASH" ]; then
    echo "📦 安装服务端依赖..."
    npm install --foreground-scripts
    printf '%s' "$CURRENT_DEPS_HASH" > "$DEPS_HASH_FILE"
else
    echo "📦 依赖未变化，跳过 npm install"
fi

echo "🗄️ 同步 Prisma 数据库..."
npx prisma migrate deploy

echo "🚀 启动 JinVoice 服务..."
nohup node server.js >> "$LOG_FILE" 2>&1 &
APP_PID=$!
echo "$APP_PID" > "$PID_FILE"

sleep 2
if kill -0 "$APP_PID" 2>/dev/null; then
    echo "✅ 非 Docker 部署已启动"
    echo "   PID: $APP_PID"
    echo "   Web: http://${EXISTING_IP:-localhost}:5000"
    echo "   日志: $LOG_FILE"
    echo "   提示: 此模式不会自动启动 TURN，如需 TURN 请自行部署 coturn 或继续使用 Docker 部署。"
else
    echo "❌ 启动失败，请检查日志: $LOG_FILE"
    exit 1
fi
