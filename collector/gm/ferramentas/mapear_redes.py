"""Mapeia as redes candidatas (catalogo/redes.toml): plataforma, permissão e regiões atendidas.

Para cada rede:
  1. abre o site (o primeiro domínio que responder) e detecta a plataforma (VTEX ou OSuper);
  2. lê o robots.txt e respeita: se a API estiver proibida, a rede fica de fora;
  3. VTEX: para cada região imediata dos estados da rede, consulta a região pelo CEP de referência e
     busca 6 itens de teste; a rede "atende" a região se pelo menos 3 vierem com preço.
     Regiões com a mesma região VTEX (mesmo regionId) são testadas uma vez só.
     OSuper: lista as lojas (com cidade/UF) e marca as regiões que têm loja.
Bloqueio (403, 429, 503, verificação anti-robô) nunca é contornado: a rede fica marcada como bloqueada.

Uso (a partir de collector/, com DATABASE_URL e GM_CONTACT):
    .venv/bin/python -m gm.ferramentas.mapear_redes [--redes id1,id2]
Saída: catalogo/mapa_redes.json e docs/mapa-redes.md
"""

from __future__ import annotations

import argparse
import json
import logging
import re
import sys
import tomllib
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path

import httpx

from gm.casamento import Casador
from gm.catalogo import carregar
from gm.db import conectar
from gm.fontes.http import ClienteEducado
from gm.fontes.osuper import OSuper
from gm.fontes.vtex import Vtex

log = logging.getLogger("gm.mapear")

RAIZ = Path(__file__).resolve().parents[2]
CANDIDATAS = RAIZ / "catalogo" / "redes.toml"
SAIDA_JSON = RAIZ / "catalogo" / "mapa_redes.json"
SAIDA_MD = RAIZ.parent / "docs" / "mapa-redes.md"

# Itens de teste: comuns, com marcas nacionais, fáceis de casar sem ambiguidade.
ITENS_TESTE = ["arroz-branco-5kg", "feijao-carioca-1kg", "acucar-refinado-1kg",
               "cafe-torrado-moido-500g", "oleo-soja-900ml", "leite-integral-1l"]
MIN_ITENS_ATENDE = 3
BLOQUEIO = {401, 403, 429, 503}


def _robots_proibe_api(texto: str) -> bool:
    """True se o robots.txt proíbe /api para todos os robôs (User-agent: *)."""
    agente_todos, proibidos = False, []
    for linha in texto.splitlines():
        linha = linha.split("#", 1)[0].strip()
        if not linha or ":" not in linha:
            continue
        chave, valor = (p.strip() for p in linha.split(":", 1))
        chave = chave.lower()
        if chave == "user-agent":
            agente_todos = valor == "*"
        elif chave == "disallow" and agente_todos and valor:
            proibidos.append(valor)
    return any(p in ("/", "/api", "/api/", "/api/*", "/*/api/*") for p in proibidos)


def detectar(rede: dict, cliente: ClienteEducado) -> dict:
    """Plataforma e situação de acesso da rede."""
    ultimo = {"status": "sem_resposta", "motivo": "nenhum domínio respondeu"}
    for dominio in rede["dominios"]:
        try:
            r = cliente.get(f"https://{dominio}/", verificar=False, headers={"Accept": "text/html"})
        except httpx.HTTPError as e:
            ultimo = {"status": "sem_resposta", "motivo": f"{dominio}: {type(e).__name__}"}
            continue
        host = r.url.host
        if r.status_code in BLOQUEIO or "request-verify" in str(r.url) or "captcha" in r.text[:5000].lower():
            return {"status": "bloqueada", "motivo": f"{host}: HTTP {r.status_code} / verificação anti-robô", "host": host}
        if r.status_code >= 400:
            ultimo = {"status": "sem_resposta", "motivo": f"{dominio}: HTTP {r.status_code}"}
            continue
        html = r.text
        if any(h.lower().startswith("x-vtex") for h in r.headers) or re.search(r"vtexassets|vteximg|vtex\.file-manager", html):
            plataforma = "vtex"
        elif "cdn.osuper.com.br" in html:
            plataforma = "osuper"
        else:
            return {"status": "plataforma_nao_suportada", "motivo": f"{host}: plataforma não identificada", "host": host}
        try:
            robots = cliente.get(f"https://{host}/robots.txt", verificar=False)
            if robots.status_code == 200 and _robots_proibe_api(robots.text):
                return {"status": "robots", "motivo": f"{host}: robots.txt proíbe /api", "host": host, "plataforma": plataforma}
        except httpx.HTTPError:
            pass
        info = {"status": "detectada", "plataforma": plataforma, "host": host}
        if plataforma == "osuper":
            api = re.search(r'"apiUrl":"([^"]+)"', html)
            loja = re.search(r'"principalStoreId":"(\d+)"', html)
            if not api or not loja:
                return {"status": "plataforma_nao_suportada", "motivo": f"{host}: OSuper sem apiUrl/loja principal", "host": host}
            api_url = api.group(1).encode().decode("unicode_escape").replace(":443", "")
            info["config"] = {"site": f"https://{host}", "api": api_url.rstrip("/") + "/storefront/graphql",
                              "loja_contexto": loja.group(1)}
        else:
            info["config"] = {"host": host}
        return info
    return ultimo


