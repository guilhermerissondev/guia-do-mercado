# Validação com o tester de Maringá

O tester mora em Maringá-PR e valida cada etapa em uso real. Maringá não tem tratamento especial no código; aqui ela é apenas a referência de conferência.

## Como registrar

A cada checkpoint, preencher a seção da etapa: o que foi conferido, o resultado, a diferença encontrada e o que foi corrigido.

## Metas iniciais (a calibrar com dados reais)

- Erro mediano da estimativa por item de até 15% nos itens da cesta.
- Respostas do bot em menos de 1 s nas ações de lista.
- Zero item duplicado por reenvio do Telegram.

## Checkpoints

### M0. Geografia

- [x] Banco: Maringá (4115200) → Região Imediata de Maringá (410014) → Região Intermediária de Maringá → PR. Coberto por `supabase/tests/geo.test.sql`.
- [ ] Tester confirma que as regiões vizinhas fazem sentido (cidades da região imediata de Maringá que ele conhece).

### M1. Redes viáveis

- [x] Spike: Atacadão, Angeloni e Condor com preço para Maringá (CEP 87013-000 / loja Condor Av. Paraná). Ver `spike-m1.md`.
- [ ] Tester confere 4 preços do teste (arroz Tio João 5kg, café Pilão 500g, açúcar União 1kg, óleo Liza 900ml) em pelo menos uma dessas lojas físicas.
- [ ] Redes onde o tester realmente compra: ______

### M2. Catálogo e casamentos

- [x] Amostra real coletada no CEP 87013-000 (Atacadão, Angeloni, Condor loja Av. Paraná): 2.253 produtos, ~1.180 casados com o catálogo.
- [x] Tester revisou os 50 casamentos em `revisao-casamentos-m2.md`: **50 de 50 corretos** (2026-11-03).
- [ ] Tester confere se as faixas (econômico / típico / premium) de 10 itens que compra fazem sentido.

### M3. Preço base

- [x] Coleta real da região imediata de Maringá: Atacadão, Condor e Angeloni selecionados (76, 76 e 75 itens cobertos); 84 de 94 itens com estimativa.
- [x] Tester aprovou os preços de `validacao-m3.md` (2026-11-03).

| Item | Mercado | Preço base (típico) | Preço na gôndola | Diferença |
|---|---|---|---|---|
| | | | | |

### M4. Bot núcleo

- [x] Bot criado no @BotFather e rodando (@GuiaDoMercadoBot).
- [x] Cadastro: `/start`, digitar "maringa", escolher Maringá-PR.
- [ ] Lista real da semana mandada numa mensagem; anotar itens que o bot entendeu errado ou não achou.
- [ ] Escolha de faixas (econômico/típico/premium) em todos os itens; total estimado faz sentido?
- [ ] No mercado: `/mercado`, marcar itens, corrigir pelo menos 3 preços com ✏️; total final bate com o caixa?
- [x] Primeiros atritos anotados e resolvidos: pergunta item por item (virou lista numa mensagem só, D23), erro de digitação ("frando", virou "Você quis dizer…?", D24), falta de "adicionar item" e de desfazer remoção.
- [ ] Atritos de uma compra completa no mercado.

### M5. Ajuste do usuário

- [ ] Erro da estimativa antes e depois do fator em algumas compras.

### M6. Compartilhamento

- [x] Teste automático: duas pessoas na mesma lista (convite por link, edição, marcação, aviso ao dono, intruso barrado, link expira ao finalizar).
- [ ] Compra real com duas pessoas marcando ao mesmo tempo (quando o app estiver no ar).

### M7. Aceite para beta fechado

- [ ] Metas iniciais atingidas ou desvios justificados.
