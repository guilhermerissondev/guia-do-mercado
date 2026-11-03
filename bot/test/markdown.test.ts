// O Telegram recusa a mensagem inteira se o MarkdownV2 tiver caractere reservado sem escape.
import { describe, expect, it } from "vitest";

import { AJUDA } from "../src/bot.ts";
import { textoFaixa, textoLista, textoMercado, type ItemLista } from "../src/formato.ts";

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
  { id: 1, nomeExibicao: "Leite integral 1 L", quantidade: 2, granel: false, perfil: "tipico", precoEstimado: 5.69, precoReal: null, marcado: true },
  { id: 2, nomeExibicao: "Tomate (kg)", quantidade: 0.5, granel: true, perfil: "economico", precoEstimado: 15.89, precoReal: 16.5, marcado: false },
  { id: 3, nomeExibicao: "pão-de-queijo + café! [promo]", quantidade: 1, granel: false, perfil: null, precoEstimado: null, precoReal: null, marcado: false },
];

describe("MarkdownV2 válido", () => {
  it("validador acusa erro comum", () => {
    expect(errosMarkdownV2("Total: R$ 5.69")).not.toEqual([]);
    expect(errosMarkdownV2("*Total*: R$ 5\\.69")).toEqual([]);
  });

  it.each([
    ["ajuda", AJUDA],
    ["lista", textoLista("Lista de compras", itens)],
    ["lista vazia", textoLista("Lista de compras", [])],
    ["mercado", textoMercado("Lista de compras", itens)],
    ["faixa", textoFaixa("Café torrado e moído 500 g", "×2", {
      p10: 18.62, p50: 25.92, p90: 36.18, nivel: "intermediaria", nomeLocal: "região intermediária de Maringá",
      atualizadoEm: new Date(Date.now() - 3 * 86_400_000),
    })],
  ])("%s", (_nome, texto) => expect(errosMarkdownV2(texto)).toEqual([]));
});
