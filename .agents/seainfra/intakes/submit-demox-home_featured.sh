#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
curl -sS -X POST \
  'https://moreshort-recommender-strategy-recall-data-update.gpu-api.seaart.dev/rec-prd-bot/integration-intakes' \
  -H 'Content-Type: application/json' \
  --max-time 180 \
  -d @"$ROOT/demox-home_featured.json"
echo
