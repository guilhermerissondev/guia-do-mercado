// Decide o que fazer com cada item digitado, sem perguntar nada além do erro de digitação.

import { corrigir, quantidadeFinal, sugerir, type ItemCatalogo } from "./sugestao.ts";

export type Classificacao =
  | { tipo: "certo"; item: ItemCatalogo; quantidade: number }      // casou por completo (ou escolha anterior)
  | { tipo: "incerto"; item: ItemCatalogo; quantidade: number }    // casou só parte: entra com ❓
  | { tipo: "correcao"; texto: string; trocas: { de: string; para: string }[] } // perguntar "você quis dizer?"
  | { tipo: "livre" };                                              // fora do catálogo: sem preço

export function classificar(
  texto: string,
  quantidade: number,
  catalogo: ItemCatalogo[],
  preferido: ItemCatalogo | null = null,
): Classificacao {
  const r = sugerir(texto, catalogo);
  if (preferido) return { tipo: "certo", item: preferido, quantidade: quantidadeFinal(preferido, quantidade, r.medida) };

  const melhor = r.sugestoes[0];
  if (melhor?.completa) return { tipo: "certo", item: melhor.item, quantidade: quantidadeFinal(melhor.item, quantidade, r.medida) };

  // Antes de aceitar um casamento parcial, vê se é erro de digitação ("file de frando" -> "frango")
  const c = corrigir(texto, catalogo);
  if (c) return { tipo: "correcao", texto: c.texto, trocas: c.trocas };

  if (melhor) return { tipo: "incerto", item: melhor.item, quantidade: quantidadeFinal(melhor.item, quantidade, r.medida) };
  return { tipo: "livre" };
}

/** Outras opções do catálogo para o mesmo texto (botão 🔄), sem o item atual. */
export function alternativas(texto: string, atual: string | null, catalogo: ItemCatalogo[], limite = 5): ItemCatalogo[] {
  return sugerir(texto, catalogo, limite + 1).sugestoes.map((s) => s.item).filter((i) => i.id !== atual).slice(0, limite);
}
