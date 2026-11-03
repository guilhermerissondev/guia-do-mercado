"""Gera supabase/seed/02_catalogo.sql a partir de catalogo/itens.toml.

Uso (a partir de collector/):
    .venv/bin/python -m gm.ferramentas.seed_catalogo
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

from gm.catalogo import Item, carregar
from gm.texto import normalizar

RAIZ = Path(__file__).resolve().parents[3]
SAIDA = RAIZ / "supabase" / "seed" / "02_catalogo.sql"
SAIDA_BOT = RAIZ / "bot" / "test" / "fixtures" / "catalogo.json"  # catálogo para os testes do bot

# Redes do piloto, comprovadas no spike M1. Novas redes entram aqui (e, na M3, pela configuração no banco).
REDES = [
    ("atacadao", "Atacadão", "vtex", '{"host": "www.atacadao.com.br"}'),
    ("angeloni", "Angeloni", "vtex", '{"host": "super.angeloni.com.br"}'),
    ("condor", "Condor", "osuper",
     '{"site": "https://www.condor.com.br", "api": "https://api.condor.com.br/storefront/graphql", '
     '"loja_contexto": "1441"}'),
]


def q(texto: str) -> str:
    return "'" + texto.replace("'", "''") + "'"


_VAZIAS = {"de", "do", "da", "e", "em", "com", "para", "tipo", "sem", "un"}


def palavras_busca(i: Item) -> str:
    """Palavras que o usuário pode digitar para chegar ao item (nome + regras do catálogo)."""
    fontes = [i.nome_normalizado, *i.termos, *i.algum, *i.comeca_com]
    vistas: list[str] = []
    for f in fontes:
        for p in normalizar(f).split():
            if len(p) > 1 and p not in _VAZIAS and p not in vistas:
                vistas.append(p)
    return " ".join(vistas)


def gerar() -> str:
    cat = carregar()
    linhas = ["-- Gerado por collector/gm/ferramentas/seed_catalogo.py. Não editar à mão.", "begin;"]
    for c in cat.categorias.values():
        linhas.append(f"insert into categoria (id, nome) values ({q(c.id)}, {q(c.nome)});")
    for ordem, i in enumerate(cat.itens.values()):
        if i.granel:
            valor, unidade = "null", "null"
        else:
            valor, unidade = f"{i.conteudo.valor:g}", q(i.conteudo.unidade)
        linhas.append(
            "insert into item_canonico (id, nome, categoria_id, conteudo_valor, conteudo_unidade, granel, busca, ordem) "
            f"values ({q(i.id)}, {q(i.nome)}, {q(i.categoria)}, {valor}, {unidade}, {str(i.granel).lower()}, "
            f"{q(palavras_busca(i))}, {ordem});"
        )
    for rid, nome, plataforma, config in REDES:
        linhas.append(
            f"insert into rede (id, nome, plataforma, config) values ({q(rid)}, {q(nome)}, {q(plataforma)}, {q(config)}::jsonb);"
        )
    linhas.append("commit;")
    return "\n".join(linhas) + "\n"


def catalogo_bot() -> str:
    cat = carregar()
    itens = [
        {"id": i.id, "nome": i.nome, "busca": palavras_busca(i), "granel": i.granel,
         "conteudoValor": None if i.granel else i.conteudo.valor,
         "conteudoUnidade": None if i.granel else i.conteudo.unidade, "ordem": n}
        for n, i in enumerate(cat.itens.values())
    ]
    return json.dumps(itens, ensure_ascii=False, indent=1) + "\n"


def main() -> int:
    SAIDA.write_text(gerar(), encoding="utf-8")
    SAIDA_BOT.parent.mkdir(parents=True, exist_ok=True)
    SAIDA_BOT.write_text(catalogo_bot(), encoding="utf-8")
    print(f"seed -> {SAIDA}\ncatálogo do bot -> {SAIDA_BOT}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
