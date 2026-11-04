import httpx
import pytest

from gm import coleta
from gm.coleta import Coletor


class FonteComErro:
    rede = "teste"

    def __init__(self, status: list[int]):
        self.status = list(status)  # um por chamada; 200 = deu certo
        self.chamadas = 0

    def buscar(self, termo, region_id, quantidade=24):
        self.chamadas += 1
        s = self.status.pop(0)
        if s != 200:
            req = httpx.Request("GET", "https://loja.exemplo/busca")
            raise httpx.HTTPStatusError("erro", request=req, response=httpx.Response(s, request=req))
        return ["produto"]


@pytest.fixture
def coletor(monkeypatch):
    monkeypatch.setattr(coleta, "PAUSA_ERRO_PASSAGEIRO", 0)
    return object.__new__(Coletor)  # não precisa de banco


def test_erro_500_tenta_de_novo(coletor):
    f = FonteComErro([500, 200])
    assert coletor._buscar_tolerante(f, "cafe 500g", "r") == ["produto"]
    assert f.chamadas == 2


def test_erro_500_persistente_pula_so_a_busca(coletor):
    f = FonteComErro([500, 504])
    assert coletor._buscar_tolerante(f, "cafe 500g", "r") == []


@pytest.mark.parametrize("status", [403, 429, 503])
def test_bloqueio_derruba_a_tarefa(coletor, status):
    with pytest.raises(httpx.HTTPStatusError):
        coletor._buscar_tolerante(FonteComErro([status]), "cafe 500g", "r")
