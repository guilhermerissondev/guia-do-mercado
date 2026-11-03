"""Amostra real para validar o catálogo e o casamento (checkpoint M2).

    coletar   -> consulta as redes para um CEP e grava o fixture com os produtos brutos
    relatorio -> roda offline sobre o fixture e gera o relatório de revisão em Markdown

Uso (a partir de collector/):
    GM_CONTACT=voce@exemplo.com .venv/bin/python -m gm.ferramentas.amostra coletar --cep 87013000
    .venv/bin/python -m gm.ferramentas.amostra relatorio
"""

from __future__ import annotations

import argparse
import json
import random
import sys
from collections import defaultdict
from dataclasses import asdict
from pathlib import Path

from gm.casamento import Casador, preco_referencia
from gm.catalogo import carregar
from gm.estatistica import Observacao, faixa
from gm.fontes.http import ClienteEducado
from gm.fontes.osuper import OSuper
from gm.fontes.vtex import ProdutoRede, Vtex

RAIZ = Path(__file__).resolve().parents[2]
FIXTURE = RAIZ / "tests" / "fixtures" / "amostra_maringa.json"
RELATORIO = RAIZ.parent / "docs" / "revisao-casamentos-m2.md"

# Redes do piloto (ver docs/spike-m1.md). Na M3 isto vira configuração no banco.
REDES_VTEX = {"atacadao": "www.atacadao.com.br", "angeloni": "super.angeloni.com.br"}
CONDOR = {"site": "https://www.condor.com.br", "api": "https://api.condor.com.br/storefront/graphql",
          "loja_maringa": "1440"}
MAX_CONDOR_POR_ITEM = 3


