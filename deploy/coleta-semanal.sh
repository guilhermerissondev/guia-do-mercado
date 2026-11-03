#!/usr/bin/env bash
# Coleta semanal de preços. Agendada pelo cron do domingo 12h (ver deploy/crontab).
# Requer no ambiente: DATABASE_URL e GM_CONTACT (arquivo /etc/guia-do-mercado/coleta.env).
# Um worker por rede, em paralelo: cada site recebe no máximo uma requisição por segundo.
set -euo pipefail
cd "$(dirname "$0")/../collector"

PY=.venv/bin/python
"$PY" -m gm.coleta lojas
"$PY" -m gm.coleta agendar
for rede in $(psql "$DATABASE_URL" -tAc "select distinct rede_id from coleta_tarefa where status = 'pendente'"); do
  "$PY" -m gm.coleta rodar --rede "$rede" &
done
wait
"$PY" -m gm.coleta recalcular
