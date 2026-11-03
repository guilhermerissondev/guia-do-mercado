// Sugere itens do catálogo para o texto livre do usuário ("leite" -> leite integral 1 L, ...).

import { extrairMedida, normalizar, type Medida } from "./texto.ts";

export interface ItemCatalogo {
  id: string;
  nome: string;
  busca: string; // palavras de busca (gerado do catálogo)
  granel: boolean;
  conteudoValor: number | null;
  conteudoUnidade: "g" | "ml" | "un" | null;
  ordem: number; // ordem no catálogo: o primeiro de cada tipo é o mais comum
}

export interface Sugestao {
  item: ItemCatalogo;
  pontos: number;
  completa: boolean; // todas as palavras digitadas aparecem no item
}

export interface ResultadoSugestao {
  sugestoes: Sugestao[];
  /** Quando há um só candidato claro, o bot escolhe sem perguntar. */
  unica: ItemCatalogo | null;
  /** Quantidade em kg derivada do tamanho digitado, para itens a granel ("tomate 2kg"). */
  medida: Medida | null;
}

const VAZIAS = new Set(["de", "do", "da", "e", "em", "com", "para", "tipo", "sem", "o", "a", "os", "as", "pacote", "pct"]);

function raiz(p: string): string {
  return p.length > 3 && p.endsWith("s") ? p.slice(0, -1) : p;
}

function casaPalavra(palavra: string, busca: string[]): boolean {
  const r = raiz(palavra);
  return busca.some((b) => {
    const rb = raiz(b);
    return rb === r || (r.length >= 4 && rb.startsWith(r));
  });
}

export function sugerir(texto: string, catalogo: ItemCatalogo[], limite = 4): ResultadoSugestao {
  const { medida, resto } = extrairMedida(normalizar(texto));
  const palavras = resto.split(" ").filter((p) => p && !VAZIAS.has(p) && !/^\d+$/.test(p));
  if (palavras.length === 0) return { sugestoes: [], unica: null, medida };

  const pontuadas: Sugestao[] = [];
  for (const item of catalogo) {
    const busca = item.busca.split(" ");
    const acertos = palavras.filter((p) => casaPalavra(p, busca)).length;
    if (acertos === 0) continue;
    let pontos = acertos / palavras.length;
    // "tomate" prefere "Tomate (kg)" a "Molho de tomate": o nome começa pela palavra digitada
    if (casaPalavra(palavras[0]!, [normalizar(item.nome).split(" ")[0]!])) pontos += 0.2;
    if (medida && item.conteudoValor !== null) {
      pontos += item.conteudoUnidade === medida.unidade && Math.abs(item.conteudoValor - medida.valor) < 1 ? 0.5 : -0.2;
    }
    if (medida && item.granel && medida.unidade === "g") pontos += 0.3;
    pontuadas.push({ item, pontos, completa: acertos === palavras.length });
  }

  pontuadas.sort((a, b) => b.pontos - a.pontos || a.item.ordem - b.item.ordem);
  const completas = pontuadas.filter((s) => s.completa);
  const sugestoes = (completas.length > 0 ? completas : pontuadas).slice(0, limite);
  const unica = completas.length === 1 ? completas[0]!.item : null;
  return { sugestoes, unica, medida };
}

/** Quantidade final: para granel, o tamanho digitado vira kg ("tomate 500g" -> 0,5). */
export function quantidadeFinal(item: ItemCatalogo, quantidade: number, medida: Medida | null): number {
  if (item.granel && medida && medida.unidade === "g") return Math.round((quantidade * medida.valor) / 10) / 100;
  return quantidade;
}
