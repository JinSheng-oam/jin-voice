#!/usr/bin/env bash
set -euo pipefail

ROOT=$(mktemp -d)
trap 'rm -rf -- "$ROOT"' EXIT
mkdir -p "$ROOT/app/data/site-media" "$ROOT/backups"
cp "$(dirname "${BASH_SOURCE[0]}")/backup_app.sh" "$ROOT/app/backup_app.sh"
python3 - "$ROOT/app/data/dev.db" <<'PY'
import sqlite3
import sys

db = sqlite3.connect(sys.argv[1])
db.execute('CREATE TABLE SiteAppearance (id INTEGER PRIMARY KEY, backgroundMediaLibrary TEXT, backgroundImageUrl TEXT)')
db.execute('INSERT INTO SiteAppearance VALUES (1, ?, ?)', ('[{"url":"/site-media/aabb-1234.webp"}]', None))
db.commit()
db.close()
PY
printf 'media' > "$ROOT/app/data/site-media/aabb-1234.webp"
bash "$ROOT/app/backup_app.sh" "$ROOT/backups"
ARCHIVE=$(find "$ROOT/backups" -maxdepth 1 -name '*.tar.gz' -print -quit)
test -n "$ARCHIVE"
(cd "$ROOT/backups" && sha256sum -c "$(basename "$ARCHIVE").sha256")
tar -tzf "$ARCHIVE" | grep -q '^site-media/aabb-1234.webp$'
tar -xOf "$ARCHIVE" manifest.json | python3 -c 'import json, sys; data=json.load(sys.stdin); assert data["referencedMediaCount"] == 1 and not data["missingReferencedMedia"]'
tar -xOf "$ARCHIVE" dev.db > "$ROOT/restored.db"
python3 - "$ROOT/restored.db" <<'PY'
import sqlite3
import sys

db = sqlite3.connect(sys.argv[1])
assert db.execute("PRAGMA integrity_check").fetchone()[0] == "ok"
assert db.execute("SELECT count(*) FROM SiteAppearance").fetchone()[0] == 1
db.close()
PY

rm "$ROOT/app/data/site-media/aabb-1234.webp"
bash "$ROOT/app/backup_app.sh" "$ROOT/backups"
LATEST=$(find "$ROOT/backups" -maxdepth 1 -name '*.tar.gz' ! -path "$ARCHIVE" -print -quit)
test -n "$LATEST"
tar -xOf "$LATEST" manifest.json | python3 -c 'import json, sys; assert json.load(sys.stdin)["missingReferencedMedia"] == ["aabb-1234.webp"]'
