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

- [ ] Revisão de 50 casamentos produto → item canônico.

### M3. Preço base

- [ ] 20 itens × 2 mercados: preço base vs gôndola, diferença registrada.

| Item | Mercado | Preço base (típico) | Preço na gôndola | Diferença |
|---|---|---|---|---|
| | | | | |

### M4. Bot núcleo

- [ ] Uma compra real feita com o bot; atritos e erros de interpretação anotados.

### M5. Ajuste do usuário

- [ ] Erro da estimativa antes e depois do fator em algumas compras.

### M6. Compartilhamento

- [ ] Compra com duas pessoas marcando ao mesmo tempo.

### M7. Aceite para beta fechado

- [ ] Metas iniciais atingidas ou desvios justificados.
