#!/usr/bin/env bash
# Coleta semanal de preços. Agendada pelo cron do domingo 12h (ver deploy/crontab).
# Requer no ambiente: DATABASE_URL e GM_CONTACT (arquivo /etc/guia-do-mercado/coleta.env).
# Um worker por rede, em paralelo: cada site recebe no máximo uma requisição por segundo.
set -euo pipefail
cd "$(dirname "$0")/../collector"

PY=.venv/bin/python
"$PY" -m gm.coleta lojas
"$PY" -m gm.coleta agendar
# O worker sai quando não há tarefa vencida; tarefa que falhou volta 1 h (depois 2 h) mais tarde.
# Por isso, depois de cada passada, espera as novas tentativas e roda de novo (até 3 passadas).
for passada in 1 2 3; do
  redes=$(psql "$DATABASE_URL" -tAc "select distinct rede_id from coleta_tarefa
                                      where status = 'pendente' and agendada_para < now() + interval '3 hours'")
  [ -z "$redes" ] && break
  espera=$(psql "$DATABASE_URL" -tAc "select greatest(0, ceil(extract(epoch from min(agendada_para) - now())))::int
                                       from coleta_tarefa where status = 'pendente'")
  sleep "$espera"
  for rede in $redes; do
    "$PY" -m gm.coleta rodar --rede "$rede" &
  done
  wait
done
"$PY" -m gm.coleta recalcular
