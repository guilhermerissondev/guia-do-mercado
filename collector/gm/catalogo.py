"""Carga do catálogo canônico (catalogo/itens.toml)."""

from __future__ import annotations

import tomllib
from dataclasses import dataclass, field
from pathlib import Path

from gm.texto import Conteudo, normalizar, parse_conteudo

CAMINHO_PADRAO = Path(__file__).resolve().parent.parent / "catalogo" / "itens.toml"


@dataclass(frozen=True)
class Categoria:
    id: str
    nome: str


@dataclass(frozen=True)
class Item:
    id: str
    nome: str
    categoria: str
    conteudo: Conteudo | None
    granel: bool
    permite_unidades: bool
    termos: tuple[str, ...]
    algum: tuple[str, ...]
    excluir: tuple[str, ...]
    comeca_com: tuple[str, ...]
    nome_normalizado: str = field(compare=False)


@dataclass(frozen=True)
class Catalogo:
    categorias: dict[str, Categoria]
    itens: dict[str, Item]


def carregar(caminho: Path = CAMINHO_PADRAO) -> Catalogo:
    dados = tomllib.loads(caminho.read_text(encoding="utf-8"))
    categorias = {c["id"]: Categoria(c["id"], c["nome"]) for c in dados.get("categoria", [])}
    itens: dict[str, Item] = {}
    for bruto in dados.get("item", []):
        iid = bruto["id"]
        if iid in itens:
            raise ValueError(f"item duplicado no catálogo: {iid}")
        if bruto["categoria"] not in categorias:
            raise ValueError(f"{iid}: categoria desconhecida {bruto['categoria']!r}")
        granel = bool(bruto.get("granel", False))
        if granel == ("conteudo" in bruto):
            raise ValueError(f"{iid}: defina 'conteudo' ou 'granel = true' (exatamente um)")
        termos = tuple(normalizar(t) for t in bruto.get("termos", []))
        algum = tuple(normalizar(t) for t in bruto.get("algum", []))
        if not termos and not algum:
            raise ValueError(f"{iid}: precisa de 'termos' ou 'algum'")
        comeca_com = tuple(normalizar(t) for t in bruto.get("comeca_com", []))
        if granel and not comeca_com:
            raise ValueError(f"{iid}: item a granel precisa de 'comeca_com'")
        itens[iid] = Item(
            id=iid,
            nome=bruto["nome"],
            categoria=bruto["categoria"],
            conteudo=None if granel else parse_conteudo(bruto["conteudo"]),
            granel=granel,
            permite_unidades=bool(bruto.get("permite_unidades", False)),
            termos=termos,
            algum=algum,
            excluir=tuple(normalizar(t) for t in bruto.get("excluir", [])),
            comeca_com=comeca_com,
            nome_normalizado=normalizar(bruto["nome"]),
        )
    return Catalogo(categorias, itens)
