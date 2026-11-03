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
    cs.flatMap((c) => (c.payload.reply_markup?.inline_keyboard ?? []).flat().map((b: any) => ({ texto: b.text as string, dado: b.callback_data as string })));
  const dados = (cs: Chamada[]) => botoes(cs).map((b) => b.dado);

  async function itens(): Promise<Record<string, any>> {
    const r = await sql`select li.* from lista_item li join lista l on l.id = li.lista_id
                         where l.dono_id = ${USUARIO} and l.status = 'aberta' order by li.ordem`;
    return Object.fromEntries(r.map((i) => [i.texto_original, i]));
  }

  beforeAll(async () => {
    sql = conectar(URL_DB);
    await sql`select apagar_usuario(${USUARIO})`;
    const [r] = await sql`select regiao_imediata_id from municipio where id = ${BRASILIA}`;
    regiao = Number(r!.regiao_imediata_id);
    await sql`delete from estat_preco where nivel = 'imediata' and codigo_geo = ${regiao}`;
    await sql`insert into estat_preco (item_canonico_id, nivel, codigo_geo, p10, p50, p90, n_marcas, n_redes, n_obs) values
      ('leite-integral-1l', 'imediata', ${regiao}, 4.80, 5.70, 7.90, 8, 3, 30),
      ('leite-desnatado-1l', 'imediata', ${regiao}, 4.90, 5.90, 7.50, 6, 3, 20),
      ('arroz-branco-5kg', 'imediata', ${regiao}, 19.20, 25.00, 30.70, 9, 3, 40),
      ('peito-frango-kg', 'imediata', ${regiao}, 11.00, 11.50, 12.70, 4, 2, 10)`;

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

  it("lista mandada antes da cidade é guardada e montada depois do cadastro", async () => {
    let r = await enviar("2 leite, arroz 5kg, file de frando 1kg, carregador de celular");
    expect(textos(r).join(" ")).toContain("Em qual cidade");
    r = await enviar("brasilia");
    expect(dados(r)).toContain(`c:${BRASILIA}`);
    r = await tocar(`c:${BRASILIA}`);
    expect(textos(r).join(" ")).toContain("Brasília-DF");
    // A única pergunta é a do erro de digitação
    expect(textos(r).join(" ")).toContain("Você quis dizer *file de frango 1kg*?");
  });

  it("aceitar a correção leva direto à lista inteira, com típico marcado", async () => {
    const i = await itens();
    const r = await tocar(`k:${i["file de frando 1kg"].id}:s`);
    const t = textos(r).join("\n");
    expect(t).toContain("4 itens");
    // 2 × 5,70 + 25,00 + 11,50 (frango, 1 kg) = 47,90; carregador sem preço
    expect(t).toContain("Total estimado: R$ 47,90");
    const b = botoes(r).map((x) => x.texto);
    expect(b).toContain("●T 11,40");
    expect(b).toContain("●T 25,00");
    expect(b).toContain("✏️ informar preço");
    expect(b.some((x) => x.startsWith("❓"))).toBe(true); // "file de frango" casou só em parte: conferir
  });

  it("E/T/P mudam o total na mesma mensagem", async () => {
    const i = await itens();
    const r = await tocar(`t:${i["arroz 5kg"].id}:e:0`);
    expect(r.some((c) => c.metodo === "editMessageText")).toBe(true);
    expect(textos(r)[0]).toContain("Total estimado: R$ 42,10"); // 25,00 -> 19,20
    expect(botoes(r).map((x) => x.texto)).toContain("●E 19,20");
  });

  it("🔄 troca o item na mesma mensagem e a escolha é lembrada", async () => {
    let i = await itens();
    let r = await tocar(`a:${i["leite"].id}:0`);
    expect(dados(r)).toContain(`s:${i["leite"].id}:leite-desnatado-1l:0`);
    r = await tocar(`s:${i["leite"].id}:leite-desnatado-1l:0`);
    expect(textos(r)[0]).toContain("Total estimado: R$ 42,50"); // leite 11,40 -> 11,80
    i = await itens();
    expect(i["leite"].item_canonico_id).toBe("leite-desnatado-1l");
  });

  it("✏️ informa o preço de item sem faixa e 🗑 remove", async () => {
    let i = await itens();
    await tocar(`w:${i["carregador de celular"].id}:0`);
    let r = await enviar("35,00");
    expect(textos(r)[0]).toContain("Total estimado: R$ 77,50");
    r = await tocar(`d:${i["carregador de celular"].id}:0`);
    expect(textos(r)[0]).toContain("3 itens");
    expect(textos(r)[0]).toContain("Total estimado: R$ 42,50");
    expect(dados(r)).toContain(`u:${i["carregador de celular"].id}:0`);
  });

  it("↩️ desfaz a remoção com o mesmo preço", async () => {
    const i = await itens();
    let r = await tocar(`u:${i["carregador de celular"].id}:0`);
    expect(textos(r)[0]).toContain("4 itens");
    expect(textos(r)[0]).toContain("Total estimado: R$ 77,50"); // os 35,00 informados voltam
    expect(dados(r)).not.toContain(`u:${i["carregador de celular"].id}:0`);
    r = await tocar(`d:${i["carregador de celular"].id}:0`); // remove de novo para os próximos testes
    expect(textos(r)[0]).toContain("Total estimado: R$ 42,50");
  });

  it("➕ adiciona itens esquecidos à mesma lista", async () => {
    let r = await tocar("add");
    expect(textos(r)[0]).toContain("O que você quer adicionar?");
    r = await enviar("2 leite desnatado");
    expect(textos(r)[0]).toContain("4 itens");
    expect(textos(r)[0]).toContain("Total estimado: R$ 54,30"); // 42,50 + 2 × 5,90
    const i = await itens();
    await tocar(`d:${i["leite desnatado"].id}:0`); // volta ao estado anterior para os próximos testes
  });

  it("✅ Pronto mostra o resumo; modo mercado marca e corrige preço", async () => {
    let r = await tocar("ok");
    expect(textos(r)[0]).toContain("Total estimado: R$ 42,50");
    const i = await itens();
    r = await enviar("/mercado");
    expect(textos(r)[0]).toContain("0 de 3 no carrinho");
    r = await tocar(`m:${i["leite"].id}`);
    expect(textos(r)[0]).toContain("1 de 3 no carrinho");
    await tocar(`r:${i["arroz 5kg"].id}`);
    r = await enviar("21,90");
    expect(textos(r)[0]).toContain("No carrinho: *R$ 33,70*"); // 11,80 + 21,90
    expect(textos(r)[0]).toContain("Previsão final: *R$ 45,20*"); // + 11,50 do frango
  });

  it("ignora atualização repetida do Telegram", async () => {
    const id = updateId++;
    expect((await enviar("feijão", id)).length).toBeGreaterThan(0);
    expect(await enviar("feijão", id)).toEqual([]);
  });

  it("lembra a escolha do usuário para o mesmo texto numa lista nova", async () => {
    await enviar("/nova");
    await enviar("leite");
    const i = await itens();
    expect(i["leite"].item_canonico_id).toBe("leite-desnatado-1l");
  });

  it("não deixa mexer em item de outra pessoa", async () => {
    await sql`insert into usuario (telegram_id) values (990000002) on conflict do nothing`;
    const [l] = await sql`insert into lista (dono_id) values (990000002) returning id`;
    const [i] = await sql`insert into lista_item (lista_id, texto_original, nome_exibicao, ordem, faixa_p10, faixa_p50, faixa_p90)
                           values (${l!.id}, 'x', 'x', 1, 1, 2, 3) returning id`;
    await tocar(`m:${i!.id}`);
    await tocar(`t:${i!.id}:p:0`);
    await tocar(`d:${i!.id}:0`);
    const [depois] = await sql`select marcado, perfil from lista_item where id = ${i!.id}`;
    expect(depois).toBeDefined();
    expect(depois!.marcado).toBe(false);
    expect(depois!.perfil).toBeNull();
    await sql`select apagar_usuario(990000002)`;
  });

  it("apaga os dados do usuário", async () => {
    await enviar("/apagar_meus_dados");
    await tocar("x:apagar");
    expect((await sql`select 1 from usuario where telegram_id = ${USUARIO}`).length).toBe(0);
  });
});
