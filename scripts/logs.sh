#!/usr/bin/env bash
# ==============================================================================
# Alomar Odoo Project - View Realtime Logs
# Usage: ./scripts/logs.sh [web|db]
# ==============================================================================

SERVICE="${1:-web}"
docker compose logs -f --tail=100 "${SERVICE}"
