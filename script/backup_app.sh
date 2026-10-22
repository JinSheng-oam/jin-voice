#!/usr/bin/env bash
set -euo pipefail

umask 077

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
INSTALL_DIR="$SCRIPT_DIR"
APP_DIR="$SCRIPT_DIR"
if [ -f "$SCRIPT_DIR/../server/prisma/schema.prisma" ]; then
    INSTALL_DIR=$(cd "$SCRIPT_DIR/.." && pwd)
    APP_DIR="$INSTALL_DIR/server"
fi
DATA_DIR="$APP_DIR/data"
BACKUP_DIR="${1:-$(dirname "$INSTALL_DIR")/jinvoice-backups}"

if [ "$#" -gt 1 ]; then
    echo "Usage: ./backup_app.sh [backup-directory]" >&2
    exit 2
fi
for command in python3 tar sha256sum; do
    if ! command -v "$command" >/dev/null 2>&1; then
        echo "[错误] 缺少备份依赖: $command" >&2
        exit 1
    fi
done
if [ ! -f "$DATA_DIR/dev.db" ]; then
    echo "[错误] 未找到持久化数据库: $DATA_DIR/dev.db" >&2
    exit 1
fi

mkdir -p "$BACKUP_DIR"
BACKUP_DIR=$(cd "$BACKUP_DIR" && pwd)
case "$BACKUP_DIR/" in
    "$INSTALL_DIR/"*)
        echo "[错误] 备份目录必须位于部署目录之外。" >&2
        exit 1
        ;;
esac

STAGE_DIR=$(mktemp -d "$BACKUP_DIR/.jinvoice-backup-XXXXXXXX")
cleanup() { rm -rf -- "$STAGE_DIR"; }
trap cleanup EXIT

# SQLite backup() reads a consistent snapshot even while the app is running in WAL mode.
python3 - "$DATA_DIR/dev.db" "$STAGE_DIR/dev.db" <<'PY'
import sqlite3
import sys
from pathlib import Path

source = sqlite3.connect(Path(sys.argv[1]).resolve().as_uri() + "?mode=ro", uri=True)
target = sqlite3.connect(sys.argv[2])
try:
    source.backup(target)
    result = target.execute("PRAGMA integrity_check").fetchone()
    if not result or result[0] != "ok":
        raise RuntimeError(f"SQLite integrity_check failed: {result}")
finally:
    target.close()
    source.close()
PY

mkdir -p "$STAGE_DIR/site-media"
if [ -d "$DATA_DIR/site-media" ]; then
    cp -a "$DATA_DIR/site-media/." "$STAGE_DIR/site-media/"
fi
find "$STAGE_DIR/site-media" -maxdepth 1 -type f -name '.*.uploading' -delete

python3 - "$STAGE_DIR" <<'PY'
import datetime
import json
import pathlib
import re
import sqlite3
import sys

stage = pathlib.Path(sys.argv[1])
database = sqlite3.connect(stage / "dev.db")
referenced = set()
try:
    row = database.execute(
        'SELECT backgroundMediaLibrary, backgroundImageUrl FROM SiteAppearance WHERE id = 1'
    ).fetchone()
    if row:
        entries = json.loads(row[0] or "[]")
        urls = [entry.get("url") for entry in entries if isinstance(entry, dict)]
        urls.append(row[1])
        for url in urls:
            if isinstance(url, str) and url.startswith("/site-media/"):
                name = url.removeprefix("/site-media/")
                if not re.fullmatch(r"[a-f0-9-]+\.(?:jpg|png|webp|avif|mp4|webm|ogv)", name, re.I):
                    raise RuntimeError(f"Invalid media reference: {url}")
                referenced.add(name)
finally:
    database.close()

missing = sorted(name for name in referenced if not (stage / "site-media" / name).is_file())
unreferenced = sorted(
    path.name for path in (stage / "site-media").iterdir()
    if path.is_file() and path.name not in referenced
)

manifest = {
    "createdAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    "database": "dev.db",
    "mediaFileCount": sum(path.is_file() for path in (stage / "site-media").iterdir()),
    "referencedMediaCount": len(referenced),
    "missingReferencedMedia": missing,
    "unreferencedMedia": unreferenced,
}
(stage / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
PY

STAMP=$(date -u '+%Y%m%dT%H%M%SZ')
SUFFIX="${STAGE_DIR##*-}"
ARCHIVE="$BACKUP_DIR/jinvoice-data-$STAMP-$SUFFIX.tar.gz"
tar -czf "$STAGE_DIR/backup.tar.gz" -C "$STAGE_DIR" dev.db site-media manifest.json
tar -tzf "$STAGE_DIR/backup.tar.gz" >/dev/null
mv "$STAGE_DIR/backup.tar.gz" "$ARCHIVE"
(cd "$BACKUP_DIR" && sha256sum "$(basename "$ARCHIVE")") > "$ARCHIVE.sha256"
echo "[成功] 数据备份: $ARCHIVE"
python3 - "$STAGE_DIR/manifest.json" <<'PY'
import json
import sys

with open(sys.argv[1], encoding="utf-8") as manifest_file:
    manifest = json.load(manifest_file)
missing = manifest["missingReferencedMedia"]
if missing:
    print("[警告] 原始数据已有缺失的背景文件: " + ", ".join(missing))
if manifest["unreferencedMedia"]:
    print(f"[信息] 备份中保留 {len(manifest['unreferencedMedia'])} 个未被当前背景库引用的媒体文件。")
PY
echo "[提示] 请将备份与 .sha256 文件复制到独立存储，并定期演练恢复。"
