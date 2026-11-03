# Revisão de casamentos (checkpoint M2)

Gerado por `collector/gm/ferramentas/amostra.py` a partir de `collector/tests/fixtures/amostra_maringa.json` (CEP 87013000). Não editar à mão; regerar com `relatorio`.

## Cobertura por rede

Critério de escolha de rede (decisão D15): a que cobre mais itens do catálogo na região.

| Rede | Produtos com preço | Casados com o catálogo | Itens do catálogo cobertos |
|---|---|---|---|
| angeloni | 922 | 435 | 75 de 94 |
| atacadao | 1116 | 585 | 76 de 94 |
| condor | 190 | 158 | 68 de 94 |

## Faixas por item

P10 / P50 / P90 com **cada marca contando uma vez por rede** (`collector/gm/estatistica.py`). Itens a granel em R$/kg; caixas de atacado (ex.: 19 kg) convertidas para kg. As colunas das redes mostram quantos produtos casaram e o intervalo de preço.

| Item | angeloni | atacadao | condor | Econômico (P10) | Típico (P50) | Premium (P90) |
|---|---|---|---|---|---|---|
| Arroz branco tipo 1 5 kg | 2: 19,39–19,89 | 20: 17,90–29,99 | 3: 19,57–24,99 | 19,44 | 22,70 | 28,60 |
| Arroz branco tipo 1 1 kg | 2: 3,89–3,99 | 1: 4,98 | – | 3,91 | 3,99 | 4,78 |
| Arroz parboilizado 5 kg | 4: 18,89–29,89 | 2: 18,29–23,99 | 2: 17,99–22,80 | 18,20 | 19,17 | 25,76 |
| Feijão carioca 1 kg | 2: 8,99–10,99 | 17: 3,99–11,99 | 2: 8,65–9,25 | 7,49 | 8,65 | 10,99 |
| Feijão preto 1 kg | 2: 5,39–8,19 | 11: 5,69–11,49 | 3: 7,16–7,50 | 5,84 | 7,27 | 9,79 |
| Lentilha 500 g | – | 1: 9,39 | 2: 11,49–16,98 | 9,81 | 11,49 | 15,88 |
| Aveia em flocos 500 g | – | 3: 7,49–10,50 | – | 8,29 | 9,27 | 10,25 |
| Macarrão espaguete 500 g | 4: 3,60–4,59 | 15: 2,09–4,59 | 3: 2,98–14,19 | 2,16 | 3,65 | 4,59 |
| Macarrão parafuso 500 g | 6: 3,60–7,55 | 20: 2,09–6,29 | 3: 3,05–3,49 | 2,44 | 3,72 | 5,22 |
| Macarrão penne 500 g | 6: 3,60–16,99 | 14: 2,09–15,90 | 3: 3,05–3,49 | 2,29 | 3,59 | 12,34 |
| Macarrão instantâneo 85 g | 16: 1,61–3,29 | 21: 0,99–2,79 | – | 1,09 | 1,61 | 2,83 |
| Óleo de soja 900 ml | 3: 6,89–7,59 | 6: 6,69–7,69 | 3: 8,00–9,37 | 6,89 | 7,52 | 8,32 |
| Azeite de oliva extra virgem 500 ml | 15: 22,39–69,90 | 8: 24,90–65,90 | 3: 28,90–74,90 | 25,30 | 32,75 | 64,80 |
| Azeite de oliva extra virgem 250 ml | 3: 19,90–21,99 | 2: 16,90–17,89 | – | 17,30 | 19,90 | 21,99 |
| Açúcar refinado 1 kg | 3: 3,49–4,29 | 5: 3,09–5,49 | 2: 3,27–4,37 | 3,25 | 3,74 | 4,48 |
| Açúcar cristal 5 kg | – | 5: 12,89–15,29 | 2: 13,39–16,28 | 12,90 | 14,29 | 15,69 |
| Açúcar cristal 1 kg | 4: 3,29–5,59 | 1: 2,75 | 1: 3,39 | 2,97 | 3,39 | 4,19 |
| Café torrado e moído 500 g | 2: 18,69–25,99 | 1: 17,98 | 3: 19,28–35,71 | 18,26 | 19,28 | 31,82 |
| Café torrado e moído 250 g | 20: 15,59–41,59 | – | 2: 15,68–21,99 | 15,65 | 35,54 | 40,23 |
| Achocolatado em pó 400 g | 2: 11,99–28,39 | 3: 5,69–6,99 | – | 6,01 | 6,99 | 21,83 |
| Filtro de papel para café 103 (30 un) | – | – | – | – | – | – |
| Farinha de trigo 1 kg | 7: 3,65–11,99 | 14: 2,59–4,79 | 2: 3,62–4,83 | 3,16 | 3,94 | 4,93 |
| Farinha de mandioca 500 g | 4: 4,45–13,99 | 3: 3,99–8,29 | 3: 4,19–9,04 | 3,99 | 6,50 | 11,05 |
| Fubá 1 kg | 2: 4,99–10,99 | 5: 3,59–6,98 | 3: 4,49–6,49 | 4,11 | 4,99 | 7,78 |
| Fermento químico em pó 100 g | 2: 3,79–5,69 | – | 2: 3,99–4,49 | 3,85 | 4,24 | 5,33 |
| Molho de tomate sachê 300 g | 5: 2,15–5,99 | 12: 1,09–5,79 | 3: 3,75–5,79 | 1,41 | 1,79 | 5,31 |
| Extrato de tomate 300 g | 9: 2,59–7,99 | 12: 1,79–7,99 | 3: 7,89–7,89 | 2,59 | 5,89 | 7,99 |
| Sal refinado 1 kg | 2: 4,99–7,99 | 3: 1,89–3,59 | 1: 8,49 | 2,29 | 4,29 | 8,24 |
| Milho verde em conserva 170 g | 4: 3,15–3,99 | 1: 3,09 | 1: 6,09 | 3,16 | 3,63 | 5,45 |
| Ervilha em conserva 170 g | 4: 3,15–4,49 | 11: 2,99–5,99 | 2: 2,95–4,89 | 3,29 | 3,50 | 5,05 |
| Atum em lata 170 g | – | 1: 13,59 | 3: 13,05–13,69 | 13,16 | 13,59 | 13,67 |
| Sardinha em lata 125 g | 2: 16,99–19,99 | 2: 6,19–6,19 | 3: 6,43–7,58 | 6,26 | 6,90 | 15,15 |
| Maionese 500 g | 5: 10,99–12,19 | 4: 6,45–8,99 | 3: 6,59–11,99 | 6,58 | 8,49 | 12,01 |
| Ketchup 400 g | 5: 16,49–16,49 | 3: 6,79–11,90 | 3: 11,89–23,69 | 8,43 | 11,89 | 18,32 |
| Leite integral 1 L | 12: 4,69–13,09 | 11: 4,79–7,79 | 2: 4,82–5,99 | 4,82 | 5,69 | 7,79 |
| Leite desnatado 1 L | 15: 4,69–8,59 | 8: 3,49–6,99 | 3: 4,99–6,99 | 4,67 | 5,39 | 6,99 |
| Leite semidesnatado 1 L | 6: 4,69–10,30 | 9: 4,39–10,90 | 3: 5,99–9,59 | 4,63 | 5,49 | 9,13 |
| Leite zero lactose 1 L | 10: 6,45–10,75 | 7: 4,99–7,99 | 1: 7,00 | 5,53 | 6,97 | 8,22 |
| Leite condensado 395 g | 9: 4,79–8,99 | 13: 4,49–8,99 | 3: 4,99–5,89 | 4,93 | 6,09 | 7,76 |
| Creme de leite 200 g | 7: 2,49–7,99 | 10: 2,49–5,99 | 3: 1,99–4,89 | 2,49 | 3,22 | 4,89 |
| Manteiga 200 g | 24: 9,99–28,50 | 21: 7,49–18,50 | 2: 9,41–24,79 | 9,32 | 12,99 | 18,94 |
| Margarina 500 g | 11: 7,49–14,99 | 19: 3,35–15,90 | 4: 7,40–17,73 | 6,04 | 7,99 | 13,78 |
| Requeijão cremoso 200 g | 4: 9,69–14,99 | – | 1: 8,49 | 8,73 | 9,69 | 13,13 |
| Iogurte natural 170 g | 6: 3,59–9,69 | 4: 2,89–4,59 | 2: 3,49–3,49 | 3,31 | 3,94 | 8,50 |
| Queijo muçarela fatiado 150 g | 9: 9,59–19,99 | 9: 5,99–10,90 | 3: 7,99–11,32 | 7,69 | 9,74 | 13,37 |
| Queijo parmesão ralado 50 g | 6: 6,49–8,29 | 6: 3,79–7,99 | 3: 6,79–8,39 | 5,85 | 7,24 | 8,10 |
| Presunto fatiado 200 g | 2: 11,99–12,99 | 3: 7,49–10,90 | 3: 8,19–9,99 | 7,98 | 9,45 | 12,29 |
| Salsicha 500 g | 8: 9,99–14,99 | 8: 9,90–11,98 | 2: 10,56–13,10 | 9,98 | 11,98 | 13,59 |
| Linguiça toscana 1 kg | 1: 26,99 | – | – | 26,99 | 26,99 | 26,99 |
| Mortadela fatiada 200 g | 4: 7,49–9,99 | 2: 4,99–7,49 | 3: 6,29–9,49 | 5,95 | 7,79 | 9,69 |
| Pão de forma tradicional 500 g | – | – | 1: 11,69 | 11,69 | 11,69 | 11,69 |
| Biscoito cream cracker 200 g | – | – | – | – | – | – |
| Biscoito maisena 200 g | 1: 6,29 | 1: 4,89 | 1: 7,02 | 5,17 | 6,29 | 6,87 |
| Biscoito recheado de chocolate 130 g | 2: 4,49–4,49 | 2: 2,42–2,69 | 3: 2,69–2,89 | 2,60 | 2,79 | 4,01 |
| Torrada tradicional 160 g | – | – | – | – | – | – |
| Cereal matinal flocos de milho 300 g | – | – | – | – | – | – |
| Refrigerante de cola 2 L | 1: 11,99 | 4: 3,59–10,29 | – | 4,15 | 7,99 | 11,31 |
| Refrigerante guaraná 2 L | 4: 5,65–9,39 | 9: 4,99–7,99 | 2: 4,69–8,89 | 4,99 | 6,17 | 8,62 |
| Água mineral sem gás 1,5 L | 4: 2,79–4,49 | 4: 2,79–3,09 | – | 2,79 | 3,04 | 4,14 |
| Suco de uva integral 1 L | 3: 16,99–35,95 | 4: 9,90–22,90 | 2: 12,90–13,49 | 12,30 | 13,90 | 31,18 |
| Suco em pó 25 g | – | – | – | – | – | – |
| Cerveja lata 350 ml | 23: 2,79–6,49 | 4: 2,49–3,79 | 3: 5,09–6,29 | 2,89 | 4,89 | 6,29 |
| Ovos brancos (dúzia) | 1: 8,49 | 1: 6,99 | – | 7,14 | 7,74 | 8,34 |
| Peito de frango (kg) | – | 2: 10,90–11,50 | – | 10,96 | 11,20 | 11,44 |
| Coxa e sobrecoxa de frango (kg) | – | – | 1: 10,90 | 10,90 | 10,90 | 10,90 |
| Carne moída bovina (kg) | – | – | – | – | – | – |
| Alcatra bovina (kg) | 3: 58,90–92,90 | – | 1: 58,38 | 58,48 | 58,90 | 80,50 |
| Acém bovino (kg) | 2: 49,89–93,90 | 1: 36,99 | 1: 41,90 | 38,46 | 45,89 | 80,70 |
| Costela bovina (kg) | 2: 49,89–99,90 | – | 2: 27,69–43,90 | 32,55 | 46,89 | 84,90 |
| Bisteca suína (kg) | – | 1: 15,99 | 2: 19,29–19,39 | 16,65 | 19,29 | 19,37 |
| Banana prata (kg) | – | 1: 6,99 | – | 6,99 | 6,99 | 6,99 |
| Maçã gala (kg) | 1: 11,79 | – | 1: 9,99 | 10,17 | 10,89 | 11,61 |
| Laranja pera (kg) | 1: 3,89 | 2: 2,00–3,89 | – | 3,04 | 3,42 | 3,80 |
| Tomate (kg) | 2: 20,49–20,99 | – | – | 20,74 | 20,74 | 20,74 |
| Cebola (kg) | 4: 6,15–16,79 | 2: 7,68–9,98 | – | 6,74 | 8,83 | 12,08 |
| Batata (kg) | – | 2: 4,99–5,99 | – | 5,49 | 5,49 | 5,49 |
| Alho (kg) | 2: 15,79–29,89 | 2: 21,09–21,90 | – | 16,93 | 21,49 | 28,21 |
| Cenoura (kg) | 1: 8,15 | 1: 7,99 | – | 8,01 | 8,07 | 8,13 |
| Detergente líquido 500 ml | – | 23: 1,89–3,79 | 3: 2,99–3,99 | 1,94 | 2,49 | 3,39 |
| Sabão em pó 1,6 kg | 3: 19,99–23,99 | 14: 10,19–26,50 | – | 13,99 | 19,69 | 23,18 |
| Sabão líquido para roupas 3 L | – | – | 3: 31,90–35,90 | 32,10 | 32,90 | 35,30 |
| Amaciante de roupas 2 L | 8: 8,99–10,99 | 17: 5,75–10,90 | 3: 8,99–11,90 | 7,45 | 8,99 | 10,99 |
| Água sanitária 2 L | 3: 7,99–8,99 | 8: 4,15–8,99 | 2: 7,99–7,99 | 5,82 | 7,99 | 8,87 |
| Desinfetante 2 L | 9: 7,99–29,99 | 24: 5,19–29,90 | 3: 9,90–12,90 | 6,24 | 9,95 | 26,45 |
| Esponja de louça multiuso (3 un) | – | – | – | – | – | – |
| Papel toalha (2 rolos) | 3: 5,99–8,99 | 4: 4,99–6,99 | 1: 17,99 | 5,59 | 6,49 | 12,59 |
| Saco de lixo 50 L | 11: 11,99–45,99 | 8: 14,90–35,90 | 2: 17,99–30,99 | 14,61 | 25,40 | 33,09 |
| Papel higiênico folha dupla (12 rolos) | 3: 23,59–36,99 | 3: 12,99–25,89 | 2: 17,29–19,99 | 14,18 | 19,99 | 30,33 |
| Creme dental 90 g | 21: 5,39–22,99 | 21: 3,99–25,98 | 2: 8,79–17,89 | 4,99 | 10,99 | 19,84 |
| Sabonete em barra 85 g | 13: 2,99–3,99 | 16: 2,15–3,99 | 3: 0,98–0,98 | 0,98 | 2,99 | 3,59 |
| Shampoo 350 ml | 7: 12,99–36,99 | 12: 8,99–29,90 | 2: 16,49–21,49 | 10,79 | 18,09 | 30,61 |
| Condicionador 350 ml | 5: 13,49–13,49 | 6: 8,25–12,29 | – | 9,54 | 11,59 | 13,11 |
| Desodorante aerossol 150 ml | 7: 12,90–21,99 | 24: 5,99–20,90 | 3: 7,49–7,49 | 7,34 | 10,97 | 21,01 |
| Absorvente com abas (8 un) | 4: 3,99–9,99 | 5: 3,99–4,99 | 2: 9,09–9,99 | 3,99 | 6,24 | 9,99 |

