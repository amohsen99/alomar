#!/usr/bin/env bash
# ==============================================================================
# Alomar Odoo Project - Upgrade / Install Module Script
# Usage: ./scripts/update_module.sh <module_name> [database_name]
# Example: ./scripts/update_module.sh alomar_base alomar
# ==============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_ROOT"

if [ $# -lt 1 ]; then
    echo "Usage: $0 <module_name> [database_name]"
    echo "Example: $0 alomar_base alomar"
    exit 1
fi

MODULE_NAME="$1"
DB_NAME="${2:-alomar}"

echo "=========================================================="
echo " Upgrading module '${MODULE_NAME}' on database '${DB_NAME}'"
echo "=========================================================="

docker compose run --rm web odoo -u "${MODULE_NAME}" -d "${DB_NAME}" --stop-after-init

echo "Module update completed. Restarting web service..."
docker compose restart web
echo "Web service restarted successfully."