class FastStore(Exception):
    """Loja VTEX headless (FastStore): as APIs da VTEX não ficam expostas no domínio da loja."""


MIN_REGIOES_PARA_JULGAR = 4  # com menos regiões testadas não dá para dizer se a rede regionaliza


def mapear_vtex(rede: dict, info: dict, regioes: list[dict], cliente: ClienteEducado, casador: Casador,
                nomes_itens: dict[str, str]) -> dict:
    vtex = Vtex(rede["id"], info["host"], cliente)
    por_region_id: dict[str, int] = {}
    regiao_para_rid: dict[int, str | None] = {}
    amostra: tuple[str, str] | None = None  # (sku, vendedor) para simular entrega
    for reg in regioes:
        try:
            rid = vtex.region_id(reg["cep"])
        except httpx.HTTPStatusError as e:
            if e.response.status_code in BLOQUEIO:
                raise RuntimeError(f"API respondeu HTTP {e.response.status_code}") from e
            if e.response.status_code == 404 and not regiao_para_rid:
                raise FastStore() from e
            rid = None
        regiao_para_rid[reg["regiao"]] = rid
        if rid and rid not in por_region_id:
            itens = set()
            for item_id in ITENS_TESTE:
                for p in vtex.buscar(nomes_itens[item_id], rid, quantidade=8):
                    if p.preco and casador.casar(p.nome, p.ean).item_id == item_id:
                        itens.add(item_id)
                        amostra = amostra or (p.codigo, p.vendedor)
                        break
            por_region_id[rid] = len(itens)

    # Rede que devolve a mesma região VTEX para o estado inteiro não regionaliza pelo CEP:
    # só vale onde a loja entrega ou tem retirada.
    regionaliza = len(regioes) < MIN_REGIOES_PARA_JULGAR or len(por_region_id) > 2
    resultado: dict[int, int] = {}
    for reg in regioes:
        rid = regiao_para_rid[reg["regiao"]]
        n = por_region_id.get(rid, 0) if rid else 0
        if n and not regionaliza:
            n = n if amostra and amostra[1] and vtex.entrega(reg["cep"], *amostra) else 0
        resultado[reg["regiao"]] = n
    info["config"]["regionaliza"] = regionaliza
    return {"regioes": {str(k): v for k, v in resultado.items()}, "regioes_vtex_distintas": len(por_region_id),
            "regionaliza": regionaliza}


def mapear_osuper(rede: dict, info: dict, municipios: dict[tuple[str, str], int], cliente: ClienteEducado) -> dict:
    cfg = info["config"]
    fonte = OSuper(rede["id"], cfg["site"], cfg["api"], cliente)
    lojas = fonte.lojas(cfg["loja_contexto"])
    regioes: dict[str, int] = {}
    sem_municipio = []
    ufs: set[str] = set()
    for loja in lojas:
        chave = (norm(loja.cidade or ""), norm_uf(loja.uf or ""))
        regiao = municipios.get(chave)
        if regiao is None:
            sem_municipio.append(f"{loja.nome} ({loja.cidade}/{loja.uf})")
            continue
        regioes[str(regiao)] = len(ITENS_TESTE)  # loja física na região: atende (cobertura real vem da coleta)
        ufs.add(chave[1].upper())
    # Nas redes OSuper a lista de lojas é a fonte dos estados atendidos (o redes.toml é só palpite)
    return {"regioes": regioes, "lojas": len(lojas), "lojas_sem_municipio": sem_municipio, "ufs": sorted(ufs)}


def norm(t: str) -> str:
    from gm.texto import normalizar
    return normalizar(t)


_UFS = {}


def norm_uf(t: str) -> str:
    t = norm(t)
    return _UFS.get(t, t)


