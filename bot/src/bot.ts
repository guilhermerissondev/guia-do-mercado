// Fluxos do bot.
// Montar a lista: texto livre -> (só se houver erro de digitação: "você quis dizer?") -> uma mensagem
// com todos os itens, típico marcado, e botões E/T/P por item.
// No mercado: marcar itens e corrigir preços, com o total atualizado na mesma mensagem.

import { Bot, type Context, InlineKeyboard } from "grammy";
import type { UserFromGetMe } from "grammy/types";

import {
  brl, esc, ITENS_POR_PAGINA, tecladoAlternativas, tecladoMercado, tecladoResumo, tecladoRevisao,
  textoMercado, textoResumo, textoRevisao, totais, type ItemLista,
} from "./formato.ts";
import { alternativas, classificar } from "./montagem.ts";
import type { NovoItem, Repo, Usuario } from "./repo.ts";
import { quantidadeFinal, sugerir, type ItemCatalogo } from "./sugestao.ts";
import { lerLista, lerValor, normalizar } from "./texto.ts";

const MD = { parse_mode: "MarkdownV2" as const };

export const AJUDA = [
  "*Como usar*",
  "",
  "Me mande os itens numa mensagem, separados por vírgula ou linha:",
  "_2 leite, arroz 5kg, café, tomate 1kg_",
  "",
  "Eu monto a lista com o preço *típico* da sua região\\. Em cada item você pode trocar para *E* \\(econômico\\) ou *P* \\(premium\\), e o total muda na hora\\.",
  "",
  "No mercado, use /mercado: toque no item para marcar ✅ e em ✏️ para corrigir o preço que você viu\\.",
  "",
  "/lista — ver e ajustar a lista",
  "/mercado — modo mercado",
  "/nova — começar outra lista",
  "/cidade — trocar a cidade",
  "/cancelar — descartar perguntas pendentes",
  "/apagar\\_meus\\_dados — apagar tudo o que guardei sobre você",
].join("\n");

export interface Opcoes {
  botInfo?: UserFromGetMe; // nos testes, evita a chamada getMe
}

