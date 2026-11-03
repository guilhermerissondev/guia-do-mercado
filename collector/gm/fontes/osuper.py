"""Adaptador OSuper: catálogo pelo sitemap e preço por loja via GraphQL.

Comprovado no spike M1 (docs/spike-m1.md) no Condor. A plataforma não expõe EAN;
o casamento usa o nome do produto.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

from gm.fontes.http import ClienteEducado
from gm.fontes.vtex import ProdutoRede

_RE_PRODUTO = re.compile(r"<loc>https?://[^<]*/produtos/(\d+)/([^<]+)</loc>")

_Q_PRODUTO = """
query Produto($storeId: ID!, $productId: ID!) {
  publicViewer(storeId: $storeId) {
    product(id: $productId, storeId: $storeId, showInactive: true) {
      id name brand { name }
      pricing(storeId: $storeId) { price promotionalPrice }
      quantity(storeId: $storeId) { inStock }
    }
  }
}"""


_Q_LOJAS = """
query Lojas($storeId: ID!) {
  publicViewer(storeId: $storeId) { onlineStores { id name fullAddress { state city } } }
}"""


@dataclass(frozen=True)
class Loja:
    id: str
    nome: str
    cidade: str | None
    uf: str | None  # sigla ou nome por extenso, como a plataforma devolver


class OSuper:
    def __init__(self, rede: str, site: str, api: str, cliente: ClienteEducado):
        self.rede = rede
        self.site = site.rstrip("/")
        self.api = api
        self.cliente = cliente

    def catalogo_sitemap(self) -> list[tuple[str, str]]:
        """(id do produto, nome aproximado a partir do slug da URL)."""
        xml = self.cliente.get(f"{self.site}/sitemap.xml").text
        return [(pid, slug.replace("-", " ")) for pid, slug in _RE_PRODUTO.findall(xml)]

    def _graphql(self, query: str, variaveis: dict) -> dict:
        r = self.cliente.post(
            self.api,
            json={"query": query, "variables": variaveis},
            headers={"Origin": self.site, "Referer": self.site + "/", "Content-Type": "application/json"},
        )
        return (r.json().get("data") or {}).get("publicViewer") or {}

    def lojas(self, loja_qualquer: str) -> list[Loja]:
        """Lojas online da rede. A API exige o id de uma loja qualquer como contexto."""
        dados = self._graphql(_Q_LOJAS, {"storeId": loja_qualquer})
        return [
            Loja(str(l["id"]), l["name"], (l.get("fullAddress") or {}).get("city"),
                 (l.get("fullAddress") or {}).get("state"))
            for l in dados.get("onlineStores") or []
        ]

    def produto(self, produto_id: str, loja_id: str) -> ProdutoRede | None:
        p = self._graphql(_Q_PRODUTO, {"storeId": loja_id, "productId": produto_id}).get("product")
        if not p:
            return None
        em_estoque = (p.get("quantity") or {}).get("inStock")
        precos = p.get("pricing") or {}
        preco = precos.get("promotionalPrice") or precos.get("price")
        return ProdutoRede(
            rede=self.rede,
            codigo=str(p["id"]),
            nome=p.get("name", ""),
            marca=(p.get("brand") or {}).get("name"),
            ean=None,
            preco=float(preco) if preco and em_estoque else None,
        )
