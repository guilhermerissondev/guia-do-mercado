"""Coletor contra um Postgres real, com fontes falsas (não acessa os sites).

Roda só com DATABASE_URL apontando para um banco com migrações e seeds aplicados
(tools/dev-db.sh localmente; serviço postgres no CI).
"""

import os

import pytest

from gm.fontes.osuper import Loja
from gm.fontes.vtex import ProdutoRede

pytestmark = pytest.mark.skipif(not os.environ.get("DATABASE_URL"), reason="sem DATABASE_URL")

BRASILIA = 5300108  # município de teste fora do piloto: prova que nada depende de Maringá


class FakeVtex:
    def __init__(self, rede, precos):
        self.rede, self.precos = rede, precos

    def region_id(self, cep):
        return "regiao-fake"

    def buscar(self, termo, region_id, quantidade=24):
        if termo != "Leite integral 1 L":
            return []
        return [ProdutoRede(self.rede, f"{self.rede}-{i}", nome, marca, None, preco)
                for i, (nome, marca, preco) in enumerate(self.precos)]


class FakeOSuper:
    def lojas(self, contexto):
        return [Loja("900", "Loja Brasília", "Brasília", "Distrito Federal")]

    def catalogo_sitemap(self):
        return [("p1", "leite integral marca df 1l"), ("p2", "panela de pressao 4l")]

    def produto(self, pid, loja):
        assert loja == "900"
        return ProdutoRede("fakeosuper", pid, "Leite Integral Marca DF 1L", "Marca DF", None, 5.10)


@pytest.fixture
def conn():
    from gm.db import conectar
    c = conectar()
    _limpar(c)
    c.execute("""insert into rede (id, nome, plataforma, config) values
                 ('fakea', 'Fake A', 'vtex', '{"host": "a"}'),
                 ('fakeb', 'Fake B', 'vtex', '{"host": "b"}'),
                 ('fakeosuper', 'Fake OSuper', 'osuper', '{"site": "s", "api": "a", "loja_contexto": "1"}')""")
    # Isola o teste: guarda e desativa redes e regiões reais, restaura no fim
    redes = [r["id"] for r in c.execute("select id from rede where ativa and id not like 'fake%'")]
    regioes = [r["regiao_imediata"] for r in c.execute("select regiao_imediata from regiao_coleta where ativa")]
    c.execute("update rede set ativa = false where id = any(%s)", (redes,))
    c.execute("update regiao_coleta set ativa = false where regiao_imediata = any(%s)", (regioes,))
    yield c
    _limpar(c)
    c.execute("update rede set ativa = true where id = any(%s)", (redes,))
    c.execute("update regiao_coleta set ativa = true where regiao_imediata = any(%s)", (regioes,))
    c.execute("select recalcular_estat_preco()")
    c.close()


def _limpar(c):
    regiao = c.execute("select regiao_imediata_id from municipio where id = %s", (BRASILIA,)).fetchone()["regiao_imediata_id"]
    c.execute("delete from preco_obs where rede_id like 'fake%'")
    c.execute("delete from revisao_casamento where rede_id like 'fake%'")
    c.execute("delete from produto_rede where rede_id like 'fake%'")
    c.execute("delete from coleta_tarefa where rede_id like 'fake%'")
    c.execute("delete from rede_regiao where rede_id like 'fake%'")
    c.execute("delete from rede_loja where rede_id like 'fake%'")
    c.execute("delete from rede where id like 'fake%'")
    c.execute("delete from regiao_coleta where regiao_imediata = %s", (regiao,))


def test_ciclo_completo(conn):
    from gm.coleta import Coletor, ativar_regiao

    fakes = {
        "fakea": FakeVtex("fakea", [("Leite Italac Integral 1L", "Italac", 5.49),
                                    ("Leite Piracanjuba Integral 1L", "Piracanjuba", 5.29),
                                    ("Leite Condensado Moça 395g", "Moça", 7.99)]),   # casa com outro item (leite condensado)
        "fakeb": FakeVtex("fakeb", [("Leite Tirol Integral 1L", "Tirol", 4.99)]),
        "fakeosuper": FakeOSuper(),
    }
    coletor = Coletor(conn, fabrica=lambda rede, cliente: fakes[rede["id"]])
    try:
        regiao = ativar_regiao(conn, BRASILIA, "70040010")
        assert coletor.sincronizar_lojas() == 1
        loja = conn.execute("select municipio_ibge from rede_loja where rede_id = 'fakeosuper'").fetchone()
        assert loja["municipio_ibge"] == BRASILIA, "loja precisa ser mapeada para o município do IBGE"

        assert conn.execute("select agendar_coletas() as n").fetchone()["n"] == 3
        # Só as redes falsas do teste: nunca pegar tarefas reais da fila
        assert sum(coletor.rodar_fila(rede=r) for r in ("fakea", "fakeb", "fakeosuper")) == 3

        tarefas = conn.execute("select status, n_precos from coleta_tarefa where rede_id like 'fake%' order by rede_id").fetchall()
        assert [t["status"] for t in tarefas] == ["concluida"] * 3
        assert [t["n_precos"] for t in tarefas] == [3, 1, 1]

        sel = conn.execute("select count(*) as n from rede_regiao where regiao_imediata = %s and selecionada", (regiao,)).fetchone()
        assert sel["n"] == 3

        e = conn.execute("select * from estimativa('leite-integral-1l', %s)", (BRASILIA,)).fetchone()
        assert e["nivel"] == "imediata"
        assert e["n_marcas"] == 4 and e["n_redes"] == 3
        assert e["p10"] <= e["p50"] <= e["p90"]

        # Rodar de novo não agenda nada: as redes acabaram de ser avaliadas
        assert conn.execute("select agendar_coletas() as n").fetchone()["n"] == 0
    finally:
        coletor.cliente.close()


def test_recasar_remove_o_que_deixou_de_casar(conn):
    from gm.coleta import recasar

    regiao = conn.execute("select regiao_imediata_id from municipio where id = %s", (BRASILIA,)).fetchone()["regiao_imediata_id"]
    conn.execute("insert into regiao_coleta (regiao_imediata, cep_referencia) values (%s, '70040010')", (regiao,))
    # Gravado como leite integral por uma regra antiga; com as regras atuais não casa (pacote "LV 3 PG 2")
    conn.execute("""insert into produto_rede (rede_id, codigo, nome, item_canonico_id, casamento_metodo)
                    values ('fakea', 'x1', 'Leite Italac Integral 1L LV 3 PG 2', 'leite-integral-1l', 'regra'),
                           ('fakea', 'x2', 'Leite Italac Integral 1L', 'leite-integral-1l', 'regra')""")
    conn.execute("""insert into preco_obs (rede_id, codigo, regiao_imediata, item_canonico_id, preco, preco_ref)
                    values ('fakea', 'x1', %s, 'leite-integral-1l', 15.0, 15.0),
                           ('fakea', 'x2', %s, 'leite-integral-1l', 5.0, 5.0)""", (regiao, regiao))
    cont = recasar(conn)
    assert cont["removidos"] >= 1
    restantes = conn.execute("select codigo from preco_obs where rede_id = 'fakea'").fetchall()
    assert [r["codigo"] for r in restantes] == ["x2"]
