"""Gera supabase/seed/02_catalogo.sql a partir de catalogo/itens.toml.

Uso (a partir de collector/):
    .venv/bin/python -m gm.ferramentas.seed_catalogo
"""

from __future__ import annotations

import sys
from pathlib import Path

from gm.catalogo import carregar

SAIDA = Path(__file__).resolve().parents[3] / "supabase" / "seed" / "02_catalogo.sql"

# Redes do piloto, comprovadas no spike M1. Novas redes entram aqui (e, na M3, pela configuração no banco).
REDES = [
    ("atacadao", "Atacadão", "vtex", '{"host": "www.atacadao.com.br"}'),
    ("angeloni", "Angeloni", "vtex", '{"host": "super.angeloni.com.br"}'),
    ("condor", "Condor", "osuper",
     '{"site": "https://www.condor.com.br", "api": "https://api.condor.com.br/storefront/graphql"}'),
]


def q(texto: str) -> str:
    return "'" + texto.replace("'", "''") + "'"


def gerar() -> str:
    cat = carregar()
    linhas = ["-- Gerado por collector/gm/ferramentas/seed_catalogo.py. Não editar à mão.", "begin;"]
    for c in cat.categorias.values():
        linhas.append(f"insert into categoria (id, nome) values ({q(c.id)}, {q(c.nome)});")
    for i in cat.itens.values():
        if i.granel:
            valor, unidade = "null", "null"
        else:
            valor, unidade = f"{i.conteudo.valor:g}", q(i.conteudo.unidade)
        linhas.append(
            "insert into item_canonico (id, nome, categoria_id, conteudo_valor, conteudo_unidade, granel) "
            f"values ({q(i.id)}, {q(i.nome)}, {q(i.categoria)}, {valor}, {unidade}, {str(i.granel).lower()});"
        )
    for rid, nome, plataforma, config in REDES:
        linhas.append(
            f"insert into rede (id, nome, plataforma, config) values ({q(rid)}, {q(nome)}, {q(plataforma)}, {q(config)}::jsonb);"
        )
    linhas.append("commit;")
    return "\n".join(linhas) + "\n"


def main() -> int:
    SAIDA.write_text(gerar(), encoding="utf-8")
    print(f"seed -> {SAIDA}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