## Preços suspeitos (mais de 2,5× acima ou abaixo do típico do item)

| Item | Rede | Produto | Preço comparável | Típico do item |
|---|---|---|---|---|
| Macarrão espaguete 500 g | condor | Espaguete Massa Leve 500g | 14,19 | 3,65 |
| Macarrão penne 500 g | angeloni | Macarrão Mini Penne Grano Duro BARILLA 500g | 15,99 | 3,59 |
| Macarrão penne 500 g | angeloni | Macarrão Penne Tricolori Grano Duro BARILLA 500g | 16,99 | 3,59 |
| Macarrão penne 500 g | angeloni | Macarrão Italiana Grano Duro GAROFALO Penne Ziti Regate 500g | 13,99 | 3,59 |
| Macarrão penne 500 g | angeloni | Macarrão MONTE ROMANO Penne 500g | 8,99 | 3,59 |
| Macarrão penne 500 g | atacadao | Macarrão Grano Duro Barilla Penne Rigate 500g | 15,90 | 3,59 |
| Achocolatado em pó 400 g | angeloni | Achocolatado em Pó NATIVE Orgânico 400g | 28,39 | 6,99 |
| Farinha de trigo 1 kg | angeloni | Farinha de Trigo VENTURELLI Alma Italiana 1kg | 11,99 | 3,94 |
| Molho de tomate sachê 300 g | angeloni | Molho de Tomate POMAROLA Bolonhesa Sachê 300g | 5,99 | 1,79 |
| Molho de tomate sachê 300 g | angeloni | Molho de Tomate POMAROLA Caseiro Sachê 300g | 5,49 | 1,79 |
| Molho de tomate sachê 300 g | angeloni | Molho de Tomate POMAROLA Manjericão Sachê 300g | 5,49 | 1,79 |
| Molho de tomate sachê 300 g | atacadao | Molho de Tomate Pomarola Caseiro 300g | 4,99 | 1,79 |
| Molho de tomate sachê 300 g | atacadao | Molho de Tomate Pomarola Manjericão 300g | 4,99 | 1,79 |
| Molho de tomate sachê 300 g | atacadao | Molho de Tomate Pomarola Passata 300g | 5,79 | 1,79 |
| Molho de tomate sachê 300 g | condor | Molho de Tomate Pomarola 300g - Caseiro - Manjericão - Sachê | 5,79 | 1,79 |
| Molho de tomate sachê 300 g | condor | Molho de Tomate Pomarola 300g - Caseiro - Clássico - Sachê | 4,99 | 1,79 |
| Extrato de tomate 300 g | atacadao | Extrato de Tomate Xavante 300g | 1,79 | 5,89 |
| Sardinha em lata 125 g | angeloni | Sardinha RAMIREZ RAMIREZ 125g | 19,99 | 6,90 |
| Suco de uva integral 1 L | angeloni | Suco ORGANOVITA Orgânico Uva Bordô Integral 1L | 35,95 | 13,90 |
| Desinfetante 2 L | angeloni | Desinfetante LYSOFORM Original 2L | 29,99 | 9,95 |
| Desinfetante 2 L | angeloni | Desinfetante LYSOFORM Lavanda 2L | 29,99 | 9,95 |
| Desinfetante 2 L | angeloni | Desinfetante LYSOFORM Citrus 2L | 29,99 | 9,95 |
| Desinfetante 2 L | atacadao | Desinfetante Lysoform Suave 2L | 29,90 | 9,95 |
| Desinfetante 2 L | atacadao | Desinfetante Procão Concentrado Citronela 2L | 29,90 | 9,95 |
| Papel toalha (2 rolos) | condor | Toalha de Papel Maxim Com 2 Rolos de 200 Folhas - Especiale | 17,99 | 6,49 |
| Creme dental 90 g | atacadao | Creme Dental Closeup Red Hot 90g | 3,99 | 10,99 |
| Creme dental 90 g | atacadao | Creme Dental Sorriso Dentes Brancos 90g | 3,99 | 10,99 |
| Sabonete em barra 85 g | condor | Sabonete Cliss 85g - Lavanda | 0,98 | 2,99 |
| Sabonete em barra 85 g | condor | Sabonete Cliss 85g - Flores do Campo | 0,98 | 2,99 |
| Sabonete em barra 85 g | condor | Sabonete Cliss 85g - Floral | 0,98 | 2,99 |

