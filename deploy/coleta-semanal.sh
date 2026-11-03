#!/usr/bin/env bash
# Coleta semanal de preços. Agendada pelo cron do domingo 12h (ver deploy/crontab).
# Requer no ambiente: DATABASE_URL e GM_CONTACT (arquivo /etc/guia-do-mercado/coleta.env).
set -euo pipefail
cd "$(dirname "$0")/../collector"

PY=.venv/bin/python
"$PY" -m gm.coleta lojas
"$PY" -m gm.coleta agendar
"$PY" -m gm.coleta rodar
