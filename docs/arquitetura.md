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

## Preço base e coleta (M3)

- **Região ativa** (`regiao_coleta`): região imediata + CEP de referência. Ativar é um comando; nada no código cita cidade.
- **Redes por região** (`rede_regiao`): cada coleta também avalia a rede (atende? quantos itens do catálogo cobre?). `selecionar_redes()` marca até 3 redes com maior cobertura (D15). Só as selecionadas entram nas faixas.
- **Lojas OSuper** (`rede_loja`): lista de lojas da rede com cidade/UF, mapeada para o município do IBGE. A região usa a loja de um município dela.
- **Fila** (`coleta_tarefa`): uma tarefa por rede × região; `pegar_tarefa()` com `SKIP LOCKED`; até 3 tentativas com espera crescente. A tabela também é o registro de execução.
- **Agendamento** (`agendar_coletas()`): redes selecionadas a cada 7 dias; não selecionadas reavaliadas a cada 30.
- **Observações** (`preco_obs`, só cresce) e **faixas** (`estat_preco`) recalculadas por `recalcular_estat_preco()` nos níveis imediata, intermediária, UF e Brasil. Regra igual à do Python: último preço por produto na janela de 30 dias, descarte fora de [mediana/5, mediana×5], cada marca uma vez por rede, P10/P50/P90.
- **Estimativa** (`estimativa(item, município)`): primeiro nível com pelo menos 2 pontos marca × rede. Sem nenhum, não devolve linha e o bot pergunta o valor.
- **Granel na VTEX:** `Price` já é por kg (confirmado por simulação de carrinho: 0,2 kg de tomate a R$ 20,49/kg custa R$ 4,09).

### Operação

```bash
tools/dev-db.sh                                   # Postgres local com migrações e seeds
export DATABASE_URL=postgresql://postgres:dev@localhost:54329/postgres GM_CONTACT=voce@exemplo.com
cd collector
python -m gm.coleta ativar --municipio 4115200 --cep 87013000
python -m gm.coleta lojas        # lojas das redes OSuper
python -m gm.coleta agendar      # cria tarefas vencidas
python -m gm.coleta rodar        # executa a fila e recalcula faixas
python -m gm.coleta recasar      # reaplica regras novas do catálogo ao que já foi coletado
python -m gm.ferramentas.relatorio_m3 --municipio 4115200
```

Em produção, `agendar` + `rodar` rodam por cron diário na VPS brasileira (P5). Uma região com 3 redes leva cerca de 13 minutos.

## Modelo de dados

Ver [`plano.md`](plano.md), seção "Modelo de dados", com estes ajustes da M2:
- `produto_rede(rede_id, codigo, nome, marca, ean?, item_canonico_id, casamento_*)` no lugar de `produto(ean, …)`, porque o Condor (OSuper) não informa EAN.
- `ean_item` guarda EANs confirmados, válidos para todas as redes.
- `rede(id, nome, plataforma, config)`: rede nova é configuração.

Migrações: `20261103000000_geo.sql` (geografia), `20261103010000_catalogo.sql` (catálogo, redes, produtos, revisão) e `20261103020000_precos.sql` (regiões, redes por região, lojas, fila, observações, faixas e estimativa).