def processar(rede: dict, regioes_por_uf: dict[str, list[dict]], municipios, casador, nomes_itens) -> dict:
    base = {"id": rede["id"], "nome": rede["nome"], "ufs": rede["ufs"]}
    if rede.get("excluida"):
        return {**base, "status": "excluida", "motivo": rede["excluida"], "regioes": {}}
    cliente = ClienteEducado()
    try:
        info = detectar(rede, cliente)
        if info["status"] != "detectada":
            return {**base, **info, "regioes": {}}
        regioes = [r for uf in rede["ufs"] for r in regioes_por_uf.get(uf, [])]
        extra = None
        for tentativa in range(2):
            try:
                if info["plataforma"] == "vtex":
                    extra = mapear_vtex(rede, info, regioes, cliente, casador, nomes_itens)
                else:
                    extra = mapear_osuper(rede, info, municipios, cliente)
                break
            except FastStore:
                return {**base, **info, "status": "plataforma_nao_suportada", "regioes": {},
                        "motivo": f"{info['host']}: VTEX FastStore (headless), APIs não expostas no domínio; precisa de adaptador próprio"}
            except RuntimeError as e:  # 401/403/429/503: recusa de acesso, não insistir
                return {**base, **info, "status": "bloqueada", "motivo": f"{info['host']}: {e}", "regioes": {}}
            except httpx.HTTPError as e:  # 500 e falhas de rede: problema do servidor, tenta de novo uma vez
                erro = e.response.status_code if isinstance(e, httpx.HTTPStatusError) else type(e).__name__
                log.warning("%s: erro %s (tentativa %s)", rede["id"], erro, tentativa + 1)
                if tentativa == 1:
                    return {**base, **info, "status": "instavel",
                            "motivo": f"{info['host']}: erro {erro} do servidor da loja; tentar de novo depois", "regioes": {}}
        atendidas = {k: v for k, v in extra["regioes"].items() if v >= MIN_ITENS_ATENDE}
        status = "viavel" if atendidas else "nao_atende"
        motivo = "" if atendidas else "nenhuma região com itens de teste com preço"
        log.info("%s: %s, %s regiões atendidas", rede["id"], status, len(atendidas))
        return {**base, **info, **extra, "status": status, "motivo": motivo, "regioes": atendidas}
    finally:
        cliente.close()


def relatorio(resultado: dict, regioes_info: dict[int, dict]) -> str:
    redes = resultado["redes"]
    por_regiao: dict[str, list[str]] = defaultdict(list)
    for r in redes:
        for reg in r.get("regioes", {}):
            por_regiao[reg].append(r["nome"])
    por_uf: dict[str, dict[str, int]] = defaultdict(lambda: {"total": 0, "2+": 0, "1": 0, "0": 0})
    for rid, info in regioes_info.items():
        n = len(por_regiao.get(str(rid), []))
        c = por_uf[info["uf"]]
        c["total"] += 1
        c["2+" if n >= 2 else str(n)] += 1

    rotulo = {"viavel": "✅ viável", "nao_atende": "⚪ não atende", "bloqueada": "⛔ bloqueada", "robots": "⛔ robots.txt",
              "excluida": "🚫 excluída", "sem_resposta": "❔ sem resposta", "plataforma_nao_suportada": "🔧 outra plataforma",
              "instavel": "⚠️ instável"}
    viaveis = [r for r in redes if r["status"] == "viavel"]
    linhas = [
        "# Mapa de redes por região (coleta de preço base)",
        "",
        f"Gerado por `collector/gm/ferramentas/mapear_redes.py` em {resultado['gerado_em'][:16].replace('T', ' ')} UTC. "
        "Não editar à mão.",
        "",
        f"**{len(viaveis)} redes viáveis** de {len(redes)} candidatas. Meta: 2 a 3 redes por região imediata (D11, D15).",
        "",
        "## Cobertura por estado",
        "",
        "| UF | Regiões imediatas | Com 2+ redes | Com 1 rede | Sem rede |",
        "|---|---|---|---|---|",
    ]
    tot = {"total": 0, "2+": 0, "1": 0, "0": 0}
    for uf in sorted(por_uf):
        c = por_uf[uf]
        for k in tot:
            tot[k] += c[k]
        linhas.append(f"| {uf} | {c['total']} | {c['2+']} | {c['1']} | {c['0']} |")
    linhas.append(f"| **Brasil** | **{tot['total']}** | **{tot['2+']}** | **{tot['1']}** | **{tot['0']}** |")

    linhas += ["", "## Redes", "", "| Rede | Situação | Plataforma | Regiões atendidas | Observação |", "|---|---|---|---|---|"]
    ordem = ["viavel", "instavel", "nao_atende", "plataforma_nao_suportada", "bloqueada", "robots", "sem_resposta", "excluida"]
    for r in sorted(redes, key=lambda r: (ordem.index(r["status"]), -len(r.get("regioes", {})), r["nome"])):
        obs = r.get("motivo", "")
        if r.get("lojas_sem_municipio"):
            obs = (obs + " " if obs else "") + f"lojas sem município IBGE: {', '.join(r['lojas_sem_municipio'][:3])}"
        linhas.append(f"| {r['nome']} | {rotulo[r['status']]} | {r.get('plataforma', '–')} | "
                      f"{len(r.get('regioes', {}))} | {obs} |")

    linhas += ["", "## Regiões com menos de 2 redes", "",
               "Onde a estimativa vai depender do nível estado/Brasil (ou do valor informado pelo usuário) até "
               "achar mais redes.", "", "| UF | Região imediata | Redes |", "|---|---|---|"]
    for rid, info in sorted(regioes_info.items(), key=lambda x: (x[1]["uf"], x[1]["nome"])):
        nomes = por_regiao.get(str(rid), [])
        if len(nomes) < 2:
            linhas.append(f"| {info['uf']} | {info['nome']} | {', '.join(nomes) or '–'} |")
    return "\n".join(linhas) + "\n"


