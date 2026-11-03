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
| P12 | 68 regiões imediatas sem CEP de referência (parte do RS e todo MS, MT, GO e DF): o ViaCEP bloqueou o IP no fim da geração. Rodar `tools/gen_cep_regioes.py` de novo (incremental). Até lá, essas regiões usam preços do estado/Brasil | Antes de abrir para essas regiões |
| P7 | Calibração dos parâmetros de aprendizado (peso 0,3, `k`, limites 0,75 a 1,25) | M5, com dados reais |
