#!/usr/bin/env bash
# Postgres de desenvolvimento persistente (Docker), com migrações e seeds aplicados.
# Uso: tools/dev-db.sh [--reset]
#   DATABASE_URL=postgresql://postgres:dev@localhost:54329/postgres
# A porta só escuta em 127.0.0.1: o banco tem os preços reais e os dados de quem testa o bot.
set -euo pipefail
cd "$(dirname "$0")/.."

NAME=gm-pg-dev
if [[ "${1:-}" == "--reset" ]]; then
  docker rm -f "$NAME" >/dev/null 2>&1 || true
  docker volume rm gm-pg-dev >/dev/null 2>&1 || true   # sem isso os dados antigos voltam
fi
if ! docker ps -a --format '{{.Names}}' | grep -qx "$NAME"; then
  docker run -d --name "$NAME" -e POSTGRES_PASSWORD=dev -p 127.0.0.1:54329:5432 -v gm-pg-dev:/var/lib/postgresql/data postgres:16 >/dev/null
  for _ in $(seq 1 60); do docker exec "$NAME" pg_isready -U postgres >/dev/null 2>&1 && break; sleep 1; done
  sleep 2
fi
docker start "$NAME" >/dev/null
# Container religado (ex.: depois de reiniciar a máquina): espera o Postgres aceitar conexões
for _ in $(seq 1 60); do docker exec "$NAME" pg_isready -U postgres >/dev/null 2>&1 && break; sleep 1; done
sleep 1

if [[ "$(docker exec "$NAME" psql -U postgres -tAc "select to_regclass('public.municipio') is not null")" != "t" ]]; then
  for f in supabase/migrations/*.sql supabase/seed/*.sql; do
    echo "== $f"
    docker exec -i "$NAME" psql -U postgres -v ON_ERROR_STOP=1 -q < "$f"
  done
fi
echo "DATABASE_URL=postgresql://postgres:dev@localhost:54329/postgres"
