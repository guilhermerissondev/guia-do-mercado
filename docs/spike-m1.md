# Spike M1: viabilidade da coleta (resultado parcial, 2026-11-03)

Método: poucas requisições por site, User-Agent identificado, leitura de `robots.txt` antes de qualquer coisa, sem login e sem contornar bloqueios. Rodado de uma máquina com saída para a borda brasileira da Cloudflare (`cf-ray` com sufixo GRU).

## Resultado por rede

| Rede | Acesso | Plataforma | Preço na página de produto | Observações |
|---|---|---|---|---|
| Carrefour | 200 | VTEX | JSON-LD com `price` e `gtin13` real (EAN) | `robots.txt` proíbe `/busca/`; sitemap de produtos acessível |
| Atacadão | 200 | VTEX | não testado | `robots.txt` proíbe `/busca/*` |
| Super Muffato | 200 | VTEX | **sem preço no HTML estático** da página testada | **Descartado por decisão do dono do produto** (termos proíbem explorar o conteúdo sem autorização) |
| Angeloni | 200 | VTEX | não testado | sem `robots.txt` (404) |
| Condor | 200 | Deco (não VTEX) | JSON-LD com `price`; `gtin` é código interno, não EAN | `robots.txt` permite `/produtos/` e `/categorias`, proíbe URLs com `?` |
| Assaí | **403** | desconhecida | n/a | bloqueio ativo; `Crawl-delay: 10`; não vou contornar |
| Pão de Açúcar | **403** | desconhecida | n/a | verificação anti-robô (`az-request-verify`); não vou contornar |
| Cidade Canção | sem resposta | n/a | n/a | domínio testado não respondeu; URL correta a confirmar |

## O que ficou comprovado

- Existe um caminho tecnicamente simples e compatível com `robots.txt`: **sitemap de produtos + página de produto**, sem usar busca.
- Duas redes expõem preço em dado estruturado (JSON-LD), o que dá um extrator genérico por padrão, não por rede.
- Carrefour entrega EAN real, o que viabiliza o casamento exato. Condor não.

## O que NÃO foi comprovado (bloqueia a decisão)

1. **Preço por região/CEP.** Todo preço visto é o da região padrão do site. Sem preço regional, a coleta por região imediata do IBGE não se sustenta. Verificar exige simular a escolha de CEP, e isso vai além de leitura passiva.
2. **Muffato:** a página testada não trouxe preço no HTML; pode ser renderização no cliente ou produto indisponível.
3. **Teste de IP brasileiro vs nuvem estrangeira:** não feito.

## Termos de uso (risco jurídico)

- **Super Muffato:** não há cláusula expressa sobre robôs ou preços, mas a seção 6 proíbe "copiar, reproduzir, distribuir, transmitir, exibir, vender ou explorar de qualquer forma o conteúdo dos sites" sem autorização prévia por escrito, e a seção 2 define o uso como pessoal.
- **Condor** (`/termos-de-uso`): sem cláusula sobre robôs, scraping ou extração. A leitura veio com uma mensagem de erro no topo da página ("Não foi possível sua solicitação"), então a conclusão é **provável, não definitiva**.
- **Atacadão** (`/termos-de-uso`): a página carrega só o menu; o corpo dos termos não veio. **Inconclusivo.**
- **Carrefour** (`/termos-de-uso`): a leitura automatizada recebeu 403. **Inconclusivo**; precisa ser lido em navegador.
- Não achei jurisprudência brasileira específica sobre raspagem de preços. Usar cláusulas genéricas de "exploração de conteúdo" contra um produto comercial é um risco real.

## Conclusão provisória

Tecnicamente viável em parte das redes; **juridicamente cinzento para um produto público**. Não recomendo escalar a coleta sem autorização das redes. 
## Decisão do dono do produto (2026-11-03)

Descartar o Super Muffato e seguir com as demais redes. Ressalva registrada: só os termos do Muffato foram lidos com clareza; Carrefour e Atacadão precisam de leitura manual dos termos antes de qualquer coleta contínua, e o Condor tem leitura provável mas não definitiva.

Orientação seguinte do dono do produto: não é preciso cobrir todos os mercados; **cerca de 3 redes por região** bastam para uma boa média.

## Preço regional (2026-11-03)

### Como cada plataforma regionaliza

