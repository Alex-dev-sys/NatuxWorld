#!/usr/bin/env sh
# Create a compressed logical backup from the Compose PostgreSQL service.
# Run this from the repository root or through cron on the production VPS.
set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
BACKUP_DIR=${BACKUP_DIR:-"$ROOT_DIR/backups/postgres"}
RETENTION_DAYS=${BACKUP_RETENTION_DAYS:-14}
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
RAW_FILE="$BACKUP_DIR/natux-$STAMP.sql.tmp"
ARCHIVE_FILE="$BACKUP_DIR/natux-$STAMP.sql.gz"

umask 077
mkdir -p "$BACKUP_DIR"
cleanup() { rm -f "$RAW_FILE"; }
trap cleanup EXIT HUP INT TERM

if ! docker compose -f "$ROOT_DIR/docker-compose.yml" exec -T postgres pg_dump -U natux -d natux > "$RAW_FILE"; then
  echo "PostgreSQL backup failed" >&2
  exit 1
fi

gzip -c "$RAW_FILE" > "$ARCHIVE_FILE"
cleanup
trap - EXIT HUP INT TERM
find "$BACKUP_DIR" -type f -name 'natux-*.sql.gz' -mtime +"$RETENTION_DAYS" -delete

echo "Backup created: $ARCHIVE_FILE"
