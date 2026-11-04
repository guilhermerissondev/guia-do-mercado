import pytest

from gm.texto import Conteudo, contem, extrair_embalagem, normalizar, parse_conteudo


def test_normalizar_remove_acento_e_pontuacao():
    assert normalizar("Açúcar Refinado UNIÃO 1kg") == "acucar refinado uniao 1kg"
    assert normalizar("Coca-Cola  Original") == "coca cola original"


def test_normalizar_virgula_decimal():
    assert normalizar("Água Mineral 1,5L") == "agua mineral 1.5l"


@pytest.mark.parametrize(
    "spec, esperado",
    [
        ("1l", Conteudo(1000, "ml")),
        ("1.5l", Conteudo(1500, "ml")),
        ("500g", Conteudo(500, "g")),
        ("1.6kg", Conteudo(1600, "g")),
        ("12un", Conteudo(12, "un")),
    ],
)
def test_parse_conteudo(spec, esperado):
    assert parse_conteudo(spec) == esperado


def test_parse_conteudo_invalido():
    with pytest.raises(ValueError):
        parse_conteudo("um litro")


@pytest.mark.parametrize(
    "nome, medida, contagem, multipack",
    [
        ("Arroz Tio João Agulhinha - Tipo 1 5kg", Conteudo(5000, "g"), None, False),
        ("Leite Longa Vida Italac Com tampa Integral 1L", Conteudo(1000, "ml"), None, False),
        ("Água Mineral Crystal 1,5 Litros", Conteudo(1500, "ml"), None, False),
        ("Leite Fermentado Yakult 6x80g", Conteudo(80, "g"), 6, True),
        ("Ovos Brancos Grandes c/12", None, 12, False),
        ("Ovos Vermelhos 1 Dúzia", None, 12, False),
        ("Papel Higiênico Neve Folha Dupla 12 Rolos 30m", None, 12, False),
        ("Cerveja Skol Lata 350ml c/12", Conteudo(350, "ml"), 12, False),
        ("Kit Shampoo + Condicionador 350ml", Conteudo(350, "ml"), None, True),
        ("Cerveja Império Puro Malte Lata com 15 350ml", Conteudo(350, "ml"), None, True),
        ("Cerveja Corona Cero 8 latas de 350ml", Conteudo(350, "ml"), None, True),
        ("Lava-Roupas em Pó Omo Caixa 1,6kg Grátis 150g", Conteudo(1600, "g"), None, False),
    ],
)
def test_extrair_embalagem(nome, medida, contagem, multipack):
    emb = extrair_embalagem(normalizar(nome))
    assert emb.medida == medida
    assert emb.contagem == contagem
    assert emb.multipack == multipack


def test_contem_palavra_inteira():
    assert contem("leite em po integral", "po")
    assert not contem("leite longa vida pote", "po")
    assert contem("azeite de oliva extra virgem", "extra virgem")


def test_equivale_com_tolerancia():
    assert Conteudo(1000, "g").equivale(Conteudo(1010, "g"))
    assert not Conteudo(1000, "g").equivale(Conteudo(900, "g"))
    assert not Conteudo(1000, "g").equivale(Conteudo(1000, "ml"))
