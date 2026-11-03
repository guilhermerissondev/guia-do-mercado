import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { brl, textoLista, totais, type ItemLista } from "../src/formato.ts";
import { quantidadeFinal, sugerir, type ItemCatalogo } from "../src/sugestao.ts";
import { lerLista, lerValor, normalizar } from "../src/texto.ts";

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
    { id: 1, nomeExibicao: "Leite integral 1 L", quantidade: 2, granel: false, perfil: "tipico", precoEstimado: 5.69, precoReal: 6.2, marcado: true },
    { id: 2, nomeExibicao: "Arroz branco tipo 1 5 kg", quantidade: 1, granel: false, perfil: "tipico", precoEstimado: 24.99, precoReal: null, marcado: false },
    { id: 3, nomeExibicao: "Tomate (kg)", quantidade: 0.5, granel: true, perfil: "economico", precoEstimado: 15.89, precoReal: null, marcado: true },
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

  it("texto da lista escapa MarkdownV2", () => {
    const t = textoLista("Compras", itens);
    expect(t).toContain("Leite integral 1 L ×2");
    expect(t).toContain("R$ 11,38");
    expect(t).toContain("R$ 7,95");
    expect(t).toContain("\\(kg\\)");
  });
});
