import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { brl, ITENS_POR_PAGINA, nomeCurto, tecladoRevisao, textoResumo, totais, type ItemLista } from "../src/formato.ts";
import { Limitador } from "../src/limite.ts";
import { alternativas, classificar } from "../src/montagem.ts";
import { corrigir, distancia, quantidadeFinal, sugerir, type ItemCatalogo } from "../src/sugestao.ts";
import { lerLista, lerValor, normalizar, QTD_MAX } from "../src/texto.ts";

const catalogo: ItemCatalogo[] = JSON.parse(
  readFileSync(new URL("./fixtures/catalogo.json", import.meta.url), "utf-8"),
);

describe("normalizar (igual ao coletor)", () => {
  it("remove acento e pontuação e mantém decimal", () => {
    expect(normalizar("Açúcar Refinado UNIÃO 1kg")).toBe("acucar refinado uniao 1kg");
    expect(normalizar("Água Mineral 1,5L")).toBe("agua mineral 1.5l");
    expect(normalizar("Coca-Cola  Original")).toBe("coca cola original");
  });
});

describe("lerLista", () => {
  it("divide por vírgula, linha e 'e', e lê quantidades", () => {
    expect(lerLista("2 leite, arroz 5kg e café")).toEqual([
      { texto: "leite", quantidade: 2 },
      { texto: "arroz 5kg", quantidade: 1 },
      { texto: "café", quantidade: 1 },
    ]);
  });

  it("aceita lista em linhas com marcadores", () => {
    expect(lerLista("- leite x3\n- ovos (2)\n* 4x sabonete")).toEqual([
      { texto: "leite", quantidade: 3 },
      { texto: "ovos", quantidade: 2 },
      { texto: "sabonete", quantidade: 4 },
    ]);
  });

  it("não confunde tamanho com quantidade", () => {
    expect(lerLista("5kg arroz")).toEqual([{ texto: "5kg arroz", quantidade: 1 }]);
    expect(lerLista("2 litros de leite")).toEqual([{ texto: "2 litros de leite", quantidade: 1 }]);
  });

  it("entende quantidade por extenso", () => {
    expect(lerLista("duas pastas de dente, uma dúzia de ovos")).toEqual([
      { texto: "pastas de dente", quantidade: 2 },
      { texto: "dúzia de ovos", quantidade: 1 },
    ]);
  });
});

describe("lerValor", () => {
  it.each([
    ["6,20", 6.2],
    ["R$ 6.2", 6.2],
    ["12", 12],
    ["r$12,99", 12.99],
  ])("%s -> %s", (t, v) => expect(lerValor(t)).toBe(v));

  it("rejeita texto sem número", () => expect(lerValor("caro")).toBeNull());
});

describe("sugerir", () => {
  const ids = (t: string) => sugerir(t, catalogo).sugestoes.map((s) => s.item.id);

  it("leite: o integral vem primeiro e há outras opções", () => {
    const r = sugerir("leite", catalogo);
    expect(r.sugestoes[0]!.item.id).toBe("leite-integral-1l");
    expect(r.sugestoes.length).toBeGreaterThan(1);
    expect(r.unica).toBeNull();
  });

  it("tamanho digitado decide entre embalagens", () => {
    expect(ids("arroz 5kg")[0]).toBe("arroz-branco-5kg");
    expect(ids("arroz 1kg")[0]).toBe("arroz-branco-1kg");
    expect(ids("cafe 250g")[0]).toBe("cafe-torrado-moido-250g");
  });

  it("palavras específicas levam a um item só", () => {
    expect(sugerir("leite zero lactose", catalogo).unica?.id).toBe("leite-zero-lactose-1l");
    expect(sugerir("papel higienico", catalogo).unica?.id).toBe("papel-higienico-12un");
    expect(sugerir("óleo de soja", catalogo).unica?.id).toBe("oleo-soja-900ml");
  });

  it("plural e acento não atrapalham", () => {
    expect(ids("ovos")[0]).toBe("ovos-brancos-12un");
    expect(ids("tomates")[0]).toBe("tomate-kg");
    expect(ids("açucar")[0]).toBe("acucar-refinado-1kg");
  });

  it("granel: tamanho digitado vira quantidade em kg", () => {
    const r = sugerir("tomate 500g", catalogo);
    const tomate = r.sugestoes[0]!.item;
    expect(tomate.id).toBe("tomate-kg");
    expect(quantidadeFinal(tomate, 1, r.medida)).toBe(0.5);
    expect(quantidadeFinal(tomate, 2, sugerir("tomate 2kg", catalogo).medida)).toBe(4);
  });

  it("texto que não existe no catálogo não sugere nada", () => {
    expect(sugerir("carregador de celular", catalogo).sugestoes).toEqual([]);
  });
});

