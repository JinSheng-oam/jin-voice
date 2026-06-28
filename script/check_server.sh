#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

ENV_FILE=".env"
PID_FILE=".jinvoice.pid"

echo "========================================"
echo "🩺 JinVoice 环境诊断工具"
echo "========================================"

if command -v docker >/dev/null 2>&1 && docker ps --format '{{.Names}}' | grep -q '^jinvoice-sfu$'; then
    echo "1. 当前模式: Docker"
    echo "✅ SFU 容器正在运行"

    if docker ps --format '{{.Names}}' | grep -q '^jinvoice-turn$'; then
        echo "✅ TURN 容器正在运行"
    else
        echo "⚠️ TURN 容器未运行"
    fi
else
    echo "1. 当前模式: 非 Docker / 未检测到容器"
    if [ -f "$PID_FILE" ]; then
        PID=$(cat "$PID_FILE")
        if kill -0 "$PID" 2>/dev/null; then
            echo "✅ JinVoice 进程正在运行 (PID: $PID)"
        else
            echo "❌ PID 文件存在，但进程已退出"
        fi
    else
        echo "⚠️ 未找到非 Docker PID 文件"
    fi
fi

echo
echo "2. 端口监听检查..."

check_tcp_port() {
    local port="$1"
    local label="$2"

    if command -v ss >/dev/null 2>&1; then
        if ss -tlnp 2>/dev/null | grep -q ":${port} "; then
            echo "✅ ${label} 端口 ${port} 已监听"
            return 0
        fi
    elif command -v netstat >/dev/null 2>&1; then
        if netstat -tlpn 2>/dev/null | grep -q ":${port} "; then
            echo "✅ ${label} 端口 ${port} 已监听"
            return 0
        fi
    fi

    echo "❌ 未检测到 ${label} 端口 ${port} 监听"
    return 1
}

check_udp_range() {
    local range_pattern="$1"
    local label="$2"

    if command -v ss >/dev/null 2>&1; then
        if ss -ulnp 2>/dev/null | grep -qE "$range_pattern"; then
            echo "✅ 检测到 ${label} UDP 端口监听"
            return 0
        fi
    elif command -v netstat >/dev/null 2>&1; then
        if netstat -ulnp 2>/dev/null | grep -qE "$range_pattern"; then
            echo "✅ 检测到 ${label} UDP 端口监听"
            return 0
        fi
    fi

    echo "⚠️ 未检测到 ${label} UDP 端口监听"
    return 1
}

check_tcp_port 5000 "HTTP/Socket.IO"
check_udp_range ':400[0-9][0-9]' "mediasoup"
check_tcp_port 3478 "TURN"

echo
echo "3. .env 配置检查..."
if [ -f "$ENV_FILE" ]; then
    grep '^MEDIASOUP_ANNOUNCED_IP=' "$ENV_FILE" || echo "⚠️ 未设置 MEDIASOUP_ANNOUNCED_IP"
    grep '^MEDIASOUP_LISTEN_IP=' "$ENV_FILE" || echo "⚠️ 未设置 MEDIASOUP_LISTEN_IP"
    grep '^DATABASE_URL=' "$ENV_FILE" || echo "⚠️ 未设置 DATABASE_URL"
else
    echo "❌ .env 文件不存在"
fi

echo
echo "4. 运行建议..."
echo "- Docker 模式建议查看: docker compose logs -f"
echo "- 非 Docker 模式建议查看: logs/server.log"
echo "- 如果外部仍无法连通，重点检查 5000 / 3478 / 40000-40100 端口和安全组"

echo "========================================"
