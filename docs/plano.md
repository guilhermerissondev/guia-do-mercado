# Guia do Mercado: plano de desenvolvimento

## Contexto

Quem faz compra de mercado perde tempo montando a lista (notas do iPhone, WhatsApp), não sabe quanto vai gastar e, no corredor, soma item a item de cabeça. O produto é um **bot de Telegram** que organiza a lista, estima o valor da compra por faixa de preço, permite compartilhar a lista e marcar os itens com check conforme são pegos, atualizando o total quando o preço do mercado difere do estimado.

Decisões já tomadas na discussão:
- Canal: **Telegram** (WhatsApp descartado: custo por mensagem, sem checkbox, burocracia Meta).
- Escopo: **Brasil inteiro desde o início**, ancorado na geografia do IBGE. **Maringá-PR é só o ambiente de validação** (o usuário mora lá e é o primeiro tester). Nada no código é específico de Maringá.
- Preço: **(A) preço base coletado da internet** por um método único nacional, mais **(B) ajuste espontâneo do usuário**, que gera uma correção leve por categoria e localidade. Sem foto de cupom. Sem dependência de fontes estaduais (Menor Preço PR, etc.); essas só servem como conferência.
- Faixa de preço: o usuário vê **econômico / típico / premium** (P10/P50/P90), escolhe um ou digita o valor, e modela a lista do seu jeito.
- Stack: **TypeScript + Python**, Postgres (Supabase) como contrato entre as partes.

Resultado esperado: um produto lançável, com estimativas explicáveis, infraestrutura leve e qualidade validada em uso real em Maringá antes de abrir ao público.

## Escopo

**Dentro (MVP):**
1. Cadastro de cidade (código IBGE) no primeiro uso.
2. Criar lista por texto livre ("2 leite, arroz 5kg, café").
3. Cada item mapeado a um item canônico, com as 3 faixas de preço; usuário escolhe ou digita o valor.
4. Total estimado da lista; estimativa vem de `base(região) × fator(categoria, localidade)`.
5. Modo mercado: marcar item (✅), editar preço (opcional), total real e quanto falta, tudo na mesma mensagem do Telegram.
6. Compartilhar a lista com outra pessoa (convite por link).
7. Coletor nacional de preços base por região imediata do IBGE.
8. Aprendizado: fator de correção por categoria e localidade a partir das edições espontâneas.
9. Landing page no GitHub Pages com botão para abrir o bot, mais política de privacidade.

**Fora do MVP (registrado, não construído agora):** Mini App, histórico de compras, listas recorrentes, leitura de código de barras, áudio, lembretes ativos, monetização.

**Fora definitivamente:** WhatsApp, foto de cupom, coletores por estado, qualquer fonte que exija um adaptador por UF.

## Arquitetura

```
 Telegram ──webhook──▶ Edge Function (TS, grammY) ─┐
                                                    ├─▶ Postgres (Supabase, São Paulo)
 Coletor (Python, VPS BR) ──escreve preco_base─────┘        ▲
                                                            │ pg_cron: estat_base, fator_local
 Landing (GitHub Pages) ── link t.me/<bot>                   │
```

Regras:
- O banco é o contrato: coletor escreve, `pg_cron` agrega em SQL, o bot só lê estatísticas prontas.
- Fila de jobs de coleta como tabela Postgres (`FOR UPDATE SKIP LOCKED`). Sem Redis/Kafka.
- Normalização: EAN → `pg_trgm`/`rapidfuzz` → LLM (Claude Haiku 5.5) só no resíduo, com cache de mapeamento.
- Interpretação de texto da lista: regex primeiro, LLM só se ambíguo.

### Geografia (nacional)
Tabela `geo` carregada uma vez a partir do IBGE: município (7 dígitos) → região imediata → região intermediária → UF → Brasil. Coleta por **um CEP de referência por região imediata**, ativada sob demanda (quando surge usuário na região). Município sem coleta herda a região.

### Modelo de dados

