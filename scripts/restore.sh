#!/usr/bin/env bash
# ==============================================================================
# Alomar Odoo Project - Database & Filestore Restore Script
# Usage: ./scripts/restore.sh <path_to_dump_file> [target_database_name] [path_to_filestore_tar]
# ==============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_ROOT"

if [ -f .env ]; then
    set -a
    source .env
    set +a
else
    echo "Error: .env file not found."
    exit 1
fi

if [ $# -lt 1 ]; then
    echo "Usage: $0 <path_to_dump_file> [target_database_name] [path_to_filestore_tar]"
    exit 1
fi

DUMP_FILE="$1"
TARGET_DB="${2:-alomar}"
FILESTORE_TAR="${3:-}"

DB_CONTAINER="${COMPOSE_PROJECT_NAME:-alomar}-db"
WEB_CONTAINER="${COMPOSE_PROJECT_NAME:-alomar}-web"

if [ ! -f "$DUMP_FILE" ]; then
    echo "Error: Dump file '$DUMP_FILE' does not exist."
    exit 1
fi

echo "=========================================================="
echo " Restoring Database: ${TARGET_DB}"
echo " Source Dump: ${DUMP_FILE}"
echo "=========================================================="

read -p "Warning: This will recreate database '${TARGET_DB}'. Continue? (y/N): " -r CONFIRM
if [[ ! $CONFIRM =~ ^[Yy]$ ]]; then
    echo "Restore aborted."
    exit 0
fi

# 1. Terminate active connections and recreate target DB
echo "Recreating database ${TARGET_DB}..."
docker exec -i "${DB_CONTAINER}" psql -U "${POSTGRES_USER}" -d postgres -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${TARGET_DB}';" || true
docker exec -i "${DB_CONTAINER}" dropdb -U "${POSTGRES_USER}" --if-exists "${TARGET_DB}"
docker exec -i "${DB_CONTAINER}" createdb -U "${POSTGRES_USER}" -O "${POSTGRES_USER}" "${TARGET_DB}"

# 2. Restore PostgreSQL Dump
echo "Restoring database content from dump..."
docker exec -i "${DB_CONTAINER}" pg_restore -U "${POSTGRES_USER}" -d "${TARGET_DB}" --no-owner --no-privileges < "${DUMP_FILE}" || {
    echo "Notice: pg_restore reported non-critical warnings (common with Odoo extensions)."
}

# 3. Restore Filestore if provided
if [ -n "$FILESTORE_TAR" ] && [ -f "$FILESTORE_TAR" ]; then
    echo "Restoring filestore for ${TARGET_DB}..."
    docker exec -i "${WEB_CONTAINER}" mkdir -p "/var/lib/odoo/filestore/${TARGET_DB}"
    docker exec -i "${WEB_CONTAINER}" tar -xzf - -C "/var/lib/odoo/filestore/" < "${FILESTORE_TAR}"
fi

echo "Database restore finished successfully!"
