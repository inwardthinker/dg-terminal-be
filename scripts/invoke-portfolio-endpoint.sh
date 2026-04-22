#!/usr/bin/env bash

set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3000}"
MODE="${1:-history}"
USER_ID="${USER_ID:-1}"
PERIOD="${PERIOD:-30d}"
POSITION_ID="${POSITION_ID:-asset-id}"
CLOSE_TYPE="${CLOSE_TYPE:-full}"
PERCENTAGE="${PERCENTAGE:-50}"

echo "Base URL: ${BASE_URL}"
echo "Mode: ${MODE}"

if [[ "${MODE}" == "history" ]]; then
  curl -sS "${BASE_URL}/api/portfolio/history?userId=${USER_ID}&period=${PERIOD}" | jq .
  exit 0
fi

if [[ "${MODE}" == "close" ]]; then
  if [[ "${CLOSE_TYPE}" == "partial" ]]; then
    PAYLOAD="{\"type\":\"partial\",\"percentage\":${PERCENTAGE}}"
  else
    PAYLOAD='{"type":"full"}'
  fi

  curl -sS -X POST \
    "${BASE_URL}/api/portfolio/positions/${POSITION_ID}/close?userId=${USER_ID}" \
    -H "Content-Type: application/json" \
    -d "${PAYLOAD}" | jq .
  exit 0
fi

echo "Unknown mode: ${MODE}"
echo "Usage:"
echo "  bash scripts/invoke-portfolio-endpoint.sh history"
echo "  bash scripts/invoke-portfolio-endpoint.sh close"
exit 1
