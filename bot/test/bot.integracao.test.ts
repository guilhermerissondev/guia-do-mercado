// Conversa completa com o bot contra um Postgres real, com o Telegram simulado.
// Roda só com DATABASE_URL (tools/dev-db.sh localmente; serviço postgres no CI).

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { criarBot } from "../src/bot.ts";
import { conectar, Repo, type Sql } from "../src/repo.ts";

const URL_DB = process.env.DATABASE_URL;
const USUARIO = 990_000_001;
const BRASILIA = 5300108; // fora do piloto de propósito

interface Chamada { metodo: string; payload: any }

describe.skipIf(!URL_DB)("conversa com o bot", () => {
  let sql: Sql;
  let regiao: number;
  let chamadas: Chamada[] = [];
  let updateId = 1_000_000 + Math.floor(Math.random() * 1_000_000);
  let messageId = 1;
  let bot: ReturnType<typeof criarBot>;

  const chat = { id: USUARIO, type: "private" as const, first_name: "Teste" };
  const from = { id: USUARIO, is_bot: false, first_name: "Teste" };

  async function enviar(texto: string, idFixo?: number): Promise<Chamada[]> {
    chamadas = [];
    const entities = texto.startsWith("/") ? [{ type: "bot_command" as const, offset: 0, length: texto.split(" ")[0]!.length }] : undefined;
    await bot.handleUpdate({
      update_id: idFixo ?? updateId++,
      message: { message_id: messageId++, date: Math.floor(Date.now() / 1000), chat, from, text: texto, entities },
    } as any);
    return chamadas;
  }

  async function tocar(data: string): Promise<Chamada[]> {
    chamadas = [];
    await bot.handleUpdate({
      update_id: updateId++,
      callback_query: {
        id: String(updateId), from, chat_instance: "t", data,
        message: { message_id: messageId++, date: Math.floor(Date.now() / 1000), chat, text: "x" },
      },
    } as any);
    return chamadas;
  }

  const textos = (cs: Chamada[]) => cs.filter((c) => c.metodo === "sendMessage" || c.metodo === "editMessageText").map((c) => c.payload.text as string);
  const botoes = (cs: Chamada[]) =>
    cs.flatMap((c) => (c.payload.reply_markup?.inline_keyboard ?? []).flat().map((b: any) => b.callback_data as string));

  beforeAll(async () => {
    sql = conectar(URL_DB);
    await sql`select apagar_usuario(${USUARIO})`;
    const [r] = await sql`select regiao_imediata_id from municipio where id = ${BRASILIA}`;
    regiao = Number(r!.regiao_imediata_id);
    // Faixas sintéticas da região de Brasília para leite e arroz
    await sql`delete from estat_preco where nivel = 'imediata' and codigo_geo = ${regiao}`;
    await sql`insert into estat_preco (item_canonico_id, nivel, codigo_geo, p10, p50, p90, n_marcas, n_redes, n_obs) values
      ('leite-integral-1l', 'imediata', ${regiao}, 4.80, 5.70, 7.90, 8, 3, 30),
      ('arroz-branco-5kg', 'imediata', ${regiao}, 19.20, 25.00, 30.70, 9, 3, 40)`;

    bot = criarBot("123:teste", new Repo(sql), {
      botInfo: { id: 1, is_bot: true, first_name: "Guia", username: "guia_teste_bot", can_join_groups: false,
                 can_read_all_group_messages: false, supports_inline_queries: false } as any,
    });
    bot.api.config.use(async (_prev, metodo, payload) => {
      chamadas.push({ metodo, payload });
      const msg = { message_id: messageId++, date: 0, chat, text: (payload as any).text ?? "" };
      return { ok: true, result: (metodo === "answerCallbackQuery" ? true : msg) as any };
    });
  });

  afterAll(async () => {
    await sql`select apagar_usuario(${USUARIO})`;
    await sql`delete from estat_preco where nivel = 'imediata' and codigo_geo = ${regiao}`;
    await sql.end();
  });

  let itens: Record<string, number> = {};

  it("pede a cidade e acha Brasília sem acento", async () => {
    expect(textos(await enviar("/start")).join(" ")).toContain("Em qual cidade");
    const r = await enviar("brasilia");
    expect(botoes(r)).toContain(`c:${BRASILIA}`);
    expect(textos(await tocar(`c:${BRASILIA}`)).join(" ")).toContain("Brasília-DF");
  });

  it("monta a lista: sugestões, tamanho e item fora do catálogo", async () => {
    let r = await enviar("2 leite, arroz 5kg, carregador de celular");
    const ids = await sql`select li.id, li.texto_original from lista_item li join lista l on l.id = li.lista_id
                           where l.dono_id = ${USUARIO} order by li.ordem`;
    itens = Object.fromEntries(ids.map((i) => [i.texto_original, Number(i.id)]));
    expect(botoes(r)).toContain(`i:${itens["leite"]}:leite-integral-1l`);

    r = await tocar(`i:${itens["leite"]}:leite-integral-1l`);
    expect(textos(r).join(" ")).toContain("Típico");
    expect(botoes(r)).toContain(`f:${itens["leite"]}:t`);

    r = await tocar(`f:${itens["leite"]}:t`);
    expect(botoes(r)).toContain(`i:${itens["arroz 5kg"]}:arroz-branco-5kg`);

    r = await tocar(`i:${itens["arroz 5kg"]}:arroz-branco-5kg`);
    r = await tocar(`f:${itens["arroz 5kg"]}:e`);
    expect(textos(r).join(" ")).toContain("Ainda não tenho preço de *carregador de celular*");

    r = await enviar("35,00");
    const lista = textos(r).join("\n");
    // 2 × 5,70 + 19,20 + 35,00
    expect(lista).toContain("Total estimado: R$ 65,60");
  });

  it("modo mercado: marca, corrige preço e atualiza o total", async () => {
    let r = await enviar("/mercado");
    expect(textos(r)[0]).toContain("0 de 3 no carrinho");

    r = await tocar(`m:${itens["leite"]}`);
    expect(r.some((c) => c.metodo === "editMessageText")).toBe(true);
    expect(textos(r)[0]).toContain("1 de 3 no carrinho");
    expect(textos(r)[0]).toContain("R$ 11,40");

    await tocar(`r:${itens["arroz 5kg"]}`);
    r = await enviar("21,90");
    const t = textos(r)[0]!;
    expect(t).toContain("2 de 3 no carrinho");
    expect(t).toContain("No carrinho: *R$ 33,30*"); // 11,40 + 21,90
    expect(t).toContain("Previsão final: *R$ 68,30*"); // + 35,00 que falta
  });

  it("ignora atualização repetida do Telegram", async () => {
    const id = updateId++;
    expect((await enviar("feijão", id)).length).toBeGreaterThan(0);
    expect(await enviar("feijão", id)).toEqual([]);
    await enviar("/cancelar");
  });

  it("lembra a escolha do usuário para o mesmo texto", async () => {
    await enviar("/nova");
    const r = await enviar("leite");
    expect(textos(r).join(" ")).toContain("Típico"); // foi direto para a faixa, sem perguntar qual leite
  });

  it("não deixa mexer em item de outra pessoa", async () => {
    const [outro] = await sql`insert into usuario (telegram_id) values (990000002) on conflict do nothing returning telegram_id`;
    const [l] = await sql`insert into lista (dono_id) values (990000002) returning id`;
    const [i] = await sql`insert into lista_item (lista_id, texto_original, nome_exibicao, ordem, etapa)
                           values (${l!.id}, 'x', 'x', 1, 'pronto') returning id`;
    await tocar(`m:${i!.id}`);
    const [depois] = await sql`select marcado from lista_item where id = ${i!.id}`;
    expect(depois!.marcado).toBe(false);
    await sql`select apagar_usuario(990000002)`;
    expect(outro === undefined || outro.telegram_id).toBeTruthy();
  });

  it("apaga os dados do usuário", async () => {
    await enviar("/apagar_meus_dados");
    await tocar("x:apagar");
    const r = await sql`select 1 from usuario where telegram_id = ${USUARIO}`;
    expect(r.length).toBe(0);
  });
});