def coletar(cep: str) -> None:
    catalogo = carregar()
    casador = Casador(catalogo)
    cliente = ClienteEducado()
    produtos: dict[tuple[str, str], ProdutoRede] = {}
    try:
        for rede, host in REDES_VTEX.items():
            vtex = Vtex(rede, host, cliente)
            rid = vtex.region_id(cep)
            print(f"{rede}: regionId obtido", file=sys.stderr)
            for n, item in enumerate(catalogo.itens.values(), 1):
                for p in vtex.buscar(item.nome, rid):
                    produtos[(p.rede, p.codigo)] = p
                print(f"  {rede} {n}/{len(catalogo.itens)} {item.id}", file=sys.stderr)

        condor = OSuper("condor", CONDOR["site"], CONDOR["api"], cliente)
        por_item: dict[str, list[str]] = defaultdict(list)
        for pid, nome in condor.catalogo_sitemap():
            c = casador.casar(nome)
            if c.item_id and len(por_item[c.item_id]) < MAX_CONDOR_POR_ITEM:
                por_item[c.item_id].append(pid)
        alvo = [pid for pids in por_item.values() for pid in pids]
        print(f"condor: {len(alvo)} produtos candidatos pelo sitemap", file=sys.stderr)
        for n, pid in enumerate(alvo, 1):
            p = condor.produto(pid, CONDOR["loja_maringa"])
            if p:
                produtos[(p.rede, p.codigo)] = p
            if n % 25 == 0:
                print(f"  condor {n}/{len(alvo)}", file=sys.stderr)
    finally:
        cliente.close()

    FIXTURE.parent.mkdir(parents=True, exist_ok=True)
    dados = {"cep": cep, "produtos": [asdict(p) for p in sorted(produtos.values(), key=lambda p: (p.rede, p.codigo))]}
    FIXTURE.write_text(json.dumps(dados, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"{len(produtos)} produtos -> {FIXTURE}", file=sys.stderr)


def _brl(v: float) -> str:
    return f"{v:.2f}".replace(".", ",")


def relatorio() -> None:
    dados = json.loads(FIXTURE.read_text(encoding="utf-8"))
    catalogo = carregar()
    casador = Casador(catalogo)
    produtos = [ProdutoRede(**p) for p in dados["produtos"]]
    redes = sorted({p.rede for p in produtos})

    casados: dict[str, list[tuple[ProdutoRede, float]]] = defaultdict(list)
    ambiguos = []
    for p in produtos:
        if p.preco is None:
            continue
        c = casador.casar(p.nome, p.ean)
        if c.item_id:
            casados[c.item_id].append((p, preco_referencia(catalogo.itens[c.item_id], p.nome, p.preco)))
        elif c.metodo == "ambiguo":
            ambiguos.append((p, c))

    linhas = [
        "# Revisão de casamentos (checkpoint M2)",
        "",
        f"Gerado por `collector/gm/ferramentas/amostra.py` a partir de `{FIXTURE.relative_to(RAIZ.parent)}` "
        f"(CEP {dados['cep']}). Não editar à mão; regerar com `relatorio`.",
        "",
        "## Cobertura por rede",
        "",
        "Critério de escolha de rede (decisão D15): a que cobre mais itens do catálogo na região.",
        "",
        "| Rede | Produtos com preço | Casados com o catálogo | Itens do catálogo cobertos |",
        "|---|---|---|---|",
    ]
    for rede in redes:
        com_preco = sum(1 for p in produtos if p.rede == rede and p.preco is not None)
        casados_rede = [x for lst in casados.values() for x in lst if x[0].rede == rede]
        itens_rede = {iid for iid, lst in casados.items() if any(x[0].rede == rede for x in lst)}
        linhas.append(f"| {rede} | {com_preco} | {len(casados_rede)} | {len(itens_rede)} de {len(catalogo.itens)} |")

    linhas += [
        "",
        "## Faixas por item",
        "",
        "P10 / P50 / P90 com **cada marca contando uma vez por rede** (`collector/gm/estatistica.py`). "
        "Itens a granel em R$/kg; caixas de atacado (ex.: 19 kg) convertidas para kg. As colunas das redes "
        "mostram quantos produtos casaram e o intervalo de preço.",
        "",
        "| Item | " + " | ".join(redes) + " | Econômico (P10) | Típico (P50) | Premium (P90) |",
        "|---|" + "---|" * len(redes) + "---|---|---|",
    ]
    suspeitos = []
    for item in catalogo.itens.values():
        lst = casados.get(item.id, [])
        if not lst:
            linhas.append(f"| {item.nome} | " + " | ".join("–" for _ in redes) + " | – | – | – |")
            continue
        f = faixa([Observacao(p.rede, p.marca, p.nome, ref) for p, ref in lst])
        celulas = []
        for rede in redes:
            pr = [ref for p, ref in lst if p.rede == rede]
            celulas.append("–" if not pr else (f"{len(pr)}: {_brl(min(pr))}–{_brl(max(pr))}" if len(pr) > 1 else f"1: {_brl(pr[0])}"))
        linhas.append(f"| {item.nome} | " + " | ".join(celulas) +
                      f" | {_brl(f.economico)} | {_brl(f.tipico)} | {_brl(f.premium)} |")
        for p, ref in lst:
            if len(lst) >= 3 and (ref > 2.5 * f.tipico or ref < f.tipico / 2.5):
                suspeitos.append((item, p, ref, f.tipico))

    linhas += ["", "## Preços suspeitos (mais de 2,5× acima ou abaixo do típico do item)", ""]
    if suspeitos:
        linhas += ["| Item | Rede | Produto | Preço comparável | Típico do item |", "|---|---|---|---|---|"]
        linhas += [f"| {i.nome} | {p.rede} | {p.nome} | {_brl(r)} | {_brl(m)} |" for i, p, r, m in suspeitos]
    else:
        linhas.append("Nenhum.")

    linhas += ["", "## Ambíguos (vão para revisão)", ""]
    if ambiguos:
        linhas += ["| Rede | Produto | Candidatos |", "|---|---|---|"]
        linhas += [f"| {p.rede} | {p.nome} | {', '.join(c.candidatos)} |" for p, c in ambiguos]
    else:
        linhas.append("Nenhum.")

    todos = [(iid, p) for iid, lst in casados.items() for p, _ in lst]
    amostra = random.Random(42).sample(todos, min(50, len(todos)))
    linhas += [
        "",
        "## Amostra para revisão do tester (50 casamentos)",
        "",
        "Marque `x` em **OK** se o produto é mesmo o item; se não, anote o motivo.",
        "",
        "| OK | Item do catálogo | Rede | Produto na rede | Preço |",
        "|---|---|---|---|---|",
    ]
    linhas += [f"| [ ] | {catalogo.itens[iid].nome} | {p.rede} | {p.nome} | {_brl(p.preco)} |"
               for iid, p in sorted(amostra, key=lambda x: (catalogo.itens[x[0]].categoria, x[0]))]

    RELATORIO.write_text("\n".join(linhas) + "\n", encoding="utf-8")
    print(f"relatório -> {RELATORIO}", file=sys.stderr)


def main() -> int:
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    c = sub.add_parser("coletar")
    c.add_argument("--cep", default="87013000")
    sub.add_parser("relatorio")
    args = ap.parse_args()
    if args.cmd == "coletar":
        coletar(args.cep)
    else:
        relatorio()
    return 0


if __name__ == "__main__":
    sys.exit(main())
