// Textos e teclados do bot. Puro: recebe dados, devolve texto e botões.

import { InlineKeyboard } from "grammy";

export type Perfil = "economico" | "tipico" | "premium" | "manual";

export interface ItemLista {
  id: number;
  nomeExibicao: string;
  quantidade: number;
  granel: boolean;
  perfil: Perfil | null;
  precoEstimado: number | null; // unitário
  precoReal: number | null;     // unitário
  marcado: boolean;
}

export interface Faixa {
  p10: number;
  p50: number;
  p90: number;
  nivel: "imediata" | "intermediaria" | "uf" | "brasil";
  nomeLocal: string; // ex.: "região de Maringá"
  atualizadoEm: Date;
}

export function brl(v: number): string {
  return "R$ " + v.toFixed(2).replace(".", ",").replace(/\B(?=(\d{3})+(?!\d),)/g, ".");
}

export function qtd(item: Pick<ItemLista, "quantidade" | "granel">): string {
  if (item.granel) return `${String(item.quantidade).replace(".", ",")} kg`;
  return item.quantidade === 1 ? "" : `×${item.quantidade}`;
}

function encurtar(t: string, max: number): string {
  return t.length <= max ? t : t.slice(0, max - 1) + "…";
}

export interface Totais {
  estimado: number;   // toda a lista pelo preço escolhido
  carrinho: number;   // itens marcados, pelo preço real quando informado
  falta: number;      // itens não marcados, pelo estimado
  previsao: number;   // carrinho + falta
  marcados: number;
  total: number;
}

/** Arredonda para centavos (meio para cima), sem o erro de ponto flutuante de 7,945. */
export function centavos(v: number): number {
  return Math.round((v + Number.EPSILON) * 100) / 100;
}

/** Cada linha é arredondada antes de somar, para os totais baterem com o que aparece na tela. */
export function totais(itens: ItemLista[]): Totais {
  let estimado = 0, carrinho = 0, falta = 0, marcados = 0;
  for (const i of itens) {
    const est = centavos((i.precoEstimado ?? 0) * i.quantidade);
    estimado += est;
    if (i.marcado) {
      carrinho += centavos((i.precoReal ?? i.precoEstimado ?? 0) * i.quantidade);
      marcados++;
    } else {
      falta += est;
    }
  }
  return {
    estimado: centavos(estimado), carrinho: centavos(carrinho), falta: centavos(falta),
    previsao: centavos(carrinho + falta), marcados, total: itens.length,
  };
}

export function idade(d: Date, agora = new Date()): string {
  const dias = Math.floor((agora.getTime() - d.getTime()) / 86_400_000);
  if (dias <= 0) return "hoje";
  if (dias === 1) return "ontem";
  return `há ${dias} dias`;
}

// ------------------------------------------------------------------ lista

export function textoLista(nome: string, itens: ItemLista[]): string {
  if (itens.length === 0) {
    return `🛒 *${esc(nome)}*\n\nSua lista está vazia\\. Me mande os itens, por exemplo:\n_2 leite, arroz 5kg, café_`;
  }
  const linhas = itens.map((i) => {
    const preco = i.precoEstimado === null ? "sem preço" : brl(centavos(i.precoEstimado * i.quantidade));
    const q = qtd(i);
    return `• ${esc(i.nomeExibicao)}${q ? " " + esc(q) : ""} — ${esc(preco)}`;
  });
  const t = totais(itens);
  return `🛒 *${esc(nome)}*\n\n${linhas.join("\n")}\n\n*Total estimado: ${esc(brl(t.estimado))}*`;
}

export function tecladoLista(): InlineKeyboard {
  return new InlineKeyboard().text("🛍️ Estou no mercado", "v:mercado").row().text("🧾 Finalizar lista", "x:finalizar");
}

// ------------------------------------------------------------------ modo mercado

export function textoMercado(nome: string, itens: ItemLista[]): string {
  const t = totais(itens);
  return [
    `🛍️ *${esc(nome)}* — ${t.marcados} de ${t.total} no carrinho`,
    "",
    `No carrinho: *${esc(brl(t.carrinho))}*`,
    `Falta pegar: ${esc(brl(t.falta))}`,
    `Previsão final: *${esc(brl(t.previsao))}*`,
    "",
    "_Toque no item para marcar\\. ✏️ corrige o preço que você viu\\._",
  ].join("\n");
}

export function tecladoMercado(itens: ItemLista[]): InlineKeyboard {
  const k = new InlineKeyboard();
  for (const i of itens) {
    const unit = i.precoReal ?? i.precoEstimado;
    const preco = unit === null ? "?" : brl(centavos(unit * i.quantidade)).replace("R$ ", "");
    const q = qtd(i);
    k.text(`${i.marcado ? "✅" : "⬜"} ${encurtar(i.nomeExibicao, 26)}${q ? " " + q : ""} · ${preco}`, `m:${i.id}`)
      .text("✏️", `r:${i.id}`)
      .row();
  }
  return k.text("🧾 Finalizar compra", "x:finalizar");
}

// ------------------------------------------------------------------ escolhas

export function tecladoSugestoes(itemListaId: number, sugestoes: { id: string; nome: string }[]): InlineKeyboard {
  const k = new InlineKeyboard();
  for (const s of sugestoes) k.text(s.nome, `i:${itemListaId}:${s.id}`).row();
  return k.text("Outro (sem preço do catálogo)", `i:${itemListaId}:-`);
}

export function textoFaixa(nome: string, quantidade: string, f: Faixa): string {
  const origem = f.nivel === "imediata" ? f.nomeLocal : `${f.nomeLocal} (sem dados da sua região)`;
  return [
    `*${esc(nome)}*${quantidade ? " " + esc(quantidade) : ""}`,
    `Preço em ${esc(origem)}, atualizado ${esc(idade(f.atualizadoEm))}:`,
    "",
    `Econômico: ${esc(brl(f.p10))}`,
    `Típico: ${esc(brl(f.p50))}`,
    `Premium: ${esc(brl(f.p90))}`,
    "",
    "Quanto você quer considerar?",
  ].join("\n");
}

export function tecladoFaixa(itemListaId: number, f: Faixa): InlineKeyboard {
  return new InlineKeyboard()
    .text(`Econômico ${brl(f.p10)}`, `f:${itemListaId}:e`)
    .row()
    .text(`Típico ${brl(f.p50)}`, `f:${itemListaId}:t`)
    .row()
    .text(`Premium ${brl(f.p90)}`, `f:${itemListaId}:p`)
    .row()
    .text("Outro valor", `f:${itemListaId}:m`)
    .text("Sem preço", `f:${itemListaId}:0`);
}

/** Escapa texto para MarkdownV2 do Telegram. */
export function esc(t: string): string {
  return t.replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, "\\$&");
}
