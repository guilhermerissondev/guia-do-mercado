import json, os, urllib.request, urllib.parse, time
UA = "GuiaDoMercado-spike/0.1 (pesquisa de viabilidade; contato: " + os.environ.get("GM_CONTACT", "defina GM_CONTACT") + ")"
def req(url, body=None, extra=None):
    h = {"User-Agent": UA, "Accept": "application/json", "Content-Type": "application/json", **(extra or {})}
    data = json.dumps(body).encode() if body is not None else None
    return json.loads(urllib.request.urlopen(urllib.request.Request(url, data=data, headers=h), timeout=30).read())
CEP = "87013000"  # Maringá
itens = [  # (rótulo, busca VTEX, palavras obrigatórias no nome, id Condor)
    ("Arroz Tio João branco 5kg", "arroz tio joao 5kg", ["tio jo", "5kg"], "7570085"),
    ("Café Pilão tradicional 500g", "cafe pilao tradicional 500g", ["pil", "500"], "7571557"),
    ("Açúcar União refinado 1kg", "acucar uniao refinado 1kg", ["uni", "1kg"], "7574345"),
    ("Óleo de soja Liza 900ml", "oleo de soja liza 900ml", ["liza", "900"], "7577884"),
]
def vtex(host, busca, obrig):
    rid = req(f"https://{host}/api/checkout/pub/regions?country=BRA&postalCode={CEP}")[0]["id"]
    time.sleep(1)
    q = urllib.parse.urlencode({"query": busca, "count": 8, "page": 1, "regionId": rid, "hideUnavailableItems": "true"})
    d = req(f"https://{host}/api/io/_v/api/intelligent-search/product_search/?{q}")
    time.sleep(1)
    for p in d.get("products", []):
        nome = p["productName"].lower()
        if all(o in nome for o in obrig) and "parbo" not in nome and "integral" not in nome:
            it = p["items"][0]
            for s in it["sellers"]:
                if s["commertialOffer"].get("AvailableQuantity"):
                    return s["commertialOffer"]["Price"], p["productName"][:40], it.get("ean")
    return None, None, None
def condor(pid):
    q = "query Q($storeId: ID!, $productId: ID!) { publicViewer(storeId: $storeId) { product(id: $productId, storeId: $storeId, showInactive: true) { name pricing(storeId: $storeId) { price promotionalPrice } quantity(storeId: $storeId) { inStock } } } }"
    d = req("https://api.condor.com.br/storefront/graphql", {"query": q, "variables": {"storeId": "1440", "productId": pid}},
            {"Origin": "https://www.condor.com.br", "Referer": "https://www.condor.com.br/"})
    time.sleep(1)
    p = d["data"]["publicViewer"]["product"]
    if not p or not p["quantity"]["inStock"]: return None, None
    return p["pricing"]["promotionalPrice"] or p["pricing"]["price"], p["name"][:40]
print(f"Preços para CEP {CEP} (Maringá)\n")
for rotulo, busca, obrig, cid in itens:
    a = vtex("www.atacadao.com.br", busca, obrig)
    g = vtex("super.angeloni.com.br", busca, obrig)
    c = condor(cid)
    precos = [x for x in (a[0], g[0], c[0]) if x]
    med = sorted(precos)[len(precos)//2] if precos else None
    print(f"{rotulo}")
    print(f"   Atacadão : {a[0]}  ({a[1]}, ean={a[2]})")
    print(f"   Angeloni : {g[0]}  ({g[1]}, ean={g[2]})")
    print(f"   Condor   : {c[0]}  ({c[1]})")
    print(f"   -> mín {min(precos) if precos else '-'} | mediana {med} | máx {max(precos) if precos else '-'}\n")