describe("totais e texto", () => {
  const itens: ItemLista[] = [
    { id: 1, textoOriginal: "x", itemCanonicoId: null, incerto: false, faixa: null, nomeExibicao: "Leite integral 1 L", quantidade: 2, granel: false, perfil: "tipico", precoEstimado: 5.69, precoReal: 6.2, marcado: true },
    { id: 2, textoOriginal: "x", itemCanonicoId: null, incerto: false, faixa: null, nomeExibicao: "Arroz branco tipo 1 5 kg", quantidade: 1, granel: false, perfil: "tipico", precoEstimado: 24.99, precoReal: null, marcado: false },
    { id: 3, textoOriginal: "x", itemCanonicoId: null, incerto: false, faixa: null, nomeExibicao: "Tomate (kg)", quantidade: 0.5, granel: true, perfil: "economico", precoEstimado: 15.89, precoReal: null, marcado: true },
  ];

  it("carrinho usa o preço real quando informado; falta usa o estimado", () => {
    const t = totais(itens);
    expect(t.estimado).toBe(44.32);           // 11,38 + 24,99 + 7,95
    expect(t.carrinho).toBe(20.35);           // 12,40 + 7,95
    expect(t.falta).toBe(24.99);
    expect(t.previsao).toBe(45.34);
    expect(t.marcados).toBe(2);
  });

  it("formata reais", () => {
    expect(brl(5.69)).toBe("R$ 5,69");
    expect(brl(1234.5)).toBe("R$ 1.234,50");
  });

  it("texto do resumo escapa MarkdownV2", () => {
    const t = textoResumo("Compras", itens);
    expect(t).toContain("Leite integral 1 L ×2");
    expect(t).toContain("R$ 11,38");
    expect(t).toContain("R$ 7,95");
    expect(t).toContain("\\(kg\\)");
  });
});

describe("erro de digitação", () => {
  it("distância com transposição", () => {
    expect(distancia("frando", "frango")).toBe(1);
    expect(distancia("arorz", "arroz")).toBe(1);
    expect(distancia("leite", "leite")).toBe(0);
  });

  it.each([
    ["file de frando 1kg", "frando", "frango"],
    ["fejao", "fejao", "feijao"],
    ["detergete", "detergete", "detergente"],
    ["macarão", "macarao", "macarrao"],
    ["papel igienico", "igienico", "higienico"],
  ])("%s: %s -> %s", (texto, de, para) => {
    const c = corrigir(texto, catalogo);
    expect(c?.trocas).toContainEqual({ de, para });
  });

  it("plural errado já casa direto, sem perguntar", () => {
    expect(corrigir("arros 5kg", catalogo)).toBeNull();
    expect(sugerir("arros 5kg", catalogo).sugestoes[0]!.item.id).toBe("arroz-branco-5kg");
  });

  it("não corrige o que já está certo nem inventa correção", () => {
    expect(corrigir("leite integral", catalogo)).toBeNull();
    expect(corrigir("açucar 1kg", catalogo)).toBeNull(); // acento faltando não é erro
    expect(corrigir("carregador de celular", catalogo)).toBeNull();
  });
});

describe("classificar", () => {
  it("casamento completo entra direto (sem perguntar)", () => {
    const c = classificar("arroz 5kg", 1, catalogo);
    expect(c.tipo).toBe("certo");
    if (c.tipo === "certo") expect(c.item.id).toBe("arroz-branco-5kg");
  });

  it("erro de digitação vira pergunta, antes de qualquer casamento parcial", () => {
    const c = classificar("file de frando 1kg", 1, catalogo);
    expect(c.tipo).toBe("correcao");
    if (c.tipo === "correcao") expect(c.texto).toBe("file de frango 1kg");
  });

  it("depois de corrigido, casamento parcial entra marcado como incerto", () => {
    const c = classificar("file de frango 1kg", 1, catalogo);
    expect(c.tipo).toBe("incerto");
    if (c.tipo === "incerto") expect(c.item.id).toMatch(/frango/);
  });

  it("fora do catálogo vira item livre", () => {
    expect(classificar("carregador de celular", 1, catalogo).tipo).toBe("livre");
  });

  it("escolha anterior do usuário vence", () => {
    const desnatado = catalogo.find((i) => i.id === "leite-desnatado-1l")!;
    const c = classificar("leite", 2, catalogo, desnatado);
    expect(c.tipo === "certo" && c.item.id).toBe("leite-desnatado-1l");
  });

  it("alternativas não repetem o item atual", () => {
    const a = alternativas("leite", "leite-integral-1l", catalogo);
    expect(a.length).toBeGreaterThan(0);
    expect(a.map((i) => i.id)).not.toContain("leite-integral-1l");
  });
});

