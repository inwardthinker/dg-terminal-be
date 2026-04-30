#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RESULTS_DIR="${ROOT_DIR}/results"
ROUNDS=5

mkdir -p "${RESULTS_DIR}"

for i in $(seq 1 "${ROUNDS}"); do
  echo "Running round ${i} (node)..."
  node "${ROOT_DIR}/node/benchmark.mjs" --round "${i}"

  echo "Running round ${i} (go)..."
  (cd "${ROOT_DIR}/go" && go run . --round "${i}")

  echo "Running round ${i} (rust)..."
  (cd "${ROOT_DIR}/rust" && cargo run --quiet -- --round "${i}")
done

echo "Aggregating results..."
node "${ROOT_DIR}/analyze.mjs"