```
geo(municipio_ibge, regiao_imediata, regiao_intermediaria, uf)
regiao_coleta(regiao_imediata, cep_referencia, ativa)
categoria(id, nome)
item_canonico(id, nome, unidade, categoria_id)
produto(ean, nome, marca, tamanho, item_canonico_id)
mapeamento_descricao(texto_normalizado, item_canonico_id, origem)
preco_base(produto_ean, rede, regiao_imediata, preco, coletado_em)
estat_base(item_id, regiao_imediata, p10, p50, p90, n_obs, atualizado_em)
usuario(telegram_id, municipio_ibge)
lista(id, dono_id, nome, token_compartilhamento) / lista_membro / lista_item
   (item_id, perfil, preco_estimado, preco_real, marcado, quantidade)
ajuste_usuario(usuario_id, item_id, perfil, municipio_ibge, preco_base, preco_usuario, log_razao, data)
fator_local(categoria_id, nivel, codigo_geo, fator, n_usuarios, atualizado_em)
coleta_execucao(regiao, rede, inicio, fim, status, n_precos)   -- observabilidade
```

### Aprendizado do ajuste
- Sinal: `log(preço_digitado / preço_base_mostrado)`, só em edições espontâneas; item marcado sem edição conta como razão 1,0 com peso baixo (inicial 0,3, calibrar) para não enviesar.
- Fator por categoria e localidade, suavizado em direção ao nível acima: `fator = (n·média_local + k·fator_pai) / (n + k)`, cascata município → imediata → intermediária → UF → Brasil (=1,0).
- Limites: fator entre 0,75 e 1,25 (inicial), descarte de razões absurdas, mínimo de 3 usuários distintos para o fator valer.
- Calculado em SQL por `pg_cron`; sem ML no MVP.

### Estrutura do repositório

```
guia-do-mercado/
  docs/                 requisitos.md, arquitetura.md, validacao-maringa.md, decisoes.md
  supabase/
    migrations/         esquema versionado
    seed/               carga IBGE, categorias, catálogo canônico inicial
    functions/telegram-webhook/   bot (TS, grammY)
  collector/            Python: adapters/, normalize/, jobs/, tests/fixtures/
  apps/landing/         GitHub Pages
  .github/workflows/    CI (lint, testes, migrações)
```

## Etapas

Cada etapa termina com um **checkpoint de Maringá**: o tester valida o que foi construído antes de avançar.

### M0. Fundação
- Estrutura do repo, CI (GitHub Actions), `docs/` inicial, convenções.
- Projeto Supabase (região São Paulo), migrações base, carga do IBGE.
- **Checkpoint Maringá:** consulta ao banco mostra Maringá → Região Imediata de Maringá → Intermediária → PR corretamente.

### M1. Spike de viabilidade da coleta (porta de decisão)
- Inspecionar lojas online de supermercados que atendem Maringá e as grandes redes nacionais: expõem preço por CEP sem login? Que plataforma usam? Quais termos de uso?
- Testar IP brasileiro (VPS) vs nuvem estrangeira.
- Entregável: `docs/decisoes.md` com redes e plataformas viáveis, riscos, custo.
- **Porta:** se não houver base viável e legalmente aceitável, parar e reavaliar (alternativas: parceria/afiliados, semeador autorizado) antes de construir o resto.
- **Checkpoint Maringá:** confirmar que as redes viáveis são as em que o tester realmente compra.

### M2. Catálogo canônico e normalização
- 150 a 300 itens canônicos (cesta básica e itens de uso comum) com categorias, unidades e EANs de referência.
- Pipeline de casamento produto → item canônico (EAN, fuzzy, LLM no resíduo, com cache) e conversão para preço por unidade.
- **Checkpoint Maringá:** revisar amostra de 50 casamentos ("isso é mesmo leite integral 1L?").

### M3. Coletor e preço base
- Adaptador por plataforma (não por estado), fila em Postgres, execução na VPS brasileira, alertas de falha no Telegram do admin.
- Testes com fixtures de respostas HTTP salvas.
- `estat_base` (P10/P50/P90 por item e região) via SQL, com filtro de outliers e janela móvel.
- **Checkpoint Maringá:** conferir na gôndola os preços base de 20 itens em 2 mercados e registrar a diferença em `docs/validacao-maringa.md`.

### M4. Bot núcleo
- Cadastro de cidade, criação de lista por texto, mapeamento a itens canônicos, tela de 3 faixas com escolha ou valor próprio, total estimado.
- Modo mercado: check, edição opcional de preço, total real e quanto falta; edição da mesma mensagem; deduplicação por `update_id`; atualização por campo (sem sobrescrever a lista inteira).
- **Checkpoint Maringá:** uma compra real feita com o bot; o tester anota atritos e erros de interpretação.