## Ambíguos (vão para revisão)

Nenhum.

## Amostra para revisão do tester (50 casamentos)

Marque `x` em **OK** se o produto é mesmo o item; se não, anote o motivo.

| OK | Item do catálogo | Rede | Produto na rede | Preço |
|---|---|---|---|---|
| [ ] | Açúcar cristal 5 kg | atacadao | Açúcar Cristal Bulnez 5kg | 15,29 |
| [ ] | Cerveja lata 350 ml | atacadao | Cerveja Crystal 350ml | 2,49 |
| [ ] | Cerveja lata 350 ml | condor | Cerveja Heineken 350ml - Ultimate - Sem Glúten - Lata | 6,29 |
| [ ] | Cerveja lata 350 ml | angeloni | Cerveja BADEN BADEN Lager Amber 350ml | 4,99 |
| [ ] | Ovos brancos (dúzia) | atacadao | Ovo Branco Grande 12 un | 6,99 |
| [ ] | Farinha de mandioca 500 g | angeloni | Farinha de Mandioca PINDUCA Branca 500g | 4,45 |
| [ ] | Farinha de mandioca 500 g | angeloni | Farinha de Mandioca YUCAFIT Sem Glúten 500g | 9,79 |
| [ ] | Farinha de trigo 1 kg | atacadao | Farinha de Trigo Dona Benta Tipo 1 1kg | 3,99 |
| [ ] | Fubá 1 kg | atacadao | Fubá Pré-Cozido Sinhá 1kg | 4,69 |
| [ ] | Mortadela fatiada 200 g | condor | Mortadela Ouro Perdigão 200g - Ervas Finas - Fatiada | 9,49 |
| [ ] | Arroz branco tipo 1 5 kg | atacadao | Arroz MC Agulhinha Tipo 1 5kg | 21,49 |
| [ ] | Feijão carioca 1 kg | atacadao | Feijão Carioca Urbano Tipo 1 1kg | 8,99 |
| [ ] | Feijão carioca 1 kg | atacadao | Feijão Carioca Da Casa Tipo 1 1kg | 7,49 |
| [ ] | Absorvente com abas (8 un) | atacadao | Absorvente Sempre Livre Adapt Suave sem abas 8 un | 3,99 |
| [ ] | Creme dental 90 g | angeloni | Creme Dental SENSODYNE Proteção Completa 90g | 22,69 |
| [ ] | Creme dental 90 g | angeloni | Creme Dental Colgate Natural Extracts Coco e Gengibre 90g | 14,49 |
| [ ] | Creme dental 90 g | angeloni | Creme Dental COLGATE Tripla Ação Hortelã 90g | 6,99 |
| [ ] | Creme dental 90 g | atacadao | Creme Dental Sensodyne Original 90g | 15,99 |
| [ ] | Creme dental 90 g | atacadao | Creme Dental Colgate Total Limpeza Interdental 90g | 10,99 |
| [ ] | Desodorante aerossol 150 ml | atacadao | Desodorante Aerossol Nivea Black & White Invisible Clear 150ml | 7,98 |
| [ ] | Desodorante aerossol 150 ml | atacadao | Desodorante Aerossol Axe Apollo 150ml | 12,49 |
| [ ] | Papel higiênico folha dupla (12 rolos) | angeloni | Papel Higiênico DUETTO Neutro Folha Dupla com 12 Rolos 30 Metros | 23,59 |
| [ ] | Shampoo 350 ml | atacadao | Shampoo Darling Detox 350ml | 8,99 |
| [ ] | Cenoura (kg) | angeloni | Cenoura Kg | 8,15 |
| [ ] | Creme de leite 200 g | atacadao | Creme de Leite Nestlé 200g | 4,90 |
| [ ] | Creme de leite 200 g | atacadao | Creme de Leite Italac 200g | 2,49 |
| [ ] | Leite condensado 395 g | angeloni | Leite Condensado PIRACANJUBA 395g | 6,19 |
| [ ] | Leite semidesnatado 1 L | atacadao | Leite Longa Vida Itambé Semidesnatado com Tampa 1L | 5,49 |
| [ ] | Leite semidesnatado 1 L | angeloni | Leite Semidesnatado Nestlé Ninho 1l | 8,59 |
| [ ] | Manteiga 200 g | angeloni | Manteiga President Com Sal 200g | 12,99 |
| [ ] | Margarina 500 g | atacadao | Margarina Claybom Com sal 500g | 5,90 |
| [ ] | Queijo muçarela fatiado 150 g | atacadao | Queijo Mussarela Litoral Fatiado 150g | 7,69 |
| [ ] | Queijo parmesão ralado 50 g | atacadao | Queijo Parmesão Ralado Itambé 50g | 5,79 |
| [ ] | Amaciante de roupas 2 L | condor | Amaciante Soft Plus 2 Litros - Lavanda | 8,99 |
| [ ] | Desinfetante 2 L | atacadao | Desinfetante Lysoform Suave 2L | 29,90 |
| [ ] | Desinfetante 2 L | angeloni | Desinfetante LYSOFORM Lavanda 2L | 29,99 |
| [ ] | Desinfetante 2 L | atacadao | Desinfetante Sanol Talco 2L | 8,89 |
| [ ] | Detergente líquido 500 ml | atacadao | Detergente Líquido Minuano Maçã 500ml | 1,98 |
| [ ] | Macarrão espaguete 500 g | condor | Espaguete Massa Leve 500g | 14,19 |
| [ ] | Macarrão espaguete 500 g | angeloni | Macarrão GALO espaguete 8 sêmola 500g | 4,59 |
| [ ] | Macarrão instantâneo 85 g | atacadao | Macarrão Instantâneo Nissin Lámen Galinha caipira 85g | 2,39 |
| [ ] | Macarrão parafuso 500 g | atacadao | Macarrão de Sêmola Cristal Parafuso 500g | 2,89 |
| [ ] | Macarrão parafuso 500 g | atacadao | Macarrão com Ovos Dona Benta Parafuso 500g | 3,69 |
| [ ] | Macarrão penne 500 g | atacadao | Macarrão com Ovos Floriani Penne 500g | 3,45 |
| [ ] | Maionese 500 g | condor | Maionese Hellmanns 500g - Aioli | 11,99 |
| [ ] | Maionese 500 g | atacadao | Maionese Bulnez 500g | 6,99 |
| [ ] | Molho de tomate sachê 300 g | condor | Molho de Tomate Pomarola 300g - Caseiro - Manjericão - Sachê | 5,79 |
| [ ] | Azeite de oliva extra virgem 250 ml | atacadao | Azeite de Oliva Gallo Extra Virgem 250ml | 17,89 |
| [ ] | Azeite de oliva extra virgem 500 ml | angeloni | Azeite de Oliva GALLO Extra Virgem 500ml | 25,89 |
| [ ] | Azeite de oliva extra virgem 500 ml | angeloni | Azeite de Oliva PONS Janroc Koroneiki Extra Virgem 500ml | 69,90 |