describe("teclado de revisão", () => {
  const item = (id: number, perfil: ItemLista["perfil"]): ItemLista => ({
    id, textoOriginal: "leite", itemCanonicoId: "leite-integral-1l", nomeExibicao: "Leite integral 1 L", quantidade: 2,
    granel: false, incerto: false, faixa: { p10: 4.84, p50: 5.69, p90: 7.93 }, perfil, precoEstimado: 5.69, precoReal: null, marcado: false,
  });
  const botoes = (k: ReturnType<typeof tecladoRevisao>) => k.inline_keyboard.flat();

  it("marca o perfil escolhido e mostra o valor já multiplicado pela quantidade", () => {
    const textos = botoes(tecladoRevisao([item(1, "tipico")], 0, () => true)).map((b) => b.text);
    expect(textos).toContain("●T 11,38");
    expect(textos).toContain("E 9,68");
    expect(textos).toContain("P 15,86");
    expect(textos.some((t) => t.includes("🔄"))).toBe(true);
  });

  it("primeira linha é adicionar item", () => {
    const k = tecladoRevisao([item(1, "tipico")], 0, () => false);
    expect(k.inline_keyboard[0]!.map((b) => b.text)).toEqual(["➕ Adicionar item"]);
  });

  it("removidos aparecem com ↩️ para voltar", () => {
    const k = tecladoRevisao([item(1, "tipico")], 0, () => false, [{ id: 9, nome: "Café torrado e moído 500 g" }]);
    const b = k.inline_keyboard.flat() as { text: string; callback_data?: string }[];
    expect(b).toContainEqual(expect.objectContaining({ text: "↩️ Voltar: Café torrado e moído 500 g", callback_data: "u:9:0" }));
  });

  it("item sem faixa mostra ✏️ para informar o preço", () => {
    const livre: ItemLista = { ...item(1, null), itemCanonicoId: null, faixa: null, precoEstimado: null };
    expect(botoes(tecladoRevisao([livre], 0, () => false)).map((b) => b.text)).toContain("✏️ informar preço");
  });

  it("lista grande vira páginas dentro do limite de botões do Telegram", () => {
    const muitos = Array.from({ length: 40 }, (_, n) => item(n + 1, "tipico"));
    const p0 = botoes(tecladoRevisao(muitos, 0, () => true));
    expect(p0.length).toBeLessThanOrEqual(100);
    expect(p0.map((b) => (b as { callback_data?: string }).callback_data)).toContain("g:1");
    const ultima = botoes(tecladoRevisao(muitos, 2, () => true));
    const ids = ultima.map((b) => (b as { callback_data?: string }).callback_data).filter((d) => d?.startsWith("d:"));
    expect(ids.length).toBe(40 - 2 * ITENS_POR_PAGINA);
  });
});

describe("limites", () => {
  it("quantidade digitada tem teto", () => {
    expect(lerLista("999999999999 leite")).toEqual([{ texto: "leite", quantidade: QTD_MAX }]);
  });

  it("limitador libera depois da janela e avisa uma vez por janela", () => {
    let t = 0;
    const l = new Limitador({ max: 2, janelaMs: 1000 }, () => t);
    expect([l.permitir(1), l.permitir(1), l.permitir(1)]).toEqual([true, true, false]);
    expect(l.permitir(2)).toBe(true); // outro usuário não é afetado
    expect([l.avisar(1), l.avisar(1)]).toEqual([true, false]);
    t = 1001;
    expect(l.permitir(1)).toBe(true);
    expect(l.avisar(1)).toBe(true);
  });

  it("nome de outra pessoa sai curto", () => {
    expect(nomeCurto("x".repeat(64), "Alguém")).toHaveLength(32);
    expect(nomeCurto("  ", "Alguém")).toBe("Alguém");
  });
});