### M5. Ajuste do usuário e fatores locais
- Gravação de `ajuste_usuario`, cálculo de `fator_local` com suavização e limites, uso na estimativa, origem visível na mensagem ("região de Maringá, atualizada há 2 dias").
- **Checkpoint Maringá:** comparar erro da estimativa antes e depois do fator em algumas compras.

### M6. Compartilhamento
- Convite por link, membros da lista, edição concorrente segura.
- **Checkpoint Maringá:** compra com duas pessoas (tester e outra) marcando ao mesmo tempo.

### M7. Landing, privacidade e lançamento
- Landing no GitHub Pages com botão `t.me/<bot>`, política de privacidade (LGPD: telefone não é coletado; só `telegram_id`, cidade e listas; exclusão de dados sob comando).
- Observabilidade (Sentry, `coleta_execucao`, alertas de frescor por região), limites de uso, revisão final de segurança (token de lista longo e aleatório, validação do webhook).
- Beta fechado com poucas pessoas de Maringá e de pelo menos uma outra região para exercitar o caminho "sem Maringá".
- **Checkpoint Maringá:** critérios de aceite abaixo.

## Validação com o tester de Maringá

- Protocolo em `docs/validacao-maringa.md`: a cada checkpoint, o tester registra o que conferiu, a diferença encontrada e o que foi corrigido.
- Metas iniciais (propostas, a calibrar com dados reais): erro mediano da estimativa por item de até 15% nos itens da cesta; resposta do bot em menos de 1 s nas ações de lista; zero item duplicado por reenvio do Telegram.
- Teste do caminho "sem dado": numa cidade sem coleta ativa, o bot sobe para a região, depois para o estado, e, sem nada, pergunta o valor ao usuário.

## Qualidade e testes

- TypeScript: `vitest` (parser de lista, cálculo de totais, deduplicação); Python: `pytest` com fixtures HTTP; SQL: testes das funções de percentil e de fator com dados sintéticos.
- CI roda lint, testes e aplica migrações em banco de teste.
- Dado velho nunca é apresentado como atual; origem e idade sempre visíveis.

## Riscos

| Risco | Mitigação |
|---|---|
| Termos de uso e bloqueio nos sites das redes | Spike M1 com porta de decisão; ritmo baixo, identificação do robô, sem burlar bloqueios; consulta jurídica antes de abrir ao público |
| Coleta quebra com mudança de layout | Adaptador por plataforma, fixtures, alertas de frescor |
| Preço online ≠ gôndola | Fator por categoria e localidade (camada B) e validação em Maringá |
| Região sem dado | Cascata até o Brasil e, no fim, pergunta ao usuário |
| Manipulação/viés do ajuste | Limites de fator, mínimo de 3 usuários, peso baixo para "sem edição" |
| Lock-in do Supabase | Postgres padrão, tudo em migrações versionadas |

## O que preciso do usuário durante a execução

- Criar o bot no @BotFather e fornecer o token (guardado como segredo, nunca no repositório).
- Criar o projeto Supabase (ou autorizar que eu oriente a criação).
- VPS no Brasil para o coletor (necessária a partir da M3; antes disso o spike usa sua máquina).
- Validar cada checkpoint de Maringá, e as redes onde costuma comprar.

## Verificação ponta a ponta

1. `supabase db reset` aplica todas as migrações e a carga do IBGE; teste de hierarquia de Maringá passa.
2. Coletor roda contra uma região de teste e grava `preco_base`; `estat_base` calculado e coerente com a amostra.
3. No Telegram: criar lista com "2 leite, arroz 5kg, café" → ver 3 faixas → escolher → ver total → no modo mercado marcar itens e editar um preço → total real atualizado na mesma mensagem.
4. Enviar o mesmo update duas vezes: nada duplica.
5. Cidade sem coleta: estimativa vem do nível acima, com origem indicada.
6. Fator local: com ajustes sintéticos de ≥3 usuários, o fator aparece e respeita os limites.
7. Checklist de aceite em Maringá (`docs/validacao-maringa.md`) completo antes do beta fechado.

## Primeiras ações após aprovação

M0 (estrutura, docs, CI, migrações e carga IBGE) e M1 (spike de viabilidade da coleta), nesta ordem. Nada além disso é construído antes da porta de decisão da M1.
