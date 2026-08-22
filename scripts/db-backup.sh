#!/usr/bin/env bash
# Dump the production database to backups/fihspot-<timestamp>.sql.gz and prune
# old dumps. Retention: BACKUP_RETENTION_DAYS (default 14).
set -euo pipefail
cd "$(dirname "$0")/.."

ENV_FILE="${ENV_FILE:-.env}"
BACKUP_DIR="${BACKUP_DIR:-backups}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"

env_value() { grep -E "^$1=" "$ENV_FILE" 2>/dev/null | tail -n1 | cut -d= -f2- || true; }

DB_USER="$(env_value POSTGRES_USER)"; DB_USER="${DB_USER:-fihspot}"
DB_NAME="$(env_value POSTGRES_DB)";   DB_NAME="${DB_NAME:-fihspot}"

mkdir -p "$BACKUP_DIR"

stamp="$(date +%Y%m%d-%H%M%S)"
file="$BACKUP_DIR/fihspot-$stamp.sql.gz"

echo "==> dumping database '$DB_NAME' to $file"
docker compose exec -T db pg_dump -U "$DB_USER" "$DB_NAME" | gzip > "$file"
echo "==> wrote $file ($(du -h "$file" | cut -f1))"

echo "==> pruning backups older than $RETENTION_DAYS days"
find "$BACKUP_DIR" -name 'fihspot-*.sql.gz' -type f -mtime "+$RETENTION_DAYS" -print -delete | sed 's/^/    removed /'
