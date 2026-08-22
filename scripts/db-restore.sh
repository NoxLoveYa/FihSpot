#!/usr/bin/env bash
# Restore a database dump produced by db-backup.sh into the running container.
# Destructive: the current data in the target database is replaced.
set -euo pipefail
cd "$(dirname "$0")/.."

ENV_FILE="${ENV_FILE:-.env}"
BACKUP_DIR="${BACKUP_DIR:-backups}"

if [[ $# -ne 1 ]]; then
  echo "usage: $0 <backup-file.sql.gz>" >&2
  echo "available backups:" >&2
  ls -lh "$BACKUP_DIR"/fihspot-*.sql.gz 2>/dev/null || echo "  (none found in $BACKUP_DIR)" >&2
  exit 1
fi

file="$1"
[[ -f "$file" ]] || { echo "error: file not found: $file" >&2; exit 1; }

env_value() { grep -E "^$1=" "$ENV_FILE" 2>/dev/null | tail -n1 | cut -d= -f2- || true; }

DB_USER="$(env_value POSTGRES_USER)"; DB_USER="${DB_USER:-fihspot}"
DB_NAME="$(env_value POSTGRES_DB)";   DB_NAME="${DB_NAME:-fihspot}"

echo "This will OVERWRITE database '$DB_NAME' with:"
echo "  $file ($(du -h "$file" | cut -f1))"
read -r -p "Type RESTORE to continue: " answer
[[ "$answer" == "RESTORE" ]] || { echo "aborted"; exit 1; }

gunzip -c "$file" | docker compose exec -T db psql -v ON_ERROR_STOP=1 -U "$DB_USER" -d "$DB_NAME"
echo "==> restore complete — restarting the server so caches reset"
docker compose restart server