export function criarBot(token: string, repo: Repo, opcoes: Opcoes = {}): Bot {
  const bot = new Bot(token, opcoes.botInfo ? { botInfo: opcoes.botInfo } : {});

  // Idempotência: o Telegram pode reenviar a mesma atualização
  bot.use(async (ctx, next) => {
    if (await repo.registrarUpdate(ctx.update.update_id)) await next();
  });

  const uid = (ctx: Context) => ctx.from!.id;

  // ------------------------------------------------------------------ montagem

  /** Classifica o texto e prepara o que gravar, já com a faixa da região quando houver. */
  async function preparar(u: Usuario, texto: string, quantidade: number, catalogo: ItemCatalogo[], comCorrecao = true): Promise<NovoItem> {
    const pref = await repo.preferencia(u.telegramId, normalizar(texto));
    const c = classificar(texto, quantidade, catalogo, pref ? catalogo.find((i) => i.id === pref) ?? null : null);
    if (c.tipo === "correcao") {
      return comCorrecao ? { tipo: "correcao", texto, quantidade, correcao: c.texto } : { tipo: "livre", texto, quantidade };
    }
    if (c.tipo === "livre") return { tipo: "livre", texto, quantidade };
    const faixa = u.municipio ? await repo.faixa(c.item.id, u.municipio) : null;
    return { tipo: "catalogo", texto, quantidade: c.quantidade, item: c.item, incerto: c.tipo === "incerto", faixa };
  }

  async function adicionar(u: Usuario, mensagem: string): Promise<boolean> {
    const entradas = lerLista(mensagem);
    if (entradas.length === 0) return false;
    const lista = await repo.listaAberta(u.telegramId);
    const catalogo = await repo.catalogo();
    let ordem = await repo.proximaOrdem(lista.id);
    for (const e of entradas) await repo.inserirItem(lista.id, ordem++, await preparar(u, e.texto, e.quantidade, catalogo));
    return true;
  }

  /** Pergunta a próxima correção pendente ou mostra a lista para ajuste. */
  async function continuar(ctx: Context, pagina = 0, editar = false): Promise<void> {
    const u = await repo.usuario(uid(ctx));
    if (!u.municipio) return pedirCidade(ctx);
    const lista = await repo.listaAberta(u.telegramId);
    const c = await repo.proximaCorrecao(lista.id);
    if (c && c.correcao) {
      await ctx.reply(`Não encontrei *${esc(c.textoOriginal)}*\\. Você quis dizer *${esc(c.correcao)}*?`, {
        ...MD,
        reply_markup: new InlineKeyboard().text("✓ Sim", `k:${c.id}:s`).text("✗ Não, deixar como escrevi", `k:${c.id}:n`),
      });
      return;
    }
    await mostrarRevisao(ctx, pagina, editar);
  }

  async function mostrarRevisao(ctx: Context, pagina: number, editar: boolean): Promise<void> {
    const lista = await repo.listaAberta(uid(ctx));
    const itens = await repo.itensDaLista(lista.id);
    const catalogo = await repo.catalogo();
    const removidos = await repo.removidos(lista.id);
    const temAlt = (i: ItemLista) => alternativas(i.textoOriginal, i.itemCanonicoId, catalogo).length > 0;
    const texto = textoRevisao(lista.nome, itens, pagina, removidos.length > 0);
    const teclado = itens.length || removidos.length ? tecladoRevisao(itens, pagina, temAlt, removidos) : undefined;
    if (editar) await ctx.editMessageText(texto, { ...MD, reply_markup: teclado }).catch(ignorarSemMudanca);
    else await ctx.reply(texto, { ...MD, reply_markup: teclado });
  }

  async function pedirCidade(ctx: Context, textoPendente: string | null = null): Promise<void> {
    await repo.aguardar(uid(ctx), "cidade", null, textoPendente);
    await ctx.reply("Em qual cidade você faz suas compras? Digite o nome, por exemplo: Maringá");
  }

  async function mostrarMercado(ctx: Context, editar = false): Promise<void> {
    const lista = await repo.listaAberta(uid(ctx));
    const itens = await repo.itensDaLista(lista.id);
    if (itens.length === 0) {
      await ctx.reply("Sua lista está vazia. Me mande os itens primeiro, por exemplo: 2 leite, arroz 5kg, café");
      return;
    }
    const texto = textoMercado(lista.nome, itens);
    const teclado = tecladoMercado(itens);
    if (editar) await ctx.editMessageText(texto, { ...MD, reply_markup: teclado }).catch(ignorarSemMudanca);
    else await ctx.reply(texto, { ...MD, reply_markup: teclado });
  }

  async function paginaDe(ctx: Context, itemId: number): Promise<number> {
    const lista = await repo.listaAberta(uid(ctx));
    const idx = (await repo.itensDaLista(lista.id)).findIndex((i) => i.id === itemId);
    return idx < 0 ? 0 : Math.floor(idx / ITENS_POR_PAGINA);
  }

  // ------------------------------------------------------------------ comandos

  bot.command("start", async (ctx) => {
    const u = await repo.usuario(uid(ctx), ctx.from?.first_name);
    await ctx.reply(
      `Olá${ctx.from?.first_name ? ", " + esc(ctx.from.first_name) : ""}\\! Eu organizo sua lista de compras e estimo quanto ela vai custar com preços de mercados da sua região\\.`,
      MD,
    );
    if (!u.municipio) return pedirCidade(ctx);
    await ctx.reply(AJUDA, MD);
  });

  bot.command("ajuda", (ctx) => ctx.reply(AJUDA, MD));
  bot.command("cidade", (ctx) => pedirCidade(ctx));
  bot.command("lista", (ctx) => continuar(ctx));
  bot.command("mercado", (ctx) => mostrarMercado(ctx));

  bot.command("nova", async (ctx) => {
    await repo.usuario(uid(ctx));
    await repo.finalizarLista(uid(ctx));
    await repo.listaAberta(uid(ctx));
    await ctx.reply("Lista nova criada. Me mande os itens.");
  });

  bot.command("cancelar", async (ctx) => {
    const lista = await repo.listaAberta(uid(ctx));
    await repo.removerPendentes(lista.id);
    await repo.limparEstado(uid(ctx));
    await ctx.reply("Perguntas pendentes descartadas.");
  });

  bot.command("apagar_meus_dados", (ctx) =>
    ctx.reply("Isso apaga sua cidade, suas listas e suas escolhas. Não dá para desfazer. Confirma?", {
      reply_markup: new InlineKeyboard().text("Sim, apagar tudo", "x:apagar").text("Não", "x:manter"),
    }),
  );

  // ------------------------------------------------------------------ cidade

  bot.callbackQuery(/^c:(\d+)$/, async (ctx) => {
    await responder(ctx);
    await repo.usuario(uid(ctx));
    const pendente = (await repo.estado(uid(ctx)))?.texto ?? null;
    const r = await repo.definirMunicipio(uid(ctx), Number(ctx.match[1]));
    await repo.limparEstado(uid(ctx));
    await ctx.editMessageText(`📍 Cidade: ${r.nome}-${r.uf}`);
    if (!r.temPrecos) {
      await ctx.reply(
        "Ainda não tenho preços dos mercados da sua região. Vou começar a acompanhar: os preços são atualizados aos domingos. " +
          "Até lá, uso preços do estado ou do Brasil quando houver, ou você me diz quanto costuma pagar.",
      );
    }
    if (pendente && (await adicionar(await repo.usuario(uid(ctx)), pendente))) return continuar(ctx);
    await ctx.reply(AJUDA, MD);
  });

  // ------------------------------------------------------------------ correção de digitação

  bot.callbackQuery(/^k:(\d+):([sn])$/, async (ctx) => {
    await responder(ctx);
    const item = await repo.item(uid(ctx), Number(ctx.match[1]));
    if (!item || item.etapa !== "confirmar_correcao" || !item.correcao) return;
    const u = await repo.usuario(uid(ctx));
    const catalogo = await repo.catalogo();
    if (ctx.match[2] === "s") {
      // A quantidade digitada já foi separada; o texto corrigido pode trazer o tamanho ("1kg")
      const novo = await preparar(u, item.correcao, item.quantidade, catalogo, false);
      await repo.substituirItem(u.telegramId, item.id, { ...novo, texto: item.correcao });
      await ctx.editMessageText(`✓ ${item.textoOriginal} → ${novo.tipo === "catalogo" ? novo.item.nome : item.correcao}`);
    } else {
      await repo.substituirItem(u.telegramId, item.id, { tipo: "livre", texto: item.textoOriginal, quantidade: item.quantidade });
      await ctx.editMessageText(`✓ ${item.textoOriginal}: mantido como escrito (sem preço da região)`);
    }
    await continuar(ctx);
  });

  // ------------------------------------------------------------------ revisão da lista

  bot.callbackQuery(/^t:(\d+):([etp]):(\d+)$/, async (ctx) => {
    const perfil = ({ e: "economico", t: "tipico", p: "premium" } as const)[ctx.match[2] as "e" | "t" | "p"];
    await repo.definirPerfil(uid(ctx), Number(ctx.match[1]), perfil);
    await responder(ctx);
    await mostrarRevisao(ctx, Number(ctx.match[3]), true);
  });

  bot.callbackQuery(/^a:(\d+):(\d+)$/, async (ctx) => {
    const item = await repo.item(uid(ctx), Number(ctx.match[1]));
    if (!item) return responder(ctx);
    const opcoes = alternativas(item.textoOriginal, item.itemCanonicoId, await repo.catalogo());
    if (opcoes.length === 0) return responder(ctx, { text: "Não tenho outras opções para este item." });
    await responder(ctx);
    await ctx.editMessageText(`Trocar *${esc(item.nomeExibicao)}* \\(você escreveu _${esc(item.textoOriginal)}_\\) por:`, {
      ...MD,
      reply_markup: tecladoAlternativas(item.id, Number(ctx.match[2]), opcoes),
    });
  });

  bot.callbackQuery(/^s:(\d+):([^:]+):(\d+)$/, async (ctx) => {
    await responder(ctx);
    const item = await repo.item(uid(ctx), Number(ctx.match[1]));
    if (!item) return;
    const u = await repo.usuario(uid(ctx));
    const catalogo = await repo.catalogo();
    const escolhido = ctx.match[2] === "-" ? null : catalogo.find((c) => c.id === ctx.match[2]) ?? null;
    if (escolhido) {
      const medida = sugerir(item.textoOriginal, catalogo).medida;
      const faixa = u.municipio ? await repo.faixa(escolhido.id, u.municipio) : null;
      await repo.substituirItem(u.telegramId, item.id, {
        tipo: "catalogo", texto: item.textoOriginal, quantidade: quantidadeFinal(escolhido, item.quantidade, medida),
        item: escolhido, incerto: false, faixa,
      });
      await repo.lembrarPreferencia(u.telegramId, normalizar(item.textoOriginal), escolhido.id);
    } else {
      await repo.substituirItem(u.telegramId, item.id, { tipo: "livre", texto: item.textoOriginal, quantidade: item.quantidade });
    }
    await mostrarRevisao(ctx, Number(ctx.match[3]), true);
  });

  bot.callbackQuery(/^d:(\d+):(\d+)$/, async (ctx) => {
    await repo.removerItem(uid(ctx), Number(ctx.match[1]));
    await responder(ctx, { text: "Item removido. Use ↩️ para desfazer." });
    await mostrarRevisao(ctx, Number(ctx.match[2]), true);
  });

  bot.callbackQuery(/^u:(\d+):(\d+)$/, async (ctx) => {
    await repo.restaurarItem(uid(ctx), Number(ctx.match[1]));
    await responder(ctx, { text: "Item de volta na lista" });
    await mostrarRevisao(ctx, Number(ctx.match[2]), true);
  });

  bot.callbackQuery(/^w:(\d+):(\d+)$/, async (ctx) => {
    await responder(ctx);
    const item = await repo.item(uid(ctx), Number(ctx.match[1]));
    if (!item) return;
    await repo.aguardar(uid(ctx), "preco_estimado", item.id);
    await ctx.reply(`Quanto você quer considerar para ${item.nomeExibicao}${item.granel ? " (por kg)" : ""}? Digite o valor, por exemplo 6,50.`);
  });

  bot.callbackQuery("add", async (ctx) => {
    await responder(ctx);
    await repo.limparEstado(uid(ctx)); // a próxima mensagem de texto entra como itens da lista
    await ctx.reply("O que você quer adicionar? Pode mandar um ou vários, separados por vírgula. Ex.: sabão em pó, 2 iogurte");
  });

  bot.callbackQuery(/^g:(\d+)$/, async (ctx) => {
    await responder(ctx);
    await mostrarRevisao(ctx, Number(ctx.match[1]), true);
  });

  bot.callbackQuery("ok", async (ctx) => {
    await responder(ctx);
    const lista = await repo.listaAberta(uid(ctx));
    const itens = await repo.itensDaLista(lista.id);
    await ctx.editMessageText(textoResumo(lista.nome, itens), { ...MD, reply_markup: tecladoResumo() }).catch(ignorarSemMudanca);
  });

  // ------------------------------------------------------------------ mercado

  bot.callbackQuery(/^m:(\d+)$/, async (ctx) => {
    await responder(ctx);
    if (await repo.alternarMarcado(uid(ctx), Number(ctx.match[1]))) await mostrarMercado(ctx, true);
  });

  bot.callbackQuery(/^r:(\d+)$/, async (ctx) => {
    await responder(ctx);
    const item = await repo.item(uid(ctx), Number(ctx.match[1]));
    if (!item) return;
    await repo.aguardar(uid(ctx), "preco_real", item.id);
    await ctx.reply(`Qual o preço de ${item.nomeExibicao} que você está vendo${item.granel ? " (por kg)" : ""}? Ex.: 6,20`);
  });

  bot.callbackQuery("v:mercado", async (ctx) => {
    await responder(ctx);
    await mostrarMercado(ctx);
  });

  bot.callbackQuery("x:finalizar", async (ctx) => {
    await responder(ctx);
    const lista = await repo.listaAberta(uid(ctx));
    const t = totais(await repo.itensDaLista(lista.id));
    await repo.finalizarLista(uid(ctx));
    await ctx.reply(
      `🧾 Compra finalizada\\.\n\nEstimado: ${esc(brl(t.estimado))}\nNo carrinho: *${esc(brl(t.carrinho))}*\n` +
        `Itens pegos: ${t.marcados} de ${t.total}\n\nPara a próxima, é só me mandar os itens\\.`,
      MD,
    );
  });

  bot.callbackQuery("x:apagar", async (ctx) => {
    await responder(ctx);
    await repo.apagarUsuario(uid(ctx));
    await ctx.editMessageText("Pronto, apaguei seus dados. Se quiser voltar, é só mandar /start.");
  });

  bot.callbackQuery("x:manter", async (ctx) => {
    await responder(ctx);
    await ctx.editMessageText("Nada foi apagado.");
  });

  // ------------------------------------------------------------------ texto livre

  bot.on("message:text", async (ctx) => {
    const texto = ctx.message.text.trim();
    const u = await repo.usuario(uid(ctx), ctx.from.first_name);
    const estado = await repo.estado(u.telegramId);

    if (estado?.aguardando === "cidade") {
      const opcoes = await repo.buscarMunicipio(texto);
      if (opcoes.length === 0) {
        await ctx.reply("Não achei essa cidade. Tente de novo, só com o nome (ex.: Maringá).");
        return;
      }
      const k = new InlineKeyboard();
      for (const m of opcoes) k.text(`${m.nome}-${m.uf}`, `c:${m.id}`).row();
      await ctx.reply("Qual delas?", { reply_markup: k });
      return;
    }

    if (estado && (estado.aguardando === "preco_estimado" || estado.aguardando === "preco_real") && estado.referencia) {
      const valor = lerValor(texto);
      if (valor === null) {
        await ctx.reply("Não entendi o valor. Digite só o número, por exemplo 6,20 (ou /cancelar).");
        return;
      }
      await repo.limparEstado(u.telegramId);
      if (estado.aguardando === "preco_real") {
        await repo.definirPrecoReal(u.telegramId, estado.referencia, valor);
        return mostrarMercado(ctx);
      }
      await repo.definirPrecoManual(u.telegramId, estado.referencia, valor);
      return mostrarRevisao(ctx, await paginaDe(ctx, estado.referencia), false);
    }

    if (!u.municipio) {
      if (lerLista(texto).length > 0) await ctx.reply("Antes de montar a lista, preciso saber sua cidade para buscar os preços.");
      return pedirCidade(ctx, texto);
    }

    if (!(await adicionar(u, texto))) {
      await ctx.reply("Me mande os itens da lista, por exemplo: 2 leite, arroz 5kg, café");
      return;
    }
    await continuar(ctx);
  });

  bot.catch((err) => console.error("erro no bot:", err.error));
  return bot;
}

/**
 * Responde ao toque no botão. Se o toque é antigo (o bot estava parado), o Telegram recusa a
 * resposta; isso não pode impedir a ação.
 */
async function responder(ctx: Context, opcoes?: { text?: string }): Promise<void> {
  await ctx.answerCallbackQuery(opcoes).catch(() => undefined);
}

function ignorarSemMudanca(e: unknown): void {
  // O Telegram recusa editar para o mesmo conteúdo (toques repetidos); não é erro.
  if (!(e instanceof Error && e.message.includes("message is not modified"))) throw e;
}
