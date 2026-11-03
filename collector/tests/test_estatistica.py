from gm.estatistica import Observacao, faixa, percentil


def test_percentil_igual_percentile_cont():
    assert percentil([1, 2, 3, 4], 0.5) == 2.5
    assert percentil([10], 0.9) == 10
    assert round(percentil([1, 2, 3, 4, 5], 0.1), 2) == 1.4


def test_marca_conta_uma_vez_por_rede():
    # 17 cafés gourmet da mesma marca não podem dominar a faixa (caso real do café 250 g)
    obs = [Observacao("angeloni", "STARBUCKS", f"Café Starbucks {i}", 39.99) for i in range(17)]
    obs += [
        Observacao("angeloni", "PILÃO", "Café Pilão 250g", 15.59),
        Observacao("condor", "3 Corações", "Café 3 Corações 250g", 15.68),
        Observacao("condor", "Melitta", "Café Melitta 250g", 21.99),
    ]
    f = faixa(obs)
    assert f.n_marcas == 4 and f.n_produtos == 20
    assert f.tipico < 22  # sem a deduplicação a mediana seria 39,99


def test_mesma_marca_em_redes_diferentes_conta_separado():
    obs = [Observacao("atacadao", "Pilão", "a", 20.9), Observacao("angeloni", "Pilão", "b", 25.99)]
    assert faixa(obs).n_marcas == 2


def test_sem_marca_usa_o_nome():
    obs = [Observacao("x", None, "Tomate Kg", 8.0), Observacao("x", "Não Informado", "Tomate Italiano Kg", 9.0)]
    assert faixa(obs).n_marcas == 2


def test_vazio():
    assert faixa([]) is None
