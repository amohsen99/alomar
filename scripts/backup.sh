#!/usr/bin/env bash
# ==============================================================================
# Alomar Odoo Project - Automated Database & Filestore Backup Script
# Usage: ./scripts/backup.sh [database_name]
# ==============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
BACKUP_DIR="${PROJECT_ROOT}/backups"
TIMESTAMP="$(date +'%Y%m%d_%H%M%S')"

cd "$PROJECT_ROOT"

if [ -f .env ]; then
    # Load .env file
    set -a
    source .env
    set +a
else
    echo "Error: .env file not found in ${PROJECT_ROOT}"
    exit 1
fi

DB_NAME="${1:-${POSTGRES_DB}}"

if [ "$DB_NAME" == "postgres" ]; then
    echo "Warning: No specific database name provided. Defaulting to 'alomar' database check..."
    DB_NAME="alomar"
fi

mkdir -p "$BACKUP_DIR"

DB_CONTAINER="${COMPOSE_PROJECT_NAME:-alomar}-db"
WEB_CONTAINER="${COMPOSE_PROJECT_NAME:-alomar}-web"

echo "=========================================================="
echo " Starting Alomar Odoo Backup for Database: ${DB_NAME}"
echo " Timestamp: ${TIMESTAMP}"
echo "=========================================================="

# 1. PostgreSQL Database Dump (Custom Compressed format)
DB_BACKUP_FILE="${BACKUP_DIR}/${DB_NAME}_${TIMESTAMP}.dump"
echo "[1/2] Backing up PostgreSQL database..."
docker exec -t "${DB_CONTAINER}" pg_dump -U "${POSTGRES_USER}" -d "${DB_NAME}" -F c -b -v > "${DB_BACKUP_FILE}"
echo "Database backup completed: ${DB_BACKUP_FILE} ($(du -h "${DB_BACKUP_FILE}" | cut -f1))"

# 2. Filestore Backup
FILESTORE_BACKUP_FILE="${BACKUP_DIR}/${DB_NAME}_filestore_${TIMESTAMP}.tar.gz"
echo "[2/2] Backing up Odoo Filestore for ${DB_NAME}..."
docker exec -t "${WEB_CONTAINER}" tar -czf - -C /var/lib/odoo/filestore "${DB_NAME}" > "${FILESTORE_BACKUP_FILE}" 2>/dev/null || {
    echo "Note: Filestore directory for '${DB_NAME}' was not found or is empty (normal if new DB)."
    rm -f "${FILESTORE_BACKUP_FILE}"
}

if [ -f "${FILESTORE_BACKUP_FILE}" ]; then
    echo "Filestore backup completed: ${FILESTORE_BACKUP_FILE} ($(du -h "${FILESTORE_BACKUP_FILE}" | cut -f1))"
fi

# 3. Retention policy: Remove backups older than 7 days
echo "Cleaning up backups older than 7 days..."
find "${BACKUP_DIR}" -type f \( -name "*.dump" -o -name "*.tar.gz" \) -mtime +7 -exec rm -f {} \;

echo "Backup process finished successfully!"
