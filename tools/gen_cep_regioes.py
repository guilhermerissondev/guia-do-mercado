"""Gera supabase/seed/03_regiao_cep.sql: um CEP de referência por região imediata do IBGE.

Para cada região imediata escolhe a cidade-polo (o município com o nome da região; nas regiões
com nome composto, o primeiro nome) e busca um CEP dela no ViaCEP, preferindo o bairro Centro.
O CEP só é aceito se o ViaCEP devolver o mesmo código IBGE do município.

Uso (a partir da raiz do repo; 1 requisição a cada 2 segundos):
    GM_CONTACT=voce@exemplo.com python3 -I tools/gen_cep_regioes.py [--fonte viacep|osm]

Fontes:
  viacep (padrão): busca logradouros da cidade-polo no ViaCEP.
  osm: coordenadas da cidade no OpenStreetMap (Nominatim) + endereço mais próximo do centro
       (busca reversa), validado na BrasilAPI. Usada quando o ViaCEP limita o acesso.

Incremental: regiões que já têm CEP no arquivo são mantidas; só as que faltam são buscadas.
Se o ViaCEP parar de responder (limite de uso), o script para depois de algumas falhas
seguidas e grava o que já tem; basta rodar de novo mais tarde.
Só usa a biblioteca padrão. Regiões sem CEP ficam listadas no fim do arquivo gerado.
"""

import gzip
import json
import os
import re
import sys
import time
import unicodedata
import urllib.parse
import urllib.error
import urllib.request
from pathlib import Path

IBGE = "https://servicodados.ibge.gov.br/api/v1/localidades/municipios"
VIACEP = "https://viacep.com.br/ws/{uf}/{cidade}/{termo}/json/"
OUT = Path(__file__).resolve().parent.parent / "supabase" / "seed" / "03_regiao_cep.sql"
TERMOS = ["Rua", "Avenida", "Travessa", "Praca"]
INTERVALO = 2.0
MAX_FALHAS_SEGUIDAS = 5  # falhas de rede seguidas: o ViaCEP provavelmente está limitando


class ViaCepIndisponivel(Exception):
    pass


_falhas_seguidas = 0
UA = "GuiaDoMercado/0.1 (comparador de precos; " + os.environ.get("GM_CONTACT", "contato nao configurado") + ")"


def norm(t: str) -> str:
    t = unicodedata.normalize("NFKD", t)
    return re.sub(r"\s+", " ", "".join(c for c in t if not unicodedata.combining(c)).lower()).strip()


def baixar(url: str):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=30) as r:
        corpo = r.read()
    if corpo[:2] == b"\x1f\x8b":
        corpo = gzip.decompress(corpo)
    return json.loads(corpo)


def polo(nome_regiao: str, municipios: list[dict]) -> list[dict]:
    """Candidatos a polo em ordem de preferência."""
    partes = [norm(p) for p in re.split(r"\s+-\s+|/", nome_regiao)]
    por_nome = {norm(m["nome"]): m for m in municipios}
    ordem = [por_nome[p] for p in partes if p in por_nome]
    ordem += [m for m in municipios if m not in ordem and any(norm(m["nome"]) in p for p in partes)]
    ordem += [m for m in municipios if m not in ordem]  # último recurso: qualquer município da região
    return ordem


def consultar(url: str):
    """Consulta com até 3 tentativas e espera crescente; distingue 'sem resultado' de 'fora do ar'."""
    global _falhas_seguidas
    for tentativa in range(3):
        try:
            dados = baixar(url)
            _falhas_seguidas = 0
            time.sleep(INTERVALO)
            return dados
        except urllib.error.HTTPError as e:
            if 400 <= e.code < 500 and e.code != 429:  # "não existe" não é serviço fora do ar
                _falhas_seguidas = 0
                time.sleep(INTERVALO)
                return []
            time.sleep(INTERVALO * (3 ** tentativa))
        except Exception:
            time.sleep(INTERVALO * (3 ** tentativa))
    _falhas_seguidas += 1
    if _falhas_seguidas >= MAX_FALHAS_SEGUIDAS:
        raise ViaCepIndisponivel()
    return []


def cep_do_municipio(m: dict, uf: str) -> tuple[str, str] | None:
    for termo in TERMOS:
        url = VIACEP.format(uf=uf, cidade=urllib.parse.quote(m["nome"]), termo=termo)
        dados = consultar(url)
        if not isinstance(dados, list):
            continue
        validos = [d for d in dados if str(d.get("ibge")) == str(m["id"]) and d.get("cep")]
        if validos:
            centro = [d for d in validos if norm(d.get("bairro", "")) == "centro"]
            d = (centro or validos)[0]
            return d["cep"].replace("-", ""), d.get("bairro") or ""
    return None


