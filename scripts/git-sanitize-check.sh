#!/usr/bin/env bash

set -euo pipefail

staged_files="$(git diff --cached --name-only --diff-filter=ACMR)"

if [[ -z "${staged_files}" ]]; then
  exit 0
fi

blocked_env_files="$(echo "${staged_files}" | rg '^\.env($|\.|/)' || true)"
if [[ -n "${blocked_env_files}" ]]; then
  echo "Blocked: environment files cannot be committed:"
  echo "${blocked_env_files}"
  exit 1
fi

secret_regex='(AKIA[0-9A-Z]{16}|-----BEGIN (RSA|OPENSSH|EC|PGP) PRIVATE KEY-----|xox[baprs]-[A-Za-z0-9-]{10,}|ghp_[A-Za-z0-9]{36}|AIza[0-9A-Za-z\-_]{35}|mongodb(\+srv)?:\/\/[^[:space:]]+)'
if git diff --cached -- . ':(exclude)package-lock.json' | rg -n "${secret_regex}" >/dev/null; then
  echo "Blocked: possible secret detected in staged changes."
  echo "Review staged diff and remove secrets before commit."
  exit 1
fi

echo "Git sanitation checks passed."
