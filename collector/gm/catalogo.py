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
    max_unidades: int | None
    termos: tuple[str, ...]
    algum: tuple[str, ...]
    excluir: tuple[str, ...]
    comeca_com: tuple[str, ...]
    buscas: tuple[str, ...]   # textos enviados à busca das lojas
    nome_normalizado: str = field(compare=False)


@dataclass(frozen=True)
class Catalogo:
    categorias: dict[str, Categoria]
    itens: dict[str, Item]


def _buscas(bruto: dict, granel: bool) -> tuple[str, ...]:
    """O nome do item e uma busca curta ("café 500g").

    A busca das lojas VTEX exige quase todas as palavras: com o nome completo ("Café torrado e
    moído 500 g") o Atacadão devolve 2 produtos; com "café 500g", 24. Cada uma acha coisas que a
    outra não acha, então o coletor faz as duas. `busca` no catálogo substitui a curta.
    """
    if "busca" in bruto:
        curtas = [bruto["busca"]] if isinstance(bruto["busca"], str) else list(bruto["busca"])
    else:
        palavras = list(bruto.get("termos", []))[:2] + list(bruto.get("algum", []))[:1]
        tamanho = "" if granel else " " + bruto["conteudo"].replace("un", " unidades")
        curtas = [" ".join(palavras) + tamanho]
    vistas: dict[str, None] = {}
    for b in [bruto["nome"], *curtas]:
        vistas.setdefault(b.strip(), None)
    return tuple(vistas)


def carregar(caminho: Path = CAMINHO_PADRAO) -> Catalogo:
    dados = tomllib.loads(caminho.read_text(encoding="utf-8"))
    categorias = {c["id"]: Categoria(c["id"], c["nome"]) for c in dados.get("categoria", [])}
    # exclusões que valem para todos os itens (ração, versões veganas)
    excluir_sempre = tuple(normalizar(t) for t in dados.get("excluir_sempre", []))
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
            max_unidades=bruto.get("max_unidades"),
            termos=termos,
            algum=algum,
            excluir=tuple(normalizar(t) for t in bruto.get("excluir", [])) + excluir_sempre,
            comeca_com=comeca_com,
            buscas=_buscas(bruto, granel),
            nome_normalizado=normalizar(bruto["nome"]),
        )
    return Catalogo(categorias, itens)
