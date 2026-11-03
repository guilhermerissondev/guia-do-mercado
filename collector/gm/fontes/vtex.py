"""Adaptador VTEX: região por CEP e busca inteligente regionalizada.

Comprovado no spike M1 (docs/spike-m1.md) em Atacadão e Angeloni.
"""

from __future__ import annotations

from dataclasses import dataclass

from gm.fontes.http import ClienteEducado


@dataclass(frozen=True)
class ProdutoRede:
    rede: str
    codigo: str          # id do produto/SKU na rede
    nome: str
    marca: str | None
    ean: str | None
    preco: float | None  # preço para a região consultada; None se indisponível


class Vtex:
    def __init__(self, rede: str, host: str, cliente: ClienteEducado):
        self.rede = rede
        self.base = f"https://{host}"
        self.cliente = cliente

    def region_id(self, cep: str) -> str | None:
        r = self.cliente.get(f"{self.base}/api/checkout/pub/regions",
                             params={"country": "BRA", "postalCode": cep})
        dados = r.json()
        return dados[0]["id"] if dados else None

    def buscar(self, termo: str, region_id: str, quantidade: int = 24) -> list[ProdutoRede]:
        r = self.cliente.get(
            f"{self.base}/api/io/_v/api/intelligent-search/product_search/",
            params={"query": termo, "count": quantidade, "page": 1,
                    "regionId": region_id, "hideUnavailableItems": "true"},
        )
        return [p for p in (self._converter(bruto) for bruto in r.json().get("products", [])) if p]

    def _converter(self, p: dict) -> ProdutoRede | None:
        itens = p.get("items") or []
        if not itens:
            return None
        sku = itens[0]
        preco = None
        for s in sku.get("sellers", []):
            oferta = s.get("commertialOffer") or {}
            if oferta.get("AvailableQuantity") and oferta.get("Price"):
                preco = float(oferta["Price"])
                break
        return ProdutoRede(
            rede=self.rede,
            codigo=str(sku.get("itemId") or p.get("productId")),
            nome=p.get("productName", ""),
            marca=p.get("brand"),
            ean=sku.get("ean") or None,
            preco=preco,
        )
