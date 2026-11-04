"""Coleta de preço base: executa a fila `coleta_tarefa` (uma rede numa região imediata).

Uso (a partir de collector/, com DATABASE_URL e GM_CONTACT definidos):
    python -m gm.coleta ativar --municipio 4115200                   # ativa a região do município
    python -m gm.coleta lojas                                        # sincroniza lojas das redes OSuper
    python -m gm.coleta agendar                                      # cria tarefas vencidas
    python -m gm.coleta rodar                                        # executa a fila e recalcula as faixas
    python -m gm.coleta recalcular                                   # só recalcula as faixas
    python -m gm.coleta recasar                                      # reaplica regras novas ao que já foi coletado

Nada aqui conhece cidade ou estado específico: rede e região vêm do banco.
"""

from __future__ import annotations

import argparse
import logging
import sys
from collections import defaultdict
from dataclasses import dataclass
from typing import Callable, Iterable

import psycopg

from gm.casamento import Casador, Casamento, preco_referencia
from gm.catalogo import Catalogo, carregar
from gm.db import conectar
from gm.fontes.http import ClienteEducado
from gm.fontes.osuper import OSuper
from gm.fontes.vtex import ProdutoRede, Vtex

log = logging.getLogger("gm.coleta")

MAX_TENTATIVAS = 3
MAX_PRODUTOS_OSUPER_POR_ITEM = 10  # sem busca por região, cada produto custa uma requisição


@dataclass(frozen=True)
class Resultado:
    atende: bool
    referencia: str | None
    produtos: list[ProdutoRede]


# Fábrica de adaptadores: (linha da tabela rede, cliente HTTP) -> adaptador. Substituível nos testes.
FabricaFonte = Callable[[dict, ClienteEducado], object]


def fonte_padrao(rede: dict, cliente: ClienteEducado):
    cfg = rede["config"]
    if rede["plataforma"] == "vtex":
        return Vtex(rede["id"], cfg["host"], cliente)
    if rede["plataforma"] == "osuper":
        return OSuper(rede["id"], cfg["site"], cfg["api"], cliente)
    raise ValueError(f"plataforma desconhecida: {rede['plataforma']}")


