"""Gera supabase/seed/01_geo.sql a partir da API de localidades do IBGE.

Uso (a partir da raiz do repo):
    python3 -I tools/gen_geo_seed.py

Só usa a biblioteca padrão. O SQL gerado é determinístico (ordenado por id),
então o diff no git mostra apenas mudanças reais do IBGE.
"""

import gzip
import json
import sys
import urllib.request
from pathlib import Path

URL = "https://servicodados.ibge.gov.br/api/v1/localidades/municipios"
OUT = Path(__file__).resolve().parent.parent / "supabase" / "seed" / "01_geo.sql"


def q(texto: str) -> str:
    return "'" + texto.replace("'", "''") + "'"


def main() -> int:
    with urllib.request.urlopen(URL, timeout=60) as resp:
        corpo = resp.read()
    if corpo[:2] == b"\x1f\x8b":  # a API do IBGE pode responder em gzip mesmo sem pedir
        corpo = gzip.decompress(corpo)
    dados = json.loads(corpo)

    ufs, intermediarias, imediatas, municipios = {}, {}, {}, {}
    for m in dados:
        imediata = m["regiao-imediata"]
        intermediaria = imediata["regiao-intermediaria"]
        uf = intermediaria["UF"]
        ufs[uf["id"]] = (uf["sigla"], uf["nome"])
        intermediarias[intermediaria["id"]] = (intermediaria["nome"], uf["id"])
        imediatas[imediata["id"]] = (imediata["nome"], intermediaria["id"])
        municipios[m["id"]] = (m["nome"], imediata["id"])

    linhas = ["-- Gerado por tools/gen_geo_seed.py. Não editar à mão.", "begin;"]
    for id_, (sigla, nome) in sorted(ufs.items()):
        linhas.append(f"insert into uf (id, sigla, nome) values ({id_}, {q(sigla)}, {q(nome)});")
    for id_, (nome, uf_id) in sorted(intermediarias.items()):
        linhas.append(
            f"insert into regiao_intermediaria (id, nome, uf_id) values ({id_}, {q(nome)}, {uf_id});"
        )
    for id_, (nome, inter_id) in sorted(imediatas.items()):
        linhas.append(
            "insert into regiao_imediata (id, nome, regiao_intermediaria_id) "
            f"values ({id_}, {q(nome)}, {inter_id});"
        )
    for id_, (nome, imed_id) in sorted(municipios.items()):
        linhas.append(
            f"insert into municipio (id, nome, regiao_imediata_id) values ({id_}, {q(nome)}, {imed_id});"
        )
    linhas.append("commit;")

    OUT.write_text("\n".join(linhas) + "\n", encoding="utf-8")
    print(
        f"{len(ufs)} UFs, {len(intermediarias)} intermediárias, "
        f"{len(imediatas)} imediatas, {len(municipios)} municípios -> {OUT}"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
