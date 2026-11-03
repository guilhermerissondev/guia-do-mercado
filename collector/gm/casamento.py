"""Casamento de um produto de rede com um item do catálogo canônico.

Ordem: EAN já conhecido → regras do catálogo (termos, exclusões, tamanho) →
desempate por similaridade de texto. O que fica ambíguo vai para revisão
(e, numa etapa futura, para o LLM).
"""

from __future__ import annotations

from dataclasses import dataclass

from rapidfuzz import fuzz

from gm.catalogo import Catalogo, Item
from gm.texto import Conteudo, Embalagem, contem, extrair_embalagem, normalizar

# Diferença mínima de similaridade para escolher entre dois candidatos igualmente específicos.
MARGEM_DESEMPATE = 5.0


@dataclass(frozen=True)
class Casamento:
    item_id: str | None
    metodo: str               # "ean", "regra", "ambiguo", "sem_item"
    confianca: float          # 0 a 100
    candidatos: tuple[str, ...] = ()
    motivo: str = ""


def _passa_regras(item: Item, nome: str, emb: Embalagem) -> bool:
    if not all(contem(nome, t) for t in item.termos):
        return False
    if item.algum and not any(contem(nome, t) for t in item.algum):
        return False
    if any(contem(nome, t) for t in item.excluir):
        return False
    if item.comeca_com and not any(contem(nome[: len(t) + 1], t) for t in item.comeca_com):
        return False
    if emb.multipack:
        return False
    if item.granel:
        # sem tamanho ("Tomate Kg") ou caixa em kg ("Cebola 19kg"); embalagem em gramas é outro produto
        return emb.medida is None or (emb.medida.unidade == "g" and emb.medida.valor >= 1000)
    alvo = item.conteudo
    if alvo.unidade == "un":
        return emb.contagem is not None and alvo.equivale(Conteudo(emb.contagem, "un"))
    if emb.medida is None or not alvo.equivale(emb.medida):
        return False
    # tamanho + contagem > 1 sem permissão explícita = várias unidades juntas (ex.: lata 350 ml c/12)
    return item.permite_unidades or not emb.contagem or emb.contagem == 1


def preco_referencia(item: Item, nome: str, preco: float) -> float:
    """Preço comparável entre produtos do mesmo item: por kg quando a granel."""
    if not item.granel:
        return preco
    emb = extrair_embalagem(normalizar(nome))
    if emb.medida and emb.medida.unidade == "g" and emb.medida.valor >= 1000:
        return round(preco / (emb.medida.valor / 1000), 2)
    return preco


def _especificidade(item: Item) -> int:
    return len(item.termos) + (1 if item.algum else 0)


class Casador:
    def __init__(self, catalogo: Catalogo, eans: dict[str, str] | None = None):
        self.catalogo = catalogo
        self.eans = dict(eans or {})

    def casar(self, nome: str, ean: str | None = None) -> Casamento:
        if ean and ean in self.eans:
            return Casamento(self.eans[ean], "ean", 100.0, motivo=f"EAN {ean} já mapeado")

        n = normalizar(nome)
        emb = extrair_embalagem(n)
        candidatos = [i for i in self.catalogo.itens.values() if _passa_regras(i, n, emb)]
        if not candidatos:
            return Casamento(None, "sem_item", 0.0, motivo="nenhum item do catálogo passa nas regras")

        pontuados = sorted(
            ((_especificidade(i), fuzz.token_set_ratio(n, i.nome_normalizado), i) for i in candidatos),
            key=lambda x: (x[0], x[1]),
            reverse=True,
        )
        esp, score, melhor = pontuados[0]
        if len(pontuados) > 1:
            esp2, score2, _ = pontuados[1]
            if esp2 == esp and score - score2 < MARGEM_DESEMPATE:
                return Casamento(
                    None, "ambiguo", score,
                    candidatos=tuple(p[2].id for p in pontuados[:3]),
                    motivo="mais de um item compatível com especificidade e similaridade próximas",
                )
        return Casamento(melhor.id, "regra", score, candidatos=tuple(p[2].id for p in pontuados[:3]))

    def aprender_ean(self, ean: str, item_id: str) -> None:
        """Registra um EAN confirmado para pular as regras nas próximas vezes."""
        self.eans[ean] = item_id
