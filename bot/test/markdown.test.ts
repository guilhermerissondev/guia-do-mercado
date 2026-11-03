// O Telegram recusa a mensagem inteira se o MarkdownV2 tiver caractere reservado sem escape.
import { describe, expect, it } from "vitest";

import { AJUDA } from "../src/bot.ts";
import { textoMercado, textoResumo, textoRevisao, type ItemLista } from "../src/formato.ts";

const RESERVADOS = new Set("_*[]()~`>#+-=|{}.!".split(""));

/** Erros de MarkdownV2: reservados sem escape (fora de * e _ usados como formatação) e * ou _ sem par. */
function errosMarkdownV2(t: string): string[] {
  const erros: string[] = [];
  let negrito = false, italico = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i]!;
    if (c === "\\") { i++; continue; }
    if (c === "*") { negrito = !negrito; continue; }
    if (c === "_") { italico = !italico; continue; }
    if (RESERVADOS.has(c)) erros.push(`'${c}' sem escape na posição ${i}: …${t.slice(Math.max(0, i - 15), i + 5)}…`);
  }
  if (negrito) erros.push("* sem par");
  if (italico) erros.push("_ sem par");
  return erros;
}

const itens: ItemLista[] = [
  { id: 1, textoOriginal: "x", itemCanonicoId: null, incerto: false, faixa: null, nomeExibicao: "Leite integral 1 L", quantidade: 2, granel: false, perfil: "tipico", precoEstimado: 5.69, precoReal: null, marcado: true },
  { id: 2, textoOriginal: "x", itemCanonicoId: null, incerto: true, faixa: null, nomeExibicao: "Tomate (kg)", quantidade: 0.5, granel: true, perfil: "economico", precoEstimado: 15.89, precoReal: 16.5, marcado: false },
  { id: 3, textoOriginal: "x", itemCanonicoId: null, incerto: false, faixa: null, nomeExibicao: "pão-de-queijo + café! [promo]", quantidade: 1, granel: false, perfil: null, precoEstimado: null, precoReal: null, marcado: false },
];

describe("MarkdownV2 válido", () => {
  it("validador acusa erro comum", () => {
    expect(errosMarkdownV2("Total: R$ 5.69")).not.toEqual([]);
    expect(errosMarkdownV2("*Total*: R$ 5\\.69")).toEqual([]);
  });

  it.each([
    ["ajuda", AJUDA],
    ["revisão", textoRevisao("Lista de compras", itens, 0)],
    ["revisão paginada", textoRevisao("Lista de compras", Array(40).fill(itens[0]), 1)],
    ["revisão vazia", textoRevisao("Lista de compras", [], 0)],
    ["revisão só com removidos", textoRevisao("Lista de compras", [], 0, true)],
    ["resumo", textoResumo("Lista de compras", itens)],
    ["mercado", textoMercado("Lista de compras", itens)],
  ])("%s", (_nome, texto) => expect(errosMarkdownV2(texto)).toEqual([]));
});
