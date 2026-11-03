# Arquitetura

O banco de dados (Postgres) é o contrato entre as partes. O coletor escreve preços, jobs SQL agregam, o bot só lê estatísticas prontas.

```
 Telegram ──webhook──▶ Edge Function (TS, grammY) ─┐
                                                    ├─▶ Postgres (Supabase, São Paulo)
 Coletor (Python, VPS BR) ──escreve preco_base─────┘        ▲
                                                            │ pg_cron: estat_base, fator_local
 Landing (GitHub Pages) ── link t.me/<bot>
```

## Stack

| Etapa | Escolha |
|---|---|
| Banco | Postgres (Supabase, região São Paulo): `percentile_cont`, `pg_trgm`, `pg_cron`, views materializadas |
| Coleta | Python, `httpx` para endpoints JSON, Playwright só como último recurso |
| Execução da coleta | VPS pequena no Brasil (Docker + cron/systemd) |
| Fila | Tabela Postgres (`FOR UPDATE SKIP LOCKED`) |
| Normalização | EAN, depois `pg_trgm`/`rapidfuzz`, depois LLM no resíduo com cache |
| Aprendizado | SQL agendado (`pg_cron`) |
| Bot | TypeScript + grammY em webhook, Supabase Edge Functions |
| Landing | GitHub Pages |
| Observabilidade | Sentry, tabela `coleta_execucao`, alertas no Telegram do admin |
| Testes | `vitest`, `pytest` com fixtures HTTP, testes SQL (`tools/test-db.sh`) |

## Geografia

Município (7 dígitos IBGE) → região imediata (510) → região intermediária (133) → UF (27) → Brasil. Carregada por `tools/gen_geo_seed.py` a partir da API de localidades do IBGE. A coleta usa um CEP de referência por região imediata, ativada sob demanda.

Implementada em `supabase/migrations/20261103000000_geo.sql`: tabelas normalizadas, visão `geo` desnormalizada e a função `buscar_municipio(texto)`.

## Preço

`estimativa = base(região imediata) × fator(categoria, localidade)`

- **Base:** P10/P50/P90 por item canônico e região imediata, calculados a partir de `preco_base`.
- **Fator:** `log(preço digitado / preço base mostrado)` por edição espontânea; item marcado sem edição conta como 1,0 com peso baixo (inicial 0,3). Suavização em direção ao nível acima: `fator = (n·média_local + k·fator_pai) / (n + k)`. Limites iniciais 0,75 a 1,25 e mínimo de 3 usuários distintos.

## Modelo de dados

Ver [`plano.md`](plano.md), seção "Modelo de dados". As tabelas de geografia já existem; as demais entram nas etapas M2 a M6.
