"""Normalização de nomes de produto e extração do tamanho da embalagem."""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass

# Unidade base: g (massa), ml (volume), un (contagem).
_MASSA = {"kg": 1000, "kgs": 1000, "quilo": 1000, "quilos": 1000,
          "g": 1, "gr": 1, "grs": 1, "grama": 1, "gramas": 1, "mg": 0.001}
_VOLUME = {"l": 1000, "lt": 1000, "lts": 1000, "litro": 1000, "litros": 1000, "ml": 1}
_UNIDADES_MEDIDA = "|".join(sorted({*_MASSA, *_VOLUME}, key=len, reverse=True))
_UNIDADES_CONTAGEM = r"un|uni|und|unid|unidade|unidades|rolo|rolos|peca|pecas|sache|saches"

_RE_MULTIPACK = re.compile(rf"\b(\d+)\s*x\s*(\d+(?:\.\d+)?)\s*({_UNIDADES_MEDIDA})\b")
_RE_MEDIDA = re.compile(rf"(?<![a-z0-9.])(\d+(?:\.\d+)?)\s*({_UNIDADES_MEDIDA})\b")
_RE_CONTAGEM = re.compile(rf"(?<![a-z0-9.])(\d+)\s*({_UNIDADES_CONTAGEM})\b")
_RE_COM_N = re.compile(r"\bc\s+(\d+)\b")  # "c/12" vira "c 12" depois da normalização
# "cada" aparece em pacotes ("85g cada leve 6 pague menos", "3 cremes de 90g cada")
_RE_PACOTE = re.compile(
    r"\b(kit|pack|fardo|cada|leve \d+|lv \d+ pg \d+|promo \d+|caixa com \d+"
    r"|com \d+ (?:cremes|pacotes|latas|frascos|caixas|sabonetes|tubos))\b"
)


def normalizar(texto: str) -> str:
    """Minúsculas, sem acento, vírgula decimal vira ponto, pontuação vira espaço."""
    t = unicodedata.normalize("NFKD", texto)
    t = "".join(c for c in t if not unicodedata.combining(c)).lower()
    t = re.sub(r"(?<=\d),(?=\d)", ".", t)
    t = re.sub(r"[^a-z0-9.]+", " ", t)
    t = re.sub(r"(?<!\d)\.|\.(?!\d)", " ", t)  # ponto só sobrevive entre dígitos
    return re.sub(r"\s+", " ", t).strip()


@dataclass(frozen=True)
class Conteudo:
    """Tamanho da embalagem em unidade base."""

    valor: float
    unidade: str  # "g", "ml" ou "un"

    def equivale(self, outro: Conteudo, tolerancia: float = 0.02) -> bool:
        if self.unidade != outro.unidade:
            return False
        return abs(self.valor - outro.valor) <= tolerancia * max(self.valor, outro.valor)


def _medida(valor: str, unidade: str) -> Conteudo:
    v = float(valor)
    if unidade in _MASSA:
        return Conteudo(round(v * _MASSA[unidade], 3), "g")
    return Conteudo(round(v * _VOLUME[unidade], 3), "ml")


def parse_conteudo(spec: str) -> Conteudo:
    """Converte a especificação do catálogo ("1l", "500g", "12un", "1.6kg")."""
    s = normalizar(spec).replace(" ", "")
    m = re.fullmatch(r"(\d+(?:\.\d+)?)(un)", s)
    if m:
        return Conteudo(float(m.group(1)), "un")
    m = re.fullmatch(rf"(\d+(?:\.\d+)?)({_UNIDADES_MEDIDA})", s)
    if not m:
        raise ValueError(f"conteúdo inválido no catálogo: {spec!r}")
    return _medida(m.group(1), m.group(2))


@dataclass(frozen=True)
class Embalagem:
    """O que se extraiu do nome do produto sobre a embalagem."""

    medida: Conteudo | None   # massa ou volume
    contagem: int | None      # unidades na embalagem
    multipack: bool           # várias embalagens vendidas juntas (6x1l, kit, fardo)


def extrair_embalagem(nome_normalizado: str) -> Embalagem:
    t = nome_normalizado
    mp = _RE_MULTIPACK.search(t)
    if mp:
        return Embalagem(_medida(mp.group(2), mp.group(3)), int(mp.group(1)), True)

    medida = None
    m = _RE_MEDIDA.search(t)
    if m:
        medida = _medida(m.group(1), m.group(2))

    contagem = None
    c = _RE_CONTAGEM.search(t) or _RE_COM_N.search(t)
    if c:
        contagem = int(c.group(1))
    elif re.search(r"\bduzia\b", t):
        contagem = 12

    return Embalagem(medida, contagem, bool(_RE_PACOTE.search(t)))


def contem(texto_normalizado: str, termo_normalizado: str) -> bool:
    """O termo aparece como palavra (ou expressão) inteira."""
    padrao = rf"(?<![a-z0-9]){re.escape(termo_normalizado)}(?![a-z0-9])"
    return re.search(padrao, texto_normalizado) is not None
