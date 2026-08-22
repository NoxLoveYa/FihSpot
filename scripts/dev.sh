#!/usr/bin/env bash
# Dev launcher: sanity-checks the environment, then starts server + client.
set -euo pipefail
cd "$(dirname "$0")/.."

ENV_FILE="${ENV_FILE:-.env}"

warn() { echo "warning: $*" >&2; }

if [[ ! -f "$ENV_FILE" ]]; then
  warn "no $ENV_FILE found — copy .env.example and fill in your values"
fi

secret="$(grep -E '^JWT_SECRET=' "$ENV_FILE" 2>/dev/null | tail -n1 | cut -d= -f2- || true)"
if [[ -z "$secret" ]]; then
  warn "JWT_SECRET is not set — the dev fallback secret will be used"
elif [[ ${#secret} -lt 32 ]]; then
  warn "JWT_SECRET is shorter than 32 characters — dev tolerates it, production will refuse to boot"
fi

exec npm run dev