class Coletor:
    def __init__(self, conn: psycopg.Connection, catalogo: Catalogo | None = None,
                 fabrica: FabricaFonte = fonte_padrao, cliente: ClienteEducado | None = None):
        self.conn = conn
        self.catalogo = catalogo or carregar()
        self.fabrica = fabrica
        self.cliente = cliente or ClienteEducado()
        eans = {r["ean"]: r["item_canonico_id"] for r in conn.execute("select ean, item_canonico_id from ean_item")}
        self.casador = Casador(self.catalogo, eans)
        # Regiões com a mesma região VTEX têm os mesmos preços: busca uma vez por execução.
        self._cache_vtex: dict[tuple[str, str], list[ProdutoRede]] = {}

    # ------------------------------------------------------------------ coleta por plataforma

    def _coletar_vtex(self, fonte: Vtex, cep: str, regionaliza: bool = True) -> Resultado:
        region_id = fonte.region_id(cep)
        if not region_id:
            return Resultado(False, None, [])
        chave = (fonte.rede, region_id)
        if regionaliza and chave in self._cache_vtex:
            produtos_cache = self._cache_vtex[chave]
            log.info("%s: região VTEX já coletada nesta execução, reaproveitando %s produtos", fonte.rede, len(produtos_cache))
            return Resultado(any(p.preco for p in produtos_cache), region_id, produtos_cache)
        produtos: dict[str, ProdutoRede] = {}
        buscas = [b for item in self.catalogo.itens.values() for b in item.buscas]
        for busca in dict.fromkeys(buscas):
            for p in fonte.buscar(busca, region_id):
                produtos[p.codigo] = p
                if not regionaliza and len(produtos) == 1 and p.preco and p.vendedor:
                    # Rede sem preço por CEP: antes de seguir, confere se ela atende esta região
                    if not fonte.entrega(cep, p.codigo, p.vendedor):
                        return Resultado(False, region_id, [])
        if regionaliza:
            self._cache_vtex[chave] = list(produtos.values())
        return Resultado(any(p.preco for p in produtos.values()), region_id, list(produtos.values()))

    def _coletar_osuper(self, fonte: OSuper, rede_id: str, regiao: int) -> Resultado:
        loja = self.conn.execute(
            """select rl.loja_id from rede_loja rl join municipio m on m.id = rl.municipio_ibge
                where rl.rede_id = %s and m.regiao_imediata_id = %s order by rl.loja_id limit 1""",
            (rede_id, regiao),
        ).fetchone()
        if not loja:
            return Resultado(False, None, [])
        por_item: dict[str, list[str]] = defaultdict(list)
        for pid, nome in fonte.catalogo_sitemap():
            c = self.casador.casar(nome)
            if c.item_id and len(por_item[c.item_id]) < MAX_PRODUTOS_OSUPER_POR_ITEM:
                por_item[c.item_id].append(pid)
        produtos = [p for pids in por_item.values() for pid in pids
                    if (p := fonte.produto(pid, loja["loja_id"]))]
        return Resultado(any(p.preco for p in produtos), loja["loja_id"], produtos)

    # ------------------------------------------------------------------ gravação

    def _gravar(self, rede_id: str, regiao: int, produtos: Iterable[ProdutoRede]) -> tuple[int, int, int]:
        """Grava produtos casados e suas observações. Devolve (n_precos, itens_cobertos, com_preco)."""
        n_precos, itens, com_preco = 0, set(), 0
        with self.conn.transaction():
            for p in produtos:
                if p.preco is None:
                    continue
                com_preco += 1
                c: Casamento = self.casador.casar(p.nome, p.ean)
                if c.metodo == "ambiguo":
                    self._upsert_produto(rede_id, p, None, None, None)
                    self.conn.execute(
                        """insert into revisao_casamento (rede_id, codigo, nome, candidatos)
                           select %s, %s, %s, %s
                            where not exists (select 1 from revisao_casamento
                                               where rede_id = %s and codigo = %s and status = 'pendente')""",
                        (rede_id, p.codigo, p.nome, list(c.candidatos), rede_id, p.codigo),
                    )
                    continue
                if not c.item_id:
                    continue
                self._upsert_produto(rede_id, p, c.item_id, c.metodo, c.confianca)
                item = self.catalogo.itens[c.item_id]
                self.conn.execute(
                    """insert into preco_obs (rede_id, codigo, regiao_imediata, item_canonico_id, preco, preco_ref)
                       values (%s, %s, %s, %s, %s, %s)""",
                    (rede_id, p.codigo, regiao, c.item_id, p.preco, preco_referencia(item, p.nome, p.preco)),
                )
                n_precos += 1
                itens.add(c.item_id)
        return n_precos, len(itens), com_preco

    def _upsert_produto(self, rede_id, p: ProdutoRede, item_id, metodo, confianca) -> None:
        self.conn.execute(
            """insert into produto_rede (rede_id, codigo, nome, marca, ean, item_canonico_id,
                                         casamento_metodo, casamento_confianca, atualizado_em)
               values (%s, %s, %s, %s, %s, %s, %s, %s, now())
               on conflict (rede_id, codigo) do update set
                 nome = excluded.nome, marca = excluded.marca, ean = excluded.ean,
                 item_canonico_id = excluded.item_canonico_id, casamento_metodo = excluded.casamento_metodo,
                 casamento_confianca = excluded.casamento_confianca, atualizado_em = now()""",
            (rede_id, p.codigo, p.nome, p.marca, p.ean, item_id, metodo, confianca),
        )

    # ------------------------------------------------------------------ fila

    def executar(self, tarefa: dict) -> int:
        rede = self.conn.execute("select * from rede where id = %s", (tarefa["rede_id"],)).fetchone()
        regiao = tarefa["regiao_imediata"]
        cep = self.conn.execute(
            "select cep_referencia from regiao_coleta where regiao_imediata = %s", (regiao,)
        ).fetchone()["cep_referencia"]
        fonte = self.fabrica(rede, self.cliente)
        if rede["plataforma"] == "vtex":
            res = self._coletar_vtex(fonte, cep, rede["config"].get("regionaliza", True))
        else:
            res = self._coletar_osuper(fonte, rede["id"], regiao)
        n_precos, itens, com_preco = self._gravar(rede["id"], regiao, res.produtos) if res.atende else (0, 0, 0)
        self.conn.execute(
            """insert into rede_regiao (rede_id, regiao_imediata, referencia, atende, itens_cobertos,
                                        produtos_com_preco, avaliado_em)
               values (%s, %s, %s, %s, %s, %s, now())
               on conflict (rede_id, regiao_imediata) do update set
                 referencia = excluded.referencia, atende = excluded.atende,
                 itens_cobertos = excluded.itens_cobertos, produtos_com_preco = excluded.produtos_com_preco,
                 avaliado_em = now()""",
            (rede["id"], regiao, res.referencia, res.atende and itens > 0, itens, com_preco),
        )
        self.conn.execute("select selecionar_redes(%s)", (regiao,))
        return n_precos

    def rodar_fila(self, maximo: int | None = None, rede: str | None = None) -> int:
        feitas = 0
        while maximo is None or feitas < maximo:
            tarefa = self.conn.execute("select * from pegar_tarefa(%s)", (rede,)).fetchone()
            if not tarefa:
                break
            log.info("tarefa %s: %s na região %s", tarefa["id"], tarefa["rede_id"], tarefa["regiao_imediata"])
            try:
                n = self.executar(tarefa)
                self.conn.execute(
                    "update coleta_tarefa set status = 'concluida', concluida_em = now(), n_precos = %s where id = %s",
                    (n, tarefa["id"]),
                )
                log.info("tarefa %s concluída: %s preços", tarefa["id"], n)
            except Exception as e:  # registra e segue: uma rede fora do ar não pode parar a fila
                log.exception("tarefa %s falhou", tarefa["id"])
                volta = tarefa["tentativas"] < MAX_TENTATIVAS
                self.conn.execute(
                    """update coleta_tarefa
                          set status = %s, erro = %s,
                              agendada_para = now() + make_interval(hours => tentativas)
                        where id = %s""",
                    ("pendente" if volta else "falhou", f"{type(e).__name__}: {e}"[:2000], tarefa["id"]),
                )
            feitas += 1
        if feitas:
            n = self.conn.execute("select recalcular_estat_preco() as n").fetchone()["n"]
            log.info("faixas recalculadas: %s linhas", n)
        return feitas

    # ------------------------------------------------------------------ lojas OSuper

    def sincronizar_lojas(self) -> int:
        total = 0
        for rede in self.conn.execute("select * from rede where ativa and plataforma = 'osuper'").fetchall():
            fonte = self.fabrica(rede, self.cliente)
            for loja in fonte.lojas(rede["config"]["loja_contexto"]):
                mun = self.conn.execute(
                    """select m.id from municipio m
                         join regiao_imediata ri on ri.id = m.regiao_imediata_id
                         join regiao_intermediaria rin on rin.id = ri.regiao_intermediaria_id
                         join uf u on u.id = rin.uf_id
                        where norm_texto(m.nome) = norm_texto(%s)
                          and (u.sigla = upper(%s) or norm_texto(u.nome) = norm_texto(%s))""",
                    (loja.cidade or "", loja.uf or "", loja.uf or ""),
                ).fetchone()
                if not mun:
                    log.warning("%s: loja %s (%s/%s) sem município do IBGE", rede["id"], loja.nome, loja.cidade, loja.uf)
                self.conn.execute(
                    """insert into rede_loja (rede_id, loja_id, nome, municipio_ibge) values (%s, %s, %s, %s)
                       on conflict (rede_id, loja_id) do update set nome = excluded.nome,
                         municipio_ibge = excluded.municipio_ibge""",
                    (rede["id"], loja.id, loja.nome, mun["id"] if mun else None),
                )
                total += 1
        return total


