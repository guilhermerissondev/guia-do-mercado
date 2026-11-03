# Guia do Mercado

Bot de Telegram para montar a lista de compras, estimar o valor por faixa de preço (econômico / típico / premium), compartilhar a lista e marcar os itens no mercado com o total atualizado em tempo real.

Escopo nacional, ancorado na geografia do IBGE. Maringá-PR é o ambiente de validação, não um caso especial no código.

## Documentação

- [`docs/plano.md`](docs/plano.md): plano aprovado (escopo, etapas, riscos, verificação)
- [`docs/requisitos.md`](docs/requisitos.md): requisitos funcionais e não funcionais
- [`docs/arquitetura.md`](docs/arquitetura.md): arquitetura, stack e modelo de dados
- [`docs/decisoes.md`](docs/decisoes.md): decisões e pendências
- [`docs/validacao-maringa.md`](docs/validacao-maringa.md): protocolo de validação com o tester de Maringá

## Estrutura

```
supabase/migrations/   esquema versionado
supabase/seed/         dados iniciais (geografia do IBGE gerada por tools/gen_geo_seed.py)
supabase/tests/        testes SQL
supabase/functions/    bot do Telegram (TypeScript), a partir da M4
collector/             coletor de preços (Python), a partir da M3
apps/landing/          landing page (GitHub Pages), a partir da M7
tools/                 scripts de apoio
```

## Testes

Requer Docker.

```bash
tools/test-db.sh   # sobe um Postgres descartável, aplica migrações e seeds, roda os testes SQL
```

Para regerar a geografia a partir do IBGE: `python3 -I tools/gen_geo_seed.py`.
