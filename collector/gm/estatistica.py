"""Faixas de preço (econômico / típico / premium) de um item numa região.

Cada marca conta uma vez por rede: a mediana dos produtos daquela marca naquela rede.
Sem isso, uma rede com 17 cafés gourmet ou 5 sabores da mesma marca puxa a faixa toda.
A M3 replica esta regra em SQL.
"""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from statistics import median

from gm.texto import normalizar


@dataclass(frozen=True)
class Observacao:
    rede: str
    marca: str | None
    nome: str
    preco: float


@dataclass(frozen=True)
class Faixa:
    economico: float   # P10
    tipico: float      # P50
    premium: float     # P90
    n_marcas: int      # pontos usados (marca × rede)
    n_produtos: int


def percentil(valores: list[float], p: float) -> float:
    """Interpolação linear, igual ao percentile_cont do Postgres."""
    v = sorted(valores)
    if len(v) == 1:
        return v[0]
    pos = p * (len(v) - 1)
    baixo = int(pos)
    alto = min(baixo + 1, len(v) - 1)
    return v[baixo] + (v[alto] - v[baixo]) * (pos - baixo)


def _chave_marca(o: Observacao) -> str:
    if o.marca and normalizar(o.marca) not in {"", "nao informado", "generico"}:
        return normalizar(o.marca)
    return "nome:" + normalizar(o.nome)  # sem marca confiável, cada produto é um ponto


def faixa(observacoes: list[Observacao]) -> Faixa | None:
    if not observacoes:
        return None
    grupos: dict[tuple[str, str], list[float]] = defaultdict(list)
    for o in observacoes:
        grupos[(o.rede, _chave_marca(o))].append(o.preco)
    pontos = [median(v) for v in grupos.values()]
    return Faixa(
        economico=round(percentil(pontos, 0.1), 2),
        tipico=round(percentil(pontos, 0.5), 2),
        premium=round(percentil(pontos, 0.9), 2),
        n_marcas=len(pontos),
        n_produtos=len(observacoes),
    )
