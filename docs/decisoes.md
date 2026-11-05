# Decisões

## Tomadas

| # | Decisão | Motivo |
|---|---|---|
| D1 | Telegram, não WhatsApp | Sem custo por mensagem nem burocracia de Meta Business; teclado inline editável permite checklist no chat |
| D2 | Escopo nacional, ancorado no IBGE | Evitar fontes e infraestrutura por estado |
| D3 | Maringá-PR é só ambiente de validação | O código não pode ter tratamento especial de cidade |
| D4 | Preço base da internet + ajuste espontâneo do usuário | Fonte uniforme nacional; ajuste vira correção leve por localidade |
| D5 | Sem foto de cupom | Decisão do dono do produto |
| D6 | Faixas econômico / típico / premium (P10/P50/P90) | O usuário modela a lista e o custo do seu jeito |
| D7 | TypeScript (bot, web) + Python (coleta, normalização), Postgres como contrato | Melhor ecossistema em cada parte; fronteira simples |
| D8 | Coletor por plataforma de e-commerce, não por estado | Mantém a manutenção baixa |
| D9 | Coleta por região imediata do IBGE (510 regiões confirmadas), ativada sob demanda | Escala com demanda, não com os 5.570 municípios |
| D10 | Super Muffato excluído da coleta | Termos proíbem explorar o conteúdo sem autorização |
| D11 | Cerca de 3 redes por região bastam | Boa média sem cobrir todos os mercados |
| D12 | Adaptadores por plataforma: VTEX (busca inteligente com `regionId`) e OSuper (GraphQL por loja) | Comprovado no spike M1; uma rede nova vira configuração |
| D13 | Atacadão como rede âncora nacional; Angeloni e Condor no piloto de Maringá | Preço regional comprovado nas três (ver `spike-m1.md`) |
| D14 | Carrefour Mercado, Assaí e Pão de Açúcar excluídos | Bloqueio anti-robô; não contornamos |
| D15 | Sempre 2 ou 3 redes por região; entre as disponíveis, escolher as que **cobrem mais itens do catálogo** naquela região (desempate: total de produtos com preço) | Maximiza o que entra no banco; medido pela cobertura do catálogo, não por número bruto de produtos |
| D17 | Faixas calculadas com **cada marca contando uma vez por rede** (mediana da marca na rede) | Na amostra real, 17 cafés gourmet de uma rede puxavam o típico do café 250 g para R$ 39,99 |
| D18 | Itens a granel exigem `comeca_com` e preço é convertido para R$/kg (caixas de atacado incluídas) | Na amostra real, "salgadinho sabor cebola" e "sopa de peito de frango" casavam com hortifrúti e carnes |
| D19 | `estimativa()` exige pelo menos 2 pontos marca × rede no nível; senão sobe na cascata | Evita faixa de um produto só |
| D20 | Bot roda como processo Node na VPS (long polling), não em Supabase Edge Functions | A VPS já é obrigatória para o coletor (IP brasileiro); um só lugar para implantar; dispensa URL pública e webhook; o código separa lógica, banco e entrada, então trocar para webhook depois é um arquivo |
| D21 | Coleta semanal: domingo às 12h (horário de Brasília); faixas usam janela de 15 dias | Decisão do dono do produto; a janela cobre uma coleta perdida |
| D22 | CEP de referência automático por região imediata: cidade-polo + ViaCEP, preferindo o Centro, validado pelo código IBGE | Ativar uma região vira só escolher a cidade; o bot ativa a região quando o usuário se cadastra |
| D23 | Montagem da lista numa mensagem só: cada item com botões E/T/P, típico marcado por padrão; sem perfil de preço salvo | Responder item por item cansa; perfil fixo distorceria a análise, porque os gastos mudam de mês para mês (dono do produto) |
| D24 | Erro de digitação: o bot pergunta "Você quis dizer …?" antes de montar a lista | Garante que a análise segue sem erro de item (dono do produto) |
| D25 | Mapa nacional de redes (`gm.ferramentas.mapear_redes`): candidatas em `catalogo/redes.toml`, resultado em `catalogo/mapa_redes.json`; só redes viáveis entram no seed | Rede nova é configuração; o mapa é refeito quando a lista de candidatas muda |
| D26 | Rede VTEX que devolve a mesma região para o estado inteiro "não regionaliza": só conta onde a simulação de frete mostra entrega ou retirada (no mapa e na coleta) | Sem isso, Hiperideal (Salvador) aparecia em 34 regiões da Bahia e Zaffari (Porto Alegre) em 95 |
| D27 | Rede só é agendada para regiões dos estados onde atua (`rede.ufs`); nas redes OSuper os estados vêm da lista de lojas | Evita milhares de tarefas inúteis por domingo |
| D28 | Na coleta, regiões com a mesma região VTEX reaproveitam a busca na mesma execução | Atacadão: 508 regiões, 58 regiões VTEX distintas |
| D29 | Erro 5xx do servidor da loja é "instável" (tenta de novo), não bloqueio; 401/403/429/503 e verificação anti-robô são bloqueio e nunca são contornados | Oba e Carone deram 500 temporário e são viáveis |
| D30 | Compartilhamento por link de convite (`t.me/GuiaDoMercadoBot?start=lista_<token>`): quem abre vira membro e edita a mesma lista; o link deixa de valer quando a lista é finalizada | Sem cadastro extra; o token longo e aleatório é a "senha" da lista |
| D31 | `/nova` de quem só participa de uma lista compartilhada apenas sai dela; só o dono fecha a lista | Evita que um participante encerre a compra dos outros |
| D32 | O coletor busca cada item duas vezes nas lojas VTEX: pelo nome do catálogo e por uma busca curta ("café 500g", derivada das regras ou definida em `busca`) | A busca exige quase todas as palavras; no Atacadão o nome completo achou 542 produtos válidos e a curta 704 (74 → 86 itens cobertos) |
| D33 | Item básico do catálogo exclui segmentos especiais (arbório, massa importada, café gourmet/especial, leite tipo A/A2, farinha 00, vegano, ração); eles não entram nem no premium | Nas regiões com uma rede só, essas variantes puxavam o típico: penne a R$ 10–15, arroz 1 kg a R$ 15–21 |
| D34 | No aprendizado (M5), cada usuário soma no máximo peso 3 por categoria na janela de 90 dias; quem passa disso tem os pesos reduzidos na mesma proporção | Sem o teto, uma lista com centenas de itens corrigidos de uma pessoa só dominava o fator da região |
| D35 | O bot conecta com o papel `gm_bot`: lê tudo e escreve só nas tabelas da conversa (usuário, listas, ajustes, fator, `regiao_coleta`); o coletor segue com o dono do banco | Uma falha futura no bot não alcança preços nem catálogo. Tabela nova que o bot escreva precisa de `grant` na migração |
| D36 | Limites do bot: 60 atualizações por minuto por usuário (em memória), 50 itens por mensagem, 200 por lista, quantidade até 99 e granel até 100 kg; a mensagem entra inteira ou não entra (transação); `telegram_update` guarda só 2 dias | Protege o banco de abuso e de erro de digitação sem atrapalhar o uso no mercado |
| D16 | Produto da rede guardado em `produto_rede` (com EAN opcional), não em uma tabela única por EAN | OSuper (Condor) não informa EAN |

