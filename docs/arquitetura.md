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

## Catálogo e casamento (M2)

- **Catálogo canônico** em `collector/catalogo/itens.toml`: itens genéricos com tamanho fixo ("Leite integral 1 L"), regras `termos` / `algum` / `excluir` e `conteudo` ou `granel`. É a fonte; o seed SQL é gerado dele.
- **Casamento** (`collector/gm/casamento.py`): EAN já conhecido → regras do catálogo (termos, exclusões, tamanho, pacote múltiplo) → desempate por similaridade (`rapidfuzz`). Ambíguo vai para `revisao_casamento`; o passo de LLM entra nesse ponto.
- **Adaptadores** (`collector/gm/fontes/`): `vtex.py` (região por CEP + busca inteligente) e `osuper.py` (sitemap + GraphQL por loja), com um cliente HTTP comum que identifica o robô e espaça as requisições.
- **Amostra de validação** (`collector/gm/ferramentas/amostra.py`): coleta real num CEP, grava fixture e gera `docs/revisao-casamentos-m2.md` (cobertura por rede, faixas por item, suspeitos, 50 casamentos para revisão).

## Modelo de dados

Ver [`plano.md`](plano.md), seção "Modelo de dados", com estes ajustes da M2:
- `produto_rede(rede_id, codigo, nome, marca, ean?, item_canonico_id, casamento_*)` no lugar de `produto(ean, …)`, porque o Condor (OSuper) não informa EAN.
- `ean_item` guarda EANs confirmados, válidos para todas as redes.
- `rede(id, nome, plataforma, config)`: rede nova é configuração.

Migrações: `20261103000000_geo.sql` (geografia) e `20261103010000_catalogo.sql` (catálogo, redes, produtos, revisão).