NOMINATIM = "https://nominatim.openstreetmap.org"
BRASILAPI = "https://brasilapi.com.br/api/cep/v2/{cep}"
DESLOCAMENTOS = [(0, 0), (0.004, 0), (0, 0.004), (-0.004, 0), (0, -0.004)]


def cep_osm(m: dict, uf: str, uf_nome: str) -> tuple[str, str] | None:
    """CEP de um endereço perto do centro da cidade, validado na BrasilAPI (cidade e UF)."""
    busca = consultar(f"{NOMINATIM}/search?" + urllib.parse.urlencode(
        {"city": m["nome"], "state": uf_nome, "country": "Brasil", "format": "json", "limit": 1}))
    if not busca:
        return None
    lat, lon = float(busca[0]["lat"]), float(busca[0]["lon"])
    for dlat, dlon in DESLOCAMENTOS:
        r = consultar(f"{NOMINATIM}/reverse?" + urllib.parse.urlencode(
            {"lat": lat + dlat, "lon": lon + dlon, "format": "json", "zoom": 18, "addressdetails": 1}))
        cep = re.sub(r"\D", "", ((r or {}).get("address") or {}).get("postcode", "") if isinstance(r, dict) else "")
        if len(cep) != 8 or int(cep[5:]) >= 900:  # 9xx: caixa postal / grande usuário, não serve para entrega
            continue
        v = consultar(BRASILAPI.format(cep=cep))
        if isinstance(v, dict) and norm(v.get("city", "")) == norm(m["nome"]) and v.get("state") == uf:
            return cep, v.get("neighborhood") or ""
    return None


def q(t: str) -> str:
    return "'" + t.replace("'", "''") + "'"


def main() -> int:
    fonte = "osm" if "--fonte" in sys.argv and sys.argv[sys.argv.index("--fonte") + 1] == "osm" else "viacep"
    municipios = baixar(IBGE)
    regioes: dict[int, dict] = {}
    for m in municipios:
        ri = m["regiao-imediata"]
        uf = ri["regiao-intermediaria"]["UF"]
        reg = regioes.setdefault(ri["id"], {"nome": ri["nome"], "uf": uf["sigla"], "uf_nome": uf["nome"], "municipios": []})
        reg["municipios"].append({"id": m["id"], "nome": m["nome"]})

    existentes: dict[int, str] = {}
    if OUT.exists():
        for linha in OUT.read_text(encoding="utf-8").splitlines():
            m = re.search(r"values \((\d+), ", linha)
            if linha.startswith("insert into regiao_cep_referencia") and m:
                existentes[int(m.group(1))] = linha

    inseridos = dict(existentes)
    falhas = []
    interrompido = False
    for n, (rid, reg) in enumerate(sorted(regioes.items()), 1):
        if rid in inseridos:
            continue
        achado = None
        if not interrompido:
            try:
                for candidato in polo(reg["nome"], reg["municipios"])[:3]:
                    r = cep_osm(candidato, reg["uf"], reg["uf_nome"]) if fonte == "osm" else cep_do_municipio(candidato, reg["uf"])
                    if r:
                        achado = (candidato, *r)
                        break
            except ViaCepIndisponivel:
                interrompido = True
                print(f"{fonte} sem responder; gravando o que já tem. Rode de novo mais tarde.", file=sys.stderr)
        if achado:
            m, cep, bairro = achado
            inseridos[rid] = (
                "insert into regiao_cep_referencia (regiao_imediata, municipio_polo, cep, bairro) "
                f"values ({rid}, {m['id']}, {q(cep)}, {q(bairro)});"
            )
        else:
            falhas.append(f"-- sem CEP: {rid} {reg['nome']}-{reg['uf']}")
        print(f"{n}/{len(regioes)} {reg['nome']}-{reg['uf']}: {achado[1] if achado else 'FALHOU'}", file=sys.stderr)

    linhas = ["-- Gerado por tools/gen_cep_regioes.py. Não editar à mão.", "begin;"]
    linhas += [inseridos[rid] for rid in sorted(inseridos)]
    linhas.append("commit;")
    linhas += falhas
    OUT.write_text("\n".join(linhas) + "\n", encoding="utf-8")
    print(f"{len(inseridos)} regiões com CEP, {len(falhas)} sem -> {OUT}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
