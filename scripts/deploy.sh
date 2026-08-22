#!/usr/bin/env bash
# Deploy / redeploy the production stack on THIS machine.
#   ./scripts/deploy.sh              rebuild images and start everything
#   ./scripts/deploy.sh --skip-build recreate containers without rebuilding
set -euo pipefail
cd "$(dirname "$0")/.."

ENV_FILE="${ENV_FILE:-.env}"
SKIP_BUILD=false
if [[ "${1:-}" == "--skip-build" ]]; then
  SKIP_BUILD=true
elif [[ -n "${1:-}" ]]; then
  echo "usage: $0 [--skip-build]" >&2
  exit 1
fi

fail() { echo "error: $*" >&2; exit 1; }
warn() { echo "warning: $*" >&2; }

[[ -f "$ENV_FILE" ]] || fail "$ENV_FILE not found at repo root"

env_value() { grep -E "^$1=" "$ENV_FILE" | tail -n1 | cut -d= -f2- || true; }

secret="$(env_value JWT_SECRET)"
[[ -n "$secret" && ${#secret} -ge 32 ]] || \
  fail "JWT_SECRET must be set to at least 32 characters in $ENV_FILE (the server refuses to boot otherwise)"

client_url="$(env_value CLIENT_URL)"
[[ -n "$client_url" ]] || warn "CLIENT_URL is empty, the server will default to https://fihspot.com"

revision="$(git rev-parse --short HEAD 2>/dev/null || echo 'unknown revision')"
echo "==> deploying revision $revision"

if $SKIP_BUILD; then
  echo "==> skipping image build (--skip-build)"
else
  echo "==> building images"
  docker compose build --pull
fi

echo "==> starting services"
docker compose up -d

echo "==> waiting for API health (migrations run first)"
health_ok=false
for _ in $(seq 1 60); do
  if docker compose exec -T server wget -qO- http://localhost:3000/api/health 2>/dev/null | grep -q '"ok"'; then
    health_ok=true
    break
  fi
  sleep 2
done

if ! $health_ok; then
  echo "error: API did not become healthy within 120s — last server logs:" >&2
  docker compose logs --tail 30 server >&2
  exit 1
fi

docker image prune -f >/dev/null
echo "==> deployed $revision successfully"