def main() -> int:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    logging.getLogger("httpx").setLevel(logging.WARNING)
    ap = argparse.ArgumentParser()
    ap.add_argument("--redes", help="ids separados por vírgula (padrão: todas)")
    args = ap.parse_args()

    candidatas = tomllib.loads(CANDIDATAS.read_text(encoding="utf-8"))["rede"]
    if args.redes:
        escolhidas = set(args.redes.split(","))
        candidatas = [r for r in candidatas if r["id"] in escolhidas]

    conn = conectar()
    regioes_por_uf: dict[str, list[dict]] = defaultdict(list)
    regioes_info: dict[int, dict] = {}
    for r in conn.execute(
        """select ri.id as regiao, ri.nome, u.sigla as uf, rc.cep from regiao_imediata ri
             join regiao_intermediaria rin on rin.id = ri.regiao_intermediaria_id
             join uf u on u.id = rin.uf_id
             left join regiao_cep_referencia rc on rc.regiao_imediata = ri.id"""):
        regioes_info[r["regiao"]] = {"nome": r["nome"], "uf": r["uf"]}
        if r["cep"]:
            regioes_por_uf[r["uf"]].append({"regiao": r["regiao"], "cep": r["cep"]})
    municipios: dict[tuple[str, str], int] = {}
    for m in conn.execute(
        """select m.nome, u.sigla, u.nome as uf_nome, m.regiao_imediata_id from municipio m
             join regiao_imediata ri on ri.id = m.regiao_imediata_id
             join regiao_intermediaria rin on rin.id = ri.regiao_intermediaria_id
             join uf u on u.id = rin.uf_id"""):
        _UFS[norm(m["uf_nome"])] = norm(m["sigla"])
        municipios[(norm(m["nome"]), norm(m["sigla"]))] = m["regiao_imediata_id"]
    conn.close()

    catalogo = carregar()
    casador = Casador(catalogo)
    nomes_itens = {i: catalogo.itens[i].nome for i in ITENS_TESTE}

    with ThreadPoolExecutor(max_workers=12) as pool:
        resultados = list(pool.map(lambda r: processar(r, regioes_por_uf, municipios, casador, nomes_itens), candidatas))

    anterior = json.loads(SAIDA_JSON.read_text(encoding="utf-8")) if SAIDA_JSON.exists() and args.redes else None
    if anterior:  # atualização parcial: mantém as demais redes do mapa anterior
        novos = {r["id"] for r in resultados}
        resultados = [r for r in anterior["redes"] if r["id"] not in novos] + resultados
    saida = {"gerado_em": datetime.now(timezone.utc).isoformat(), "redes": sorted(resultados, key=lambda r: r["id"])}
    SAIDA_JSON.write_text(json.dumps(saida, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    SAIDA_MD.write_text(relatorio(saida, regioes_info), encoding="utf-8")
    log.info("mapa -> %s e %s", SAIDA_JSON, SAIDA_MD)
    return 0


if __name__ == "__main__":
    sys.exit(main())
