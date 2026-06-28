#!/bin/sh
set -e

DEPS_HASH_FILE=".node_modules_lock_hash"

compute_dep_hash() {
    node -e "const fs=require('fs'); const crypto=require('crypto'); const target=fs.existsSync('package-lock.json') ? 'package-lock.json' : 'package.json'; process.stdout.write(crypto.createHash('sha256').update(fs.readFileSync(target)).digest('hex'));"
}

CURRENT_DEPS_HASH="$(compute_dep_hash)"
SAVED_DEPS_HASH="$(cat "$DEPS_HASH_FILE" 2>/dev/null || true)"

if [ ! -d node_modules ] || [ "$CURRENT_DEPS_HASH" != "$SAVED_DEPS_HASH" ]; then
    echo "[docker] 检测到依赖变化或 node_modules 缺失，正在安装..."
    npm install --foreground-scripts
    printf '%s' "$CURRENT_DEPS_HASH" > "$DEPS_HASH_FILE"
else
    echo "[docker] 依赖未变化，跳过 npm install"
fi

mkdir -p data
echo "[docker] 应用 Prisma migrations..."
npx prisma migrate deploy

echo "[docker] 启动 JinVoice..."
exec node server.js
