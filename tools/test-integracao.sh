#!/usr/bin/env bash
# Testes de integração (coletor e bot) num Postgres descartável, nunca no banco de desenvolvimento:
# os testes criam e apagam dados (redes, faixas, usuários) e não podem tocar em preços reais.
# Uso: tools/test-integracao.sh
set -euo pipefail
cd "$(dirname "$0")/.."

NAME=gm-pg-integracao
PORTA=54330
docker rm -f "$NAME" >/dev/null 2>&1 || true
docker run -d --name "$NAME" -e POSTGRES_PASSWORD=pw -p "$PORTA:5432" postgres:16 >/dev/null
trap 'docker rm -f "$NAME" >/dev/null 2>&1 || true' EXIT
for _ in $(seq 1 60); do docker exec "$NAME" pg_isready -U postgres >/dev/null 2>&1 && break; sleep 1; done
sleep 2
for f in supabase/migrations/*.sql supabase/seed/*.sql; do
  docker exec -i "$NAME" psql -U postgres -v ON_ERROR_STOP=1 -q < "$f" >/dev/null
done

export DATABASE_URL="postgresql://postgres:pw@localhost:$PORTA/postgres"
echo "== coletor"; (cd collector && .venv/bin/pytest -q)
echo "== bot"; (cd bot && npx vitest run)
echo "OK"