def recasar(conn: psycopg.Connection, catalogo: Catalogo | None = None) -> dict[str, int]:
    """Reaplica o casamento aos produtos gravados, depois de ajustar regras do catálogo.

    Só aperta: produtos que deixam de casar perdem suas observações; produtos que mudam de
    item têm as observações movidas (com preço comparável recalculado). Não consulta os sites.
    """
    catalogo = catalogo or carregar()
    eans = {r["ean"]: r["item_canonico_id"] for r in conn.execute("select ean, item_canonico_id from ean_item")}
    casador = Casador(catalogo, eans)
    cont = {"mantidos": 0, "movidos": 0, "removidos": 0}
    with conn.transaction():
        produtos = conn.execute(
            "select rede_id, codigo, nome, ean, item_canonico_id from produto_rede "
            "where item_canonico_id is not null and casamento_metodo <> 'manual'"
        ).fetchall()
        for p in produtos:
            c = casador.casar(p["nome"], p["ean"])
            chave = (p["rede_id"], p["codigo"])
            if c.item_id == p["item_canonico_id"]:
                cont["mantidos"] += 1
            elif c.item_id is None:
                conn.execute("delete from preco_obs where rede_id = %s and codigo = %s", chave)
                conn.execute(
                    "update produto_rede set item_canonico_id = null, casamento_metodo = null, "
                    "casamento_confianca = null where rede_id = %s and codigo = %s", chave)
                cont["removidos"] += 1
            else:
                item = catalogo.itens[c.item_id]
                for o in conn.execute("select id, preco from preco_obs where rede_id = %s and codigo = %s", chave).fetchall():
                    conn.execute("update preco_obs set item_canonico_id = %s, preco_ref = %s where id = %s",
                                 (c.item_id, preco_referencia(item, p["nome"], float(o["preco"])), o["id"]))
                conn.execute(
                    "update produto_rede set item_canonico_id = %s, casamento_metodo = %s, casamento_confianca = %s "
                    "where rede_id = %s and codigo = %s", (c.item_id, c.metodo, c.confianca, *chave))
                cont["movidos"] += 1
    conn.execute("select recalcular_estat_preco()")
    return cont


