# Guia do Mercado

Bot de Telegram para montar a lista de compras, estimar o valor por faixa de preço (econômico / típico / premium), compartilhar a lista e marcar os itens no mercado com o total atualizado em tempo real.

Escopo nacional, ancorado na geografia do IBGE. Maringá-PR é o ambiente de validação, não um caso especial no código.

## Documentação

- [`docs/plano.md`](docs/plano.md): plano aprovado (escopo, etapas, riscos, verificação)
- [`docs/requisitos.md`](docs/requisitos.md): requisitos funcionais e não funcionais
- [`docs/arquitetura.md`](docs/arquitetura.md): arquitetura, stack e modelo de dados
- [`docs/decisoes.md`](docs/decisoes.md): decisões e pendências
- [`docs/validacao-maringa.md`](docs/validacao-maringa.md): protocolo de validação com o tester de Maringá
- [`docs/criar-bot-telegram.md`](docs/criar-bot-telegram.md): criar o bot no @BotFather e rodar o piloto

## Estrutura

```
supabase/migrations/   esquema versionado
supabase/seed/         dados iniciais (geografia do IBGE gerada por tools/gen_geo_seed.py)
supabase/tests/        testes SQL
bot/                   bot do Telegram (TypeScript, grammY)
collector/             catálogo, casamento e coleta de preços (Python)
deploy/                cron da coleta semanal e serviço do bot para a VPS
apps/landing/          landing page (GitHub Pages), a partir da M7
tools/                 scripts de apoio
```

## Testes

Requer Docker.

```bash
tools/test-db.sh                       # Postgres descartável: migrações, seeds e testes SQL
tools/dev-db.sh                        # Postgres de desenvolvimento persistente (porta 54329), com os preços reais
tools/test-integracao.sh               # coletor e bot contra um Postgres descartável (nunca o de desenvolvimento)
```

Para criar e rodar o bot: [`docs/criar-bot-telegram.md`](docs/criar-bot-telegram.md).

Para regerar a geografia a partir do IBGE: `python3 -I tools/gen_geo_seed.py`.
