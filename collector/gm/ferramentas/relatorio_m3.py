"""Relatório do checkpoint M3: preço base de uma região, para conferência na gôndola.

Uso (a partir de collector/, com DATABASE_URL):
    .venv/bin/python -m gm.ferramentas.relatorio_m3 --municipio 4115200
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from gm.db import conectar

SAIDA = Path(__file__).resolve().parents[3] / "docs" / "validacao-m3.md"

# Itens de compra comum para conferir na gôndola.
ITENS_CONFERENCIA = [
    "arroz-branco-5kg", "feijao-carioca-1kg", "acucar-refinado-1kg", "cafe-torrado-moido-500g",
    "oleo-soja-900ml", "leite-integral-1l", "farinha-trigo-1kg", "macarrao-espaguete-500g",
    "molho-tomate-300g", "sal-refinado-1kg", "margarina-500g", "ovos-brancos-12un",
    "papel-higienico-12un", "detergente-liquido-500ml", "sabao-po-1-6kg", "creme-dental-90g",
    "banana-prata-kg", "tomate-kg", "batata-kg", "peito-frango-kg",
]

NIVEL = {"imediata": "região imediata", "intermediaria": "região intermediária", "uf": "estado", "brasil": "Brasil"}


def _brl(v) -> str:
    return "–" if v is None else f"{float(v):.2f}".replace(".", ",")


def gerar(municipio: int) -> str:
    conn = conectar()
    conn.execute("set timezone = 'America/Sao_Paulo'")
    g = conn.execute("select * from geo where municipio_ibge = %s", (municipio,)).fetchone()
    redes = conn.execute(
        """select rr.*, r.nome from rede_regiao rr join rede r on r.id = rr.rede_id
            where rr.regiao_imediata = %s order by rr.selecionada desc, rr.itens_cobertos desc""",
        (g["regiao_imediata"],),
    ).fetchall()
    total_itens = conn.execute("select count(*) as n from item_canonico").fetchone()["n"]
    selecionadas = [r for r in redes if r["selecionada"]]

    linhas = [
        f"# Checkpoint M3: preço base de {g['municipio']}-{g['uf']}",
        "",
        f"Gerado por `collector/gm/ferramentas/relatorio_m3.py` (região imediata {g['regiao_imediata_nome']}, "
        f"código {g['regiao_imediata']}). Não editar à mão, exceto as colunas de gôndola.",
        "",
        "## Redes avaliadas na região",
        "",
        "Seleção automática (D15): até 3 redes que cobrem mais itens do catálogo.",
        "",
        "| Rede | Atende | Itens cobertos | Produtos com preço | Selecionada | Avaliada em |",
        "|---|---|---|---|---|---|",
    ]
    for r in redes:
        linhas.append(
            f"| {r['nome']} | {'sim' if r['atende'] else 'não'} | {r['itens_cobertos']} de {total_itens} | "
            f"{r['produtos_com_preco']} | {'**sim**' if r['selecionada'] else 'não'} | "
            f"{r['avaliado_em']:%d/%m/%Y %H:%M} |"
        )

    cobertura = conn.execute(
        """select count(distinct i.id) filter (where e.p50 is not null) as com, count(distinct i.id) as total
             from item_canonico i
             left join lateral estimativa(i.id, %s) e on true""",
        (municipio,),
    ).fetchone()
    linhas += [
        "",
        f"**Itens do catálogo com estimativa para {g['municipio']}: {cobertura['com']} de {cobertura['total']}.** "
        "Os demais: o bot pergunta o valor ao usuário.",
        "",
        "## Conferência na gôndola (20 itens)",
        "",
        "Faixa da região: econômico (P10), típico (P50), premium (P90). Nas colunas das redes, o menor e o maior "
        "preço encontrados para o item. Granel em R$/kg.",
        "",
        "Preencha **Gôndola**: mercado, marca e preço que você viu. **Na faixa?**: sim se o preço ficou entre o "
        "econômico e o premium.",
        "",
        "| Item | Econômico | Típico | Premium | " + " | ".join(r["nome"] for r in selecionadas)
        + " | Gôndola (mercado, marca, preço) | Na faixa? |",
        "|---|---|---|---|" + "---|" * len(selecionadas) + "---|---|",
    ]
    for item_id in ITENS_CONFERENCIA:
        nome = conn.execute("select nome from item_canonico where id = %s", (item_id,)).fetchone()["nome"]
        e = conn.execute("select * from estimativa(%s, %s)", (item_id, municipio)).fetchone()
        celulas = []
        for r in selecionadas:
            mm = conn.execute(
                """select min(preco_ref) as mn, max(preco_ref) as mx from (
                     select distinct on (codigo) preco_ref from preco_obs
                      where rede_id = %s and regiao_imediata = %s and item_canonico_id = %s
                      order by codigo, coletado_em desc) u""",
                (r["rede_id"], g["regiao_imediata"], item_id),
            ).fetchone()
            celulas.append("–" if mm["mn"] is None else f"{_brl(mm['mn'])}–{_brl(mm['mx'])}")
        faixa = [_brl(e["p10"]), _brl(e["p50"]), _brl(e["p90"])] if e else ["–", "–", "–"]
        origem = "" if not e or e["nivel"] == "imediata" else f" ({NIVEL[e['nivel']]})"
        linhas.append(f"| {nome}{origem} | " + " | ".join(faixa) + " | " + " | ".join(celulas) + " |  |  |")

    tarefas = conn.execute(
        """select rede_id, status, n_precos, iniciada_em, concluida_em, erro from coleta_tarefa
            where regiao_imediata = %s order by id desc limit 10""",
        (g["regiao_imediata"],),
    ).fetchall()
    linhas += ["", "## Últimas coletas", "", "| Rede | Status | Preços | Duração | Erro |", "|---|---|---|---|---|"]
    for t in tarefas:
        dur = "–"
        if t["iniciada_em"] and t["concluida_em"]:
            dur = f"{(t['concluida_em'] - t['iniciada_em']).total_seconds() / 60:.1f} min"
        linhas.append(f"| {t['rede_id']} | {t['status']} | {t['n_precos'] or 0} | {dur} | {t['erro'] or ''} |")
    conn.close()
    return "\n".join(linhas) + "\n"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--municipio", type=int, required=True)
    args = ap.parse_args()
    SAIDA.write_text(gerar(args.municipio), encoding="utf-8")
    print(f"relatório -> {SAIDA}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
