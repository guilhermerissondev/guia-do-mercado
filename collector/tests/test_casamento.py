import pytest

from gm.casamento import Casador
from gm.catalogo import carregar


@pytest.fixture(scope="module")
def casador():
    return Casador(carregar())


# Nomes reais vistos no spike M1 (Atacadão, Angeloni e Condor, CEP de Maringá).
@pytest.mark.parametrize(
    "nome, item",
    [
        ("Arroz Tio João Agulhinha - Tipo 1 5kg", "arroz-branco-5kg"),
        ("Arroz Branco TIO JOÃO 5kg", "arroz-branco-5kg"),
        ("Arroz Tio João 5kg - Branco", "arroz-branco-5kg"),
        ("Arroz Tio João Parboilizado - Tipo 1 5kg", "arroz-parboilizado-5kg"),
        ("Café Pilão Tradicional Doy 500g", "cafe-torrado-moido-500g"),
        ("Café Torrado e Moído a Vácuo Tradicional PILÃO 500g", "cafe-torrado-moido-500g"),
        ("Café Pilão 500g - Tradicional - A Vácuo", "cafe-torrado-moido-500g"),
        ("Açúcar União Refinado 1kg", "acucar-refinado-1kg"),
        ("Açúcar Refinado UNIÃO 1kg", "acucar-refinado-1kg"),
        ("Óleo de Soja Liza 900ml", "oleo-soja-900ml"),
        ("Óleo de Soja Liza 900ml - Pet", "oleo-soja-900ml"),
        ("Leite Longa Vida Italac Com tampa Integral 1L", "leite-integral-1l"),
        ("Leite PIRACANJUBA Integral 1l", "leite-integral-1l"),
        ("Leite Parmalat Integral 1l", "leite-integral-1l"),
        ("Leite Integral Zero Lactose Italac 1l", "leite-zero-lactose-1l"),
        ("Ovos Brancos Grandes c/12", "ovos-brancos-12un"),
        ("Papel Higiênico Neve Folha Dupla 12 Rolos 30m", "papel-higienico-12un"),
        ("Refrigerante Coca-Cola Original 2L", "refrigerante-cola-2l"),
        ("Saco para Lixo 50 Litros c/10", "saco-lixo-50l"),
        ("Cebola 19kg", "cebola-kg"),
        ("Tomate Kg", "tomate-kg"),
        ("Batata Lavada Quilo", "batata-kg"),
        ("Peito de Frango Copacol Congelado 17kg", "peito-frango-kg"),
        ("Sal Refinado CISNE Tradicional 1kg", "sal-refinado-1kg"),
        ("Café PILÃO Torrado E Moído Tradicional Vácuo 250g", "cafe-torrado-moido-250g"),
        ("Sabonete Cliss 85g - Lavanda", "sabonete-barra-85g"),
    ],
)
def test_casa_com_item_certo(casador, nome, item):
    c = casador.casar(nome)
    assert c.item_id == item, c


# Produtos que NÃO podem casar com o item vizinho (erros reais ou prováveis).
@pytest.mark.parametrize(
    "nome",
    [
        "Óleo de Girassol LIZA 900ml",            # erro real do spike: veio no lugar de soja
        "Leite Condensado Piracanjuba Seleção Integral 395g",  # não é leite integral 1 L
        "Leite Xandô Integral A2 1L",              # leite A2 fica fora do item genérico
        "Leite Fermentado Yakult 6x80g",
        "Sobremesa Proteica Verde Campo 130g - Doce de Leite",
        "Cerveja Skol Lata 350ml c/12",            # pacote, não lata avulsa
        "Refrigerante Coca-Cola Zero 2L",
        "Café Pilão em Cápsulas 10un",
        "Ovos Vermelhos c/30",
        "Panela De Arroz 5 Xícaras Ph5p Visor Glass Inox 220V",
        # Erros reais da amostra de Maringá (M2), corrigidos com comeca_com e exclusões
        "Salgadinho Lucky Fofura Cebola 60g",
        "Tempero Meu Segredo Maggi Cebola e Alho 49g",
        "Sopa Vono 17g - Peito de Frango com Queijo",
        "Massa Instantânea Isabela 75g - Zero Fritura - Minions - Tomate",
        "Pão AMINNA Cenoura sem Glúten 400g",
        "Mini Cenoura MISTER RABBIT 250g",
        "Molho Gota Alho 150ml",
        "Linguiça de Costela Bovina Maturatta Congelada 300g",
        "Leite  De Cabra Caprilat Integral 1l",
        "Bolo CASA SUÍÇA Café da Manhã Cenoura com Chocolate Pacote 250g",
        "Tempero Sabor Ami Alho e Sal 1kg",
        "Margarina Qualy 1kg - Com Sal",
        "Refrigerante COCA-COLA + FANTA LARANJA 2L",
        "Arroz Zaeli 1kg - Oriental",
        "Sabonete PROTEX Limpeza Profunda Original 85g cada Leve 6 Pague Menos",
        "NIVEA Sabonete em Barra Hidratante Leite Promo 6 uni 85g",
        "Creme Dental Colgate Total Com 3 Cremes de 90g cada - Original - Preço Especial",
    ],
)
def test_nao_casa(casador, nome):
    c = casador.casar(nome)
    assert c.item_id is None or c.item_id not in {
        "oleo-soja-900ml", "leite-integral-1l", "cerveja-lata-350ml",
        "refrigerante-cola-2l", "cafe-torrado-moido-500g", "ovos-brancos-12un",
        "arroz-branco-5kg", "arroz-branco-1kg", "cebola-kg", "tomate-kg", "cenoura-kg", "alho-kg",
        "peito-frango-kg", "costela-bovina-kg", "cafe-torrado-moido-250g", "sal-refinado-1kg",
        "sabonete-barra-85g", "creme-dental-90g",
    }, c


def test_ean_conhecido_tem_prioridade(casador):
    casador.aprender_ean("7896036090602", "oleo-soja-900ml")  # mapeamento manual (hipotético)
    c = casador.casar("qualquer nome", ean="7896036090602")
    assert c.metodo == "ean" and c.item_id == "oleo-soja-900ml"
    casador.eans.pop("7896036090602")


def test_catalogo_valido():
    cat = carregar()
    assert len(cat.itens) >= 90
    assert all(i.categoria in cat.categorias for i in cat.itens.values())


def test_preco_por_kg_para_caixa_de_atacado():
    from gm.casamento import preco_referencia
    cat = carregar()
    assert preco_referencia(cat.itens["cebola-kg"], "Cebola 19kg", 146.00) == 7.68
    assert preco_referencia(cat.itens["tomate-kg"], "Tomate Kg", 8.99) == 8.99
    assert preco_referencia(cat.itens["leite-integral-1l"], "Leite Integral 1L", 5.49) == 5.49