def ativar_regiao(conn: psycopg.Connection, municipio: int, cep: str | None = None) -> int:
    """Ativa a região imediata do município. Sem CEP, usa o de referência da região."""
    if cep is None:
        r = conn.execute("select ativar_regiao(%s) as id", (municipio,)).fetchone()
        if r["id"] is None:
            raise ValueError(f"município {municipio} inexistente ou região sem CEP de referência")
        return r["id"]
    regiao = conn.execute("select regiao_imediata_id from municipio where id = %s", (municipio,)).fetchone()
    if not regiao:
        raise ValueError(f"município {municipio} não existe")
    conn.execute(
        """insert into regiao_coleta (regiao_imediata, cep_referencia) values (%s, %s)
           on conflict (regiao_imediata) do update set cep_referencia = excluded.cep_referencia, ativa = true""",
        (regiao["regiao_imediata_id"], cep),
    )
    return regiao["regiao_imediata_id"]


def main() -> int:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    ap = argparse.ArgumentParser(prog="gm.coleta")
    sub = ap.add_subparsers(dest="cmd", required=True)
    a = sub.add_parser("ativar")
    a.add_argument("--municipio", type=int, required=True)
    a.add_argument("--cep", help="opcional: sobrescreve o CEP de referência da região")
    sub.add_parser("lojas")
    sub.add_parser("agendar")
    r = sub.add_parser("rodar")
    r.add_argument("--max", type=int)
    r.add_argument("--rede", help="só tarefas desta rede (para rodar um worker por rede em paralelo)")
    sub.add_parser("recalcular")
    sub.add_parser("recasar")
    args = ap.parse_args()

    conn = conectar()
    if args.cmd == "ativar":
        cep = args.cep.replace("-", "") if args.cep else None
        log.info("região %s ativa", ativar_regiao(conn, args.municipio, cep))
    elif args.cmd == "agendar":
        log.info("%s tarefas criadas", conn.execute("select agendar_coletas() as n").fetchone()["n"])
    elif args.cmd == "recasar":
        log.info("recasamento: %s", recasar(conn))
    elif args.cmd == "recalcular":
        log.info("%s linhas de faixa", conn.execute("select recalcular_estat_preco() as n").fetchone()["n"])
    else:
        coletor = Coletor(conn)
        try:
            if args.cmd == "lojas":
                log.info("%s lojas sincronizadas", coletor.sincronizar_lojas())
            else:
                log.info("%s tarefas executadas", coletor.rodar_fila(args.max, args.rede))
        finally:
            coletor.cliente.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
