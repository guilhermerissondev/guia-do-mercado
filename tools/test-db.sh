#!/usr/bin/env bash
# Aplica migrações, seeds e testes SQL num Postgres descartável (Docker).
# Uso: tools/test-db.sh
set -euo pipefail
cd "$(dirname "$0")/.."

NAME=gm-pg-test
docker rm -f "$NAME" >/dev/null 2>&1 || true
docker run -d --name "$NAME" -e POSTGRES_PASSWORD=pw postgres:16 >/dev/null
trap 'docker rm -f "$NAME" >/dev/null 2>&1 || true' EXIT

for _ in $(seq 1 60); do
  docker exec "$NAME" pg_isready -U postgres >/dev/null 2>&1 && break
  sleep 1
done
sleep 2

run() { docker exec -i "$NAME" psql -U postgres -v ON_ERROR_STOP=1 -q < "$1"; }

for f in supabase/migrations/*.sql supabase/seed/*.sql supabase/tests/*.sql; do
  echo "== $f"
  run "$f"
done
echo "OK"