## Pendentes

| # | Pendência | Quando |
|---|---|---|
| P1 | Termos de uso de Atacadão e Angeloni (leitura manual) | Antes da coleta contínua (M3) |
| P2 | Teste de IP brasileiro vs nuvem estrangeira | M3, ao montar a VPS |
| P3 | Criar o bot no @BotFather (nome, usuário, token): ver `criar-bot-telegram.md` | Agora (checkpoint M4) |
| P4 | Projeto Supabase criado | Antes de aplicar migrações em produção |
| P5 | VPS no Brasil | A partir da M3 |
| P6 | Consulta jurídica sobre coleta em sites de terceiros | Antes de abrir ao público |
| ~~P8~~ | ~~Granel na VTEX~~: resolvido na M3, `Price` já é por kg (simulação de carrinho) | ✓ |
| P9 | Passo de LLM para casamentos ambíguos (hoje zero na amostra; entra quando aparecer volume) | M3 ou depois |
| ~~P10~~ | ~~CEP de referência automático~~: resolvido (D22) | ✓ |
| P11 | Alertas de coleta (falha, região sem preço novo) no Telegram do admin | Com o bot (M4) |
| ~~P12~~ | ~~Regiões sem CEP~~: 508 de 510 com CEP (fonte alternativa OpenStreetMap + BrasilAPI). Faltam Vacaria-RS e Porangatu-GO, que usam o nível estado | ✓ |
| P13 | 441 regiões só com o Atacadão (meta: 2 a 3 redes). Redes grandes do N/NE e de MG usam plataformas próprias (ver `mapa-redes.md`); Instabuy é a única candidata a terceiro adaptador | Decisão do dono do produto |
| P14 | Adaptador VTEX FastStore (lojas headless em Next.js, APIs não expostas no domínio), ex.: Amigão (região de Maringá) | Quando houver várias redes assim no mapa |
| ~~P15~~ | ~~Testes de integração no banco de desenvolvimento~~: agora `tools/test-integracao.sh` usa um banco descartável | ✓ |
| P16 | Exigir 3 marcas (em vez de 2) no nível da região imediata; com 2–3 produtos de uma rede, o típico ainda oscila (ex.: penne a R$ 11 numa região do ES só com o Carone) | Depois da coleta nacional completa |
| P7 | Calibração dos parâmetros de aprendizado (peso 0,3, `k`, limites 0,75 a 1,25) | M5, com dados reais |