| Plataforma | Rede | Como o preço regional é obtido | Resultado |
|---|---|---|---|
| VTEX | Atacadão | `GET /api/checkout/pub/regions?country=BRA&postalCode=<CEP>` devolve `regionId`; a busca inteligente `/api/io/_v/api/intelligent-search/product_search/?query=…&regionId=…` devolve sortimento e preço da região | **Funciona.** Maringá tem loja própria (seller `Maringá Fernão Dias`). Leite Italac 1L: R$ 5,89 em Maringá, R$ 5,49 em São Paulo; 18 vs 32 leites integrais disponíveis |
| VTEX | Angeloni (`super.angeloni.com.br`) | Mesmo caminho do Atacadão | **Funciona.** Atende Maringá e Curitiba; São Paulo sem produtos (não entrega) |
| OSuper (GraphQL) | Condor | `POST https://api.condor.com.br/storefront/graphql`, `product(id, storeId)` com `pricing { price promotionalPrice }` e `quantity { inStock }`; lista de lojas embutida no HTML (Maringá Av. Paraná = loja `1440`); IDs de produto vêm do sitemap | **Funciona**, preço e estoque por loja. **Sem EAN**: casamento por nome, marca e tamanho |
| VTEX | Carrefour (`www`) | Só vendedores de marketplace (leite a R$ 14,50) | Não serve |
| VTEX | Carrefour Mercado | APIs respondem 503 sem corpo (home abre) | **Excluído**: aparenta proteção anti-robô; não contornar |
| VTEX | Super Muffato | n/a | **Excluído** por decisão do dono do produto |

A API de catálogo clássica da VTEX (`/api/catalog_system/pub/products/search`) **ignora a região** no Atacadão (sempre devolve a loja padrão) e dá 403 no Carrefour. A simulação de carrinho também não serviu (o SKU da loja padrão aparece sem estoque nas lojas regionais). O caminho correto é a busca inteligente com `regionId`.

### Teste com 3 redes para o CEP 87013-000 (Maringá)

Script: `collector/spike/compara_maringa.py`.

| Item | Atacadão | Angeloni | Condor | Observação |
|---|---|---|---|---|
| Arroz Tio João branco 5kg | 28,90 | 35,78 | 36,77 | Atacadão e Angeloni com o mesmo EAN |
| Café Pilão tradicional 500g | 20,90 | 25,99 | 34,41 | **Embalagens diferentes** (Doy vs vácuo, EANs diferentes) |
| Açúcar União refinado 1kg | 3,79 | 3,89 | 4,37 | Mesmo EAN em Atacadão e Angeloni |
| Óleo de soja Liza 900ml | 7,69 | **15,99** | 8,36 | **Casamento errado** no Angeloni: devolveu óleo de girassol |

O que o teste ensina:
- **A coleta regional com 3 redes é viável** para Maringá, com dois adaptadores (VTEX busca inteligente e OSuper GraphQL).
- **Busca por texto não basta.** Dois dos quatro itens trouxeram o produto errado ou outra embalagem. A coleta de produção precisa partir do catálogo canônico com EANs (VTEX aceita filtrar por EAN) e, no Condor, de nome+marca+tamanho validados. Isso confirma a M2 como pré-requisito.
- **Atacarejo puxa o mínimo para baixo.** O Atacadão é sistematicamente mais barato; é coerente com a faixa "econômico", mas a mediana fica mais estável com 3 redes ou mais.

### Implicação para o desenho nacional

- O que escala não é a rede, é a **plataforma**: um adaptador VTEX e um OSuper cobrem várias redes. Adicionar uma rede vira configuração (rede → plataforma → domínio → como mapear CEP ou loja), não código novo.
- O Atacadão tem presença nacional e regionaliza por CEP; serve como **rede âncora** em quase todas as regiões. As outras duas redes por região vêm de redes regionais em VTEX ou OSuper.
- O mapeamento é: região imediata do IBGE → CEP de referência → (VTEX) `regionId` ou (OSuper) loja mais próxima.

### Riscos que continuam

- As APIs usadas **não são documentadas para terceiros** (são as que o próprio site usa). Podem mudar sem aviso; por isso os testes com fixtures da M3.
- `robots.txt` proíbe as páginas HTML de busca (`/busca`), não as APIs; mesmo assim, é uso que as redes não autorizaram explicitamente.
- Termos de uso: Atacadão e Angeloni **não lidos**; Condor sem cláusula restritiva (leitura provável). Precisam de leitura manual antes de coleta contínua.

## Conclusão da porta M1

**Viável tecnicamente**, com 3 redes para Maringá (Atacadão, Angeloni, Condor) em 2 plataformas, preço regional comprovado. Pendente: leitura dos termos de Atacadão e Angeloni pelo dono do produto, e confirmação de que essas redes fazem sentido para o tester.
