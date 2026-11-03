import tomllib

import pytest

from gm.ferramentas.mapear_redes import CANDIDATAS, _robots_proibe_api


@pytest.mark.parametrize(
    "robots, proibe",
    [
        ("User-agent: *\nDisallow: /api/\n", True),
        ("User-agent: *\nDisallow: /\n", True),
        ("User-agent: *\nDisallow: /busca/\nDisallow: /checkout\n", False),   # Carrefour/Atacadão: só a busca HTML
        ("User-agent: Googlebot\nDisallow: /api/\nUser-agent: *\nAllow: /\n", False),  # regra de outro robô
        ("User-agent: *\nDisallow:\n", False),                                 # Disallow vazio = tudo liberado
        ("# comentário\nUser-agent: *\nDisallow: /api # privada\n", True),
    ],
)
def test_robots(robots, proibe):
    assert _robots_proibe_api(robots) is proibe


def test_candidatas_validas():
    redes = tomllib.loads(CANDIDATAS.read_text(encoding="utf-8"))["rede"]
    ids = [r["id"] for r in redes]
    assert len(ids) == len(set(ids)), "id de rede duplicado"
    ufs_validas = {"AC", "AL", "AM", "AP", "BA", "CE", "DF", "ES", "GO", "MA", "MG", "MS", "MT", "PA", "PB", "PE",
                   "PI", "PR", "RJ", "RN", "RO", "RR", "RS", "SC", "SE", "SP", "TO"}
    for r in redes:
        assert r["dominios"], r["id"]
        assert set(r["ufs"]) <= ufs_validas, r["id"]
    # Decisões do dono do produto e bloqueios não podem voltar por engano
    excluidas = {r["id"] for r in redes if r.get("excluida")}
    assert {"muffato", "carrefour", "assai", "paodeacucar"} <= excluidas
