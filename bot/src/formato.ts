// Textos e teclados do bot. Puro: recebe dados, devolve texto e botões.

import { InlineKeyboard } from "grammy";

export type Perfil = "economico" | "tipico" | "premium" | "manual";

export interface ItemLista {
  id: number;
  textoOriginal: string;
  itemCanonicoId: string | null;
  nomeExibicao: string;
  quantidade: number;
  granel: boolean;
  incerto: boolean;             // casou só parte do texto
  faixa: { p10: number; p50: number; p90: number } | null; // da região, quando o item entrou
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
  fator: number; // ajuste aprendido com os preços dos usuários (1 = sem ajuste); já aplicado em p10/p50/p90
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

// ------------------------------------------------------------------ revisão da lista (uma mensagem só)

export const ITENS_POR_PAGINA = 15; // 5 botões por item + adicionar/navegação: cabe no limite de ~100 botões do Telegram

export function paginas(itens: unknown[]): number {
  return Math.max(1, Math.ceil(itens.length / ITENS_POR_PAGINA));
}

export function textoRevisao(nome: string, itens: ItemLista[], pagina: number, temRemovidos = false): string {
  if (itens.length === 0 && temRemovidos) {
    return `🛒 *${esc(nome)}*\n\nTodos os itens foram removidos\\. Toque em ↩️ para voltar algum, ou me mande novos itens\\.`;
  }
  if (itens.length === 0) {
    return `🛒 *${esc(nome)}*\n\nSua lista está vazia\\. Me mande os itens, por exemplo:\n_2 leite, arroz 5kg, café_`;
  }
  const t = totais(itens);
  const semPreco = itens.filter((i) => i.precoEstimado === null).length;
  const incertos = itens.filter((i) => i.incerto).length;
  const linhas = [
    `🛒 *${esc(nome)}* — ${itens.length} ${itens.length === 1 ? "item" : "itens"}`,
    `*Total estimado: ${esc(brl(t.estimado))}*`,
    "",
    "Toque em *E* \\(econômico\\), *T* \\(típico\\) ou *P* \\(premium\\) em cada item; o total muda na hora\\.",
    "➕ adiciona · 🔄 troca o item · 🗑 remove \\(↩️ desfaz\\)",
  ];
  if (incertos) linhas.push(`❓ ${incertos} ${incertos === 1 ? "item precisa" : "itens precisam"} de conferência: toque no nome para trocar\\.`);
  if (semPreco) linhas.push(`✏️ ${semPreco} sem preço da região: toque em ✏️ para informar\\.`);
  const n = paginas(itens);
  if (n > 1) linhas.push("", `_Página ${pagina + 1} de ${n}_`);
  return linhas.join("\n");
}

function rotuloFaixa(letra: string, valor: number, quantidade: number, marcado: boolean): string {
  return `${marcado ? "●" : ""}${letra} ${brl(centavos(valor * quantidade)).replace("R$ ", "")}`;
}

/**
 * Duas linhas por item: [nome · 🔄] [🗑] e [E] [T] [P] (ou [✏️ informar preço]).
 * `temAlternativas` diz se o 🔄 faz sentido para o item.
 */
export function tecladoRevisao(
  itens: ItemLista[],
  pagina: number,
  temAlternativas: (i: ItemLista) => boolean,
  removidos: { id: number; nome: string }[] = [],
): InlineKeyboard {
  const k = new InlineKeyboard().text("➕ Adicionar item", "add").row();
  const n = paginas(itens);
  const pag = Math.min(Math.max(pagina, 0), n - 1);
  for (const i of itens.slice(pag * ITENS_POR_PAGINA, (pag + 1) * ITENS_POR_PAGINA)) {
    const q = qtd(i);
    const nome = `${i.incerto ? "❓ " : ""}${encurtar(i.nomeExibicao, 30)}${q ? " " + q : ""}${temAlternativas(i) ? " 🔄" : ""}`;
    k.text(nome, `a:${i.id}:${pag}`).text("🗑", `d:${i.id}:${pag}`).row();
    if (i.faixa) {
      k.text(rotuloFaixa("E", i.faixa.p10, i.quantidade, i.perfil === "economico"), `t:${i.id}:e:${pag}`)
        .text(rotuloFaixa("T", i.faixa.p50, i.quantidade, i.perfil === "tipico"), `t:${i.id}:t:${pag}`)
        .text(rotuloFaixa("P", i.faixa.p90, i.quantidade, i.perfil === "premium"), `t:${i.id}:p:${pag}`)
        .row();
      if (i.perfil === "manual" && i.precoEstimado !== null) {
        k.text(`●✏️ ${brl(centavos(i.precoEstimado * i.quantidade))}`, `w:${i.id}:${pag}`).row();
      }
    } else {
      const v = i.precoEstimado === null ? "✏️ informar preço" : `✏️ ${brl(centavos(i.precoEstimado * i.quantidade))}`;
      k.text(v, `w:${i.id}:${pag}`).row();
    }
  }
  for (const r of removidos) k.text(`↩️ Voltar: ${encurtar(r.nome, 34)}`, `u:${r.id}:${pag}`).row();
  if (n > 1) {
    if (pag > 0) k.text("⬅️ Anterior", `g:${pag - 1}`);
    if (pag < n - 1) k.text("Próxima ➡️", `g:${pag + 1}`);
    k.row();
  }
  return k.text("✅ Pronto", "ok").text("🛍️ Estou no mercado", "v:mercado");
}

/** Troca do item (🔄): substitui o teclado da revisão pelas opções, na mesma mensagem. */
export function tecladoAlternativas(itemListaId: number, pagina: number, opcoes: { id: string; nome: string }[]): InlineKeyboard {
  const k = new InlineKeyboard();
  for (const o of opcoes) k.text(o.nome, `s:${itemListaId}:${o.id}:${pagina}`).row();
  return k.text("Item livre (sem preço da região)", `s:${itemListaId}:-:${pagina}`).row().text("⬅️ Voltar", `g:${pagina}`);
}

export function textoResumo(nome: string, itens: ItemLista[]): string {
  const t = totais(itens);
  const linhas = itens.map((i) => {
    const preco = i.precoEstimado === null ? "sem preço" : brl(centavos(i.precoEstimado * i.quantidade));
    const q = qtd(i);
    return `• ${esc(i.nomeExibicao)}${q ? " " + esc(q) : ""} — ${esc(preco)}`;
  });
  return `🛒 *${esc(nome)}*\n\n${linhas.join("\n")}\n\n*Total estimado: ${esc(brl(t.estimado))}*`;
}

export function tecladoResumo(): InlineKeyboard {
  return new InlineKeyboard().text("➕ Adicionar item", "add").text("✏️ Ajustar", "g:0").row().text("🛍️ Estou no mercado", "v:mercado").row().text("🧾 Finalizar lista", "x:finalizar");
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

/** Escapa texto para MarkdownV2 do Telegram. */
export function esc(t: string): string {
  return t.replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, "\\$&");
}
