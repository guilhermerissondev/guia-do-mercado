// M6: duas pessoas na mesma lista, contra um Postgres real (tools/test-integracao.sh).

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { criarBot } from "../src/bot.ts";
import { conectar, Repo, type Sql } from "../src/repo.ts";

const URL_DB = process.env.DATABASE_URL;
const ANA = 990_000_011;
const BETO = 990_000_012;
const INTRUSO = 990_000_013;
const MARINGA = 4115200;

interface Chamada { metodo: string; payload: any }

describe.skipIf(!URL_DB)("lista compartilhada", () => {
  let sql: Sql;
  let bot: ReturnType<typeof criarBot>;
  let chamadas: Chamada[] = [];
  let updateId = 3_000_000 + Math.floor(Math.random() * 1_000_000);
  let messageId = 1;

  const pessoa = (id: number, nome: string) => ({
    chat: { id, type: "private" as const, first_name: nome },
    from: { id, is_bot: false, first_name: nome },
  });
  const P: Record<number, ReturnType<typeof pessoa>> = {
    [ANA]: pessoa(ANA, "Ana"), [BETO]: pessoa(BETO, "Beto"), [INTRUSO]: pessoa(INTRUSO, "Intruso"),
  };

  async function enviar(de: number, texto: string): Promise<Chamada[]> {
    chamadas = [];
    const entities = texto.startsWith("/") ? [{ type: "bot_command" as const, offset: 0, length: texto.split(" ")[0]!.length }] : undefined;
    await bot.handleUpdate({
      update_id: updateId++,
      message: { message_id: messageId++, date: Math.floor(Date.now() / 1000), ...P[de]!, text: texto, entities },
    } as any);
    return chamadas;
  }

  async function tocar(de: number, data: string): Promise<Chamada[]> {
    chamadas = [];
    await bot.handleUpdate({
      update_id: updateId++,
      callback_query: {
        id: String(updateId), from: P[de]!.from, chat_instance: "t", data,
        message: { message_id: messageId++, date: Math.floor(Date.now() / 1000), chat: P[de]!.chat, text: "x" },
      },
    } as any);
    return chamadas;
  }

  const textos = (cs: Chamada[]) =>
    cs.filter((c) => c.metodo === "sendMessage" || c.metodo === "editMessageText").map((c) => c.payload.text as string);
  const para = (cs: Chamada[], id: number) => cs.filter((c) => c.metodo === "sendMessage" && c.payload.chat_id === id);

  async function itensDaAna(): Promise<Record<string, any>> {
    const r = await sql`select li.* from lista_item li join lista l on l.id = li.lista_id
                         where l.dono_id = ${ANA} order by li.ordem`;
    return Object.fromEntries(r.map((i) => [i.texto_original, i]));
  }

  beforeAll(async () => {
    sql = conectar(URL_DB);
    for (const id of [ANA, BETO, INTRUSO]) await sql`select apagar_usuario(${id})`;
    await sql`insert into usuario (telegram_id, nome, municipio_ibge) values
      (${ANA}, 'Ana', ${MARINGA}), (${BETO}, 'Beto', ${MARINGA}), (${INTRUSO}, 'Intruso', ${MARINGA})`;
    bot = criarBot("123:teste", new Repo(sql), {
      botInfo: { id: 1, is_bot: true, first_name: "Guia", username: "GuiaDoMercadoBot", can_join_groups: false,
                 can_read_all_group_messages: false, supports_inline_queries: false } as any,
    });
    bot.api.config.use(async (_prev, metodo, payload) => {
      chamadas.push({ metodo, payload });
      const msg = { message_id: messageId++, date: 0, chat: { id: (payload as any).chat_id ?? 0, type: "private" }, text: (payload as any).text ?? "" };
      return { ok: true, result: (metodo === "answerCallbackQuery" ? true : msg) as any };
    });
  });

  afterAll(async () => {
    for (const id of [ANA, BETO, INTRUSO]) await sql`select apagar_usuario(${id})`;
    await sql.end();
  });

  let link = "";

  it("Ana monta a lista e gera o link de convite", async () => {
    await enviar(ANA, "carregador de celular, pilha aa");
    const r = await tocar(ANA, "sh");
    link = /https:\/\/t\.me\/GuiaDoMercadoBot\?start=lista_[A-Za-z0-9_-]+/.exec(textos(r)[0]!)![0];
    expect(link).toBeTruthy();
    const botao = r[1]!.payload.reply_markup.inline_keyboard[0][0];
    expect(botao.url).toContain("https://t.me/share/url?url=");
  });

  it("Beto entra pelo link, a Ana é avisada e ele vê os itens dela", async () => {
    const token = link.split("start=")[1]!;
    const r = await enviar(BETO, `/start ${token}`);
    expect(textos(r).join(" ")).toContain("Você entrou na lista de Ana");
    expect(para(r, ANA).map((c) => c.payload.text).join(" ")).toContain("Beto entrou na sua lista");
    expect(textos(r).join(" ")).toContain("2 itens");
  });

  it("Beto adiciona, marca e corrige preço na lista da Ana", async () => {
    await enviar(BETO, "fita isolante");
    let i = await itensDaAna();
    expect(Object.keys(i)).toContain("fita isolante");
    await tocar(BETO, `m:${i["carregador de celular"].id}`);
    await tocar(BETO, `r:${i["pilha aa"].id}`);
    await enviar(BETO, "12,90");
    i = await itensDaAna();
    expect(i["carregador de celular"].marcado).toBe(true);
    expect(Number(i["pilha aa"].preco_real)).toBe(12.9);
    // A Ana atualiza o modo mercado e vê o que o Beto pegou
    const r = await tocar(ANA, "v:atualizar");
    expect(textos(r)[0]).toContain("2 de 3 no carrinho");
  });

  it("quem não tem o link não mexe na lista", async () => {
    const i = await itensDaAna();
    await tocar(INTRUSO, `m:${i["fita isolante"].id}`);
    await tocar(INTRUSO, `d:${i["fita isolante"].id}:0`);
    const depois = await itensDaAna();
    expect(depois["fita isolante"].marcado).toBe(false);
    expect(depois["fita isolante"].removido_em).toBeNull();
  });

  it("/nova do Beto só tira ele da lista; a da Ana continua aberta", async () => {
    await enviar(BETO, "/nova");
    const [l] = await sql`select status from lista where dono_id = ${ANA}`;
    expect(l!.status).toBe("aberta");
    const r = await enviar(BETO, "/lista");
    expect(textos(r).join(" ")).toContain("vazia");
  });

  it("Ana finaliza: o Beto é avisado e o link deixa de valer", async () => {
    await enviar(BETO, `/start ${link.split("start=")[1]}`); // Beto volta para a lista da Ana
    const r = await tocar(ANA, "x:finalizar");
    expect(para(r, BETO).map((c) => c.payload.text).join(" ")).toContain("Ana finalizou a compra");
    const r2 = await enviar(INTRUSO, `/start ${link.split("start=")[1]}`);
    expect(textos(r2).join(" ")).toContain("não vale mais");
  });
});
