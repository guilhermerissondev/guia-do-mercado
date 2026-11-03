// Fluxos do bot. Montar a lista: texto livre -> item do catálogo -> faixa de preço.
// No mercado: marcar itens e corrigir preços, com o total atualizado na mesma mensagem.

import { Bot, type Context, InlineKeyboard } from "grammy";
import type { UserFromGetMe } from "grammy/types";

import {
  esc, qtd, tecladoFaixa, tecladoLista, tecladoMercado, tecladoSugestoes, textoFaixa, textoLista, textoMercado,
  totais, brl, type Perfil,
} from "./formato.ts";
import type { Repo } from "./repo.ts";
import { quantidadeFinal, sugerir } from "./sugestao.ts";
import { lerLista, lerValor, normalizar } from "./texto.ts";

const MD = { parse_mode: "MarkdownV2" as const };

export const AJUDA = [
  "*Como usar*",
  "",
  "Me mande os itens numa mensagem, separados por vírgula ou linha:",
  "_2 leite, arroz 5kg, café, tomate 1kg_",
  "",
  "Para cada item eu mostro o preço *econômico*, *típico* e *premium* da sua região, e você escolhe quanto quer considerar\\.",
  "",
  "No mercado, use /mercado: toque no item para marcar ✅ e em ✏️ para corrigir o preço que você viu\\.",
  "",
  "/lista — ver a lista e o total",
  "/mercado — modo mercado",
  "/nova — começar outra lista",
  "/cidade — trocar a cidade",
  "/cancelar — descartar itens ainda sem escolha",
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

  // ------------------------------------------------------------------ avançar a montagem da lista

  async function avancar(ctx: Context): Promise<void> {
    const usuario = await repo.usuario(uid(ctx));
    if (!usuario.municipio) return pedirCidade(ctx);
    const lista = await repo.listaAberta(usuario.telegramId);
    const catalogo = await repo.catalogo();

    for (;;) {
      const p = await repo.proximoPendente(lista.id);
      if (!p) {
        const itens = await repo.itensDaLista(lista.id);
        await ctx.reply(textoLista(lista.nome, itens), { ...MD, reply_markup: itens.length ? tecladoLista() : undefined });
        return;
      }

      if (p.etapa === "escolher_item") {
        const r = sugerir(p.textoOriginal, catalogo);
        const pref = await repo.preferencia(usuario.telegramId, normalizar(p.textoOriginal));
        const escolhido = (pref && catalogo.find((c) => c.id === pref)) || r.unica;
        if (escolhido) {
          await repo.definirItem(usuario.telegramId, p.id, escolhido, quantidadeFinal(escolhido, p.quantidade, r.medida));
          continue;
        }
        if (r.sugestoes.length === 0) {
          await repo.definirItem(usuario.telegramId, p.id, null);
          continue;
        }
        await ctx.reply(`Qual destes é *${esc(p.textoOriginal)}*?`, {
          ...MD,
          reply_markup: tecladoSugestoes(p.id, r.sugestoes.map((s) => s.item)),
        });
        return;
      }

      // escolher_preco
      const faixa = p.itemCanonicoId ? await repo.faixa(p.itemCanonicoId, usuario.municipio) : null;
      if (faixa) {
        await ctx.reply(textoFaixa(p.nomeExibicao, qtd(p), faixa), { ...MD, reply_markup: tecladoFaixa(p.id, faixa) });
        return;
      }
      await repo.aguardar(usuario.telegramId, "preco_estimado", p.id);
      await ctx.reply(
        `Ainda não tenho preço de *${esc(p.nomeExibicao)}* na sua região\\. Quanto você costuma pagar? ` +
          `Digite o valor${p.granel ? " por kg" : ""}, por exemplo _6,50_\\.`,
        { ...MD, reply_markup: new InlineKeyboard().text("Sem preço", `f:${p.id}:0`) },
      );
      return;
    }
  }

  async function pedirCidade(ctx: Context): Promise<void> {
    await repo.aguardar(uid(ctx), "cidade");
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
  bot.command("cidade", pedirCidade);
  bot.command("lista", avancar);
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
    await ctx.reply("Itens sem escolha descartados.");
  });

  bot.command("apagar_meus_dados", (ctx) =>
    ctx.reply("Isso apaga sua cidade, suas listas e suas escolhas. Não dá para desfazer. Confirma?", {
      reply_markup: new InlineKeyboard().text("Sim, apagar tudo", "x:apagar").text("Não", "x:manter"),
    }),
  );

  // ------------------------------------------------------------------ botões

  bot.callbackQuery(/^c:(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    await repo.usuario(uid(ctx));
    const r = await repo.definirMunicipio(uid(ctx), Number(ctx.match[1]));
    await repo.limparEstado(uid(ctx));
    await ctx.editMessageText(`📍 Cidade: ${r.nome}-${r.uf}`);
    if (!r.temPrecos) {
      await ctx.reply(
        "Ainda não tenho preços dos mercados da sua região. Vou começar a acompanhar: os preços são atualizados aos domingos. " +
          "Até lá, uso preços do estado ou do Brasil quando houver, ou você me diz quanto costuma pagar.",
      );
    }
    const lista = await repo.listaAberta(uid(ctx));
    if (await repo.proximoPendente(lista.id)) return avancar(ctx);
    await ctx.reply(AJUDA, MD);
  });

  bot.callbackQuery(/^i:(\d+):(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const p = await repo.item(uid(ctx), Number(ctx.match[1]));
    if (!p || p.etapa !== "escolher_item") return;
    const catalogo = await repo.catalogo();
    const escolhido = ctx.match[2] === "-" ? null : catalogo.find((c) => c.id === ctx.match[2]) ?? null;
    const medida = sugerir(p.textoOriginal, catalogo).medida;
    await repo.definirItem(uid(ctx), p.id, escolhido, escolhido ? quantidadeFinal(escolhido, p.quantidade, medida) : undefined);
    if (escolhido) await repo.lembrarPreferencia(uid(ctx), normalizar(p.textoOriginal), escolhido.id);
    await ctx.editMessageText(`✓ ${p.textoOriginal}: ${escolhido ? escolhido.nome : "item livre"}`);
    await avancar(ctx);
  });

  bot.callbackQuery(/^f:(\d+):([etpm0])$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const p = await repo.item(uid(ctx), Number(ctx.match[1]));
    if (!p || p.etapa !== "escolher_preco") return;
    const opcao = ctx.match[2]!;
    if (opcao === "m") {
      await repo.aguardar(uid(ctx), "preco_estimado", p.id);
      await ctx.editMessageText(`Digite quanto você quer considerar para ${p.nomeExibicao}${p.granel ? " (por kg)" : ""}, por exemplo 6,50.`);
      return;
    }
    if (opcao === "0") {
      await repo.definirPreco(uid(ctx), p.id, null, null, null);
      await repo.limparEstado(uid(ctx));
      await ctx.editMessageText(`✓ ${p.nomeExibicao}: sem preço`);
      return avancar(ctx);
    }
    const usuario = await repo.usuario(uid(ctx));
    const faixa = p.itemCanonicoId && usuario.municipio ? await repo.faixa(p.itemCanonicoId, usuario.municipio) : null;
    if (!faixa) return avancar(ctx);
    const perfil: Perfil = opcao === "e" ? "economico" : opcao === "p" ? "premium" : "tipico";
    const valor = opcao === "e" ? faixa.p10 : opcao === "p" ? faixa.p90 : faixa.p50;
    await repo.definirPreco(uid(ctx), p.id, perfil, valor, faixa.p50);
    const nomePerfil = { economico: "econômico", tipico: "típico", premium: "premium", manual: "manual" }[perfil];
    await ctx.editMessageText(`✓ ${p.nomeExibicao}: ${nomePerfil} ${brl(valor)}`);
    await avancar(ctx);
  });

  bot.callbackQuery(/^m:(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    if (await repo.alternarMarcado(uid(ctx), Number(ctx.match[1]))) await mostrarMercado(ctx, true);
  });

  bot.callbackQuery(/^r:(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const p = await repo.item(uid(ctx), Number(ctx.match[1]));
    if (!p) return;
    await repo.aguardar(uid(ctx), "preco_real", p.id);
    await ctx.reply(`Qual o preço de ${p.nomeExibicao} que você está vendo${p.granel ? " (por kg)" : ""}? Ex.: 6,20`);
  });

  bot.callbackQuery("v:mercado", async (ctx) => {
    await ctx.answerCallbackQuery();
    await mostrarMercado(ctx);
  });

  bot.callbackQuery("x:finalizar", async (ctx) => {
    await ctx.answerCallbackQuery();
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
    await ctx.answerCallbackQuery();
    await repo.apagarUsuario(uid(ctx));
    await ctx.editMessageText("Pronto, apaguei seus dados. Se quiser voltar, é só mandar /start.");
  });

  bot.callbackQuery("x:manter", async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.editMessageText("Nada foi apagado.");
  });

  // ------------------------------------------------------------------ texto livre

  bot.on("message:text", async (ctx) => {
    const texto = ctx.message.text.trim();
    const usuario = await repo.usuario(uid(ctx), ctx.from.first_name);
    const estado = await repo.estado(usuario.telegramId);

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
      await repo.limparEstado(usuario.telegramId);
      if (estado.aguardando === "preco_real") {
        await repo.definirPrecoReal(usuario.telegramId, estado.referencia, valor);
        return mostrarMercado(ctx);
      }
      const p = await repo.item(usuario.telegramId, estado.referencia);
      const base = p?.itemCanonicoId && usuario.municipio ? (await repo.faixa(p.itemCanonicoId, usuario.municipio))?.p50 ?? null : null;
      await repo.definirPreco(usuario.telegramId, estado.referencia, "manual", valor, base);
      await ctx.reply(`✓ ${p?.nomeExibicao ?? "Item"}: ${brl(valor)}`);
      return avancar(ctx);
    }

    const entradas = lerLista(texto);
    if (entradas.length === 0) {
      await ctx.reply("Me mande os itens da lista, por exemplo: 2 leite, arroz 5kg, café");
      return;
    }
    const lista = await repo.listaAberta(usuario.telegramId);
    await repo.adicionarItens(lista.id, entradas);
    await avancar(ctx);
  });

  bot.catch((err) => console.error("erro no bot:", err.error));
  return bot;
}

function ignorarSemMudanca(e: unknown): void {
  // O Telegram recusa editar para o mesmo conteúdo (toques repetidos); não é erro.
  if (!(e instanceof Error && e.message.includes("message is not modified"))) throw e;
}
