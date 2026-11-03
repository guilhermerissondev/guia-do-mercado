// Acesso ao banco. Toda operação sobre item confere que a lista pertence ao usuário.

import postgres from "postgres";

import type { Faixa, ItemLista, Perfil } from "./formato.ts";
import type { ItemCatalogo } from "./sugestao.ts";

export type Sql = postgres.Sql;

export function conectar(url = process.env.DATABASE_URL): Sql {
  if (!url) throw new Error("defina DATABASE_URL");
  return postgres(url, { max: 5, idle_timeout: 30, onnotice: () => {} });
}

const num = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));

export interface Usuario {
  telegramId: number;
  municipio: number | null;
}

export interface Lista {
  id: number;
  nome: string;
}

export interface ItemPendente {
  id: number;
  textoOriginal: string;
  quantidade: number;
  itemCanonicoId: string | null;
  nomeExibicao: string;
  granel: boolean;
  etapa: "escolher_item" | "escolher_preco" | "pronto";
}

export type Aguardando = "cidade" | "preco_estimado" | "preco_real";

const NOME_NIVEL = {
  imediata: (n: string) => `região de ${n}`,
  intermediaria: (n: string) => `região intermediária de ${n}`,
  uf: (n: string) => n,
  brasil: () => "Brasil",
} as const;

export class Repo {
  private catalogoCache: ItemCatalogo[] | null = null;

  constructor(readonly sql: Sql) {}

  // ---------------------------------------------------------------- idempotência

  /** true se a atualização é nova; false se o Telegram reenviou. */
  async registrarUpdate(updateId: number): Promise<boolean> {
    const r = await this.sql`insert into telegram_update (update_id) values (${updateId}) on conflict do nothing returning 1`;
    return r.length === 1;
  }

  // ---------------------------------------------------------------- usuário e cidade

  async usuario(telegramId: number, nome?: string): Promise<Usuario> {
    const [u] = await this.sql`
      insert into usuario (telegram_id, nome) values (${telegramId}, ${nome ?? null})
      on conflict (telegram_id) do update set nome = coalesce(excluded.nome, usuario.nome)
      returning telegram_id, municipio_ibge`;
    return { telegramId: Number(u!.telegram_id), municipio: num(u!.municipio_ibge) };
  }

  async buscarMunicipio(texto: string): Promise<{ id: number; nome: string; uf: string }[]> {
    const r = await this.sql`select municipio_ibge, municipio, uf from buscar_municipio(${texto}, 5)`;
    return r.map((m) => ({ id: Number(m.municipio_ibge), nome: m.municipio, uf: m.uf }));
  }

  /** Define a cidade e ativa a coleta da região. Devolve o nome e se a região já tem preços. */
  async definirMunicipio(telegramId: number, municipio: number): Promise<{ nome: string; uf: string; temPrecos: boolean }> {
    await this.sql`update usuario set municipio_ibge = ${municipio}, atualizado_em = now() where telegram_id = ${telegramId}`;
    await this.sql`select ativar_regiao(${municipio})`;
    const [g] = await this.sql`
      select g.municipio, g.uf,
             exists (select 1 from estat_preco e where e.nivel = 'imediata' and e.codigo_geo = g.regiao_imediata) as tem
        from geo g where g.municipio_ibge = ${municipio}`;
    return { nome: g!.municipio, uf: g!.uf, temPrecos: g!.tem };
  }

  // ---------------------------------------------------------------- estado da conversa

  async aguardar(telegramId: number, aguardando: Aguardando, referencia: number | null = null): Promise<void> {
    await this.sql`
      insert into estado_conversa (telegram_id, aguardando, referencia) values (${telegramId}, ${aguardando}, ${referencia})
      on conflict (telegram_id) do update set aguardando = excluded.aguardando, referencia = excluded.referencia, criado_em = now()`;
  }

  async estado(telegramId: number): Promise<{ aguardando: Aguardando; referencia: number | null } | null> {
    const [e] = await this.sql`select aguardando, referencia from estado_conversa where telegram_id = ${telegramId}`;
    return e ? { aguardando: e.aguardando, referencia: num(e.referencia) } : null;
  }

  async limparEstado(telegramId: number): Promise<void> {
    await this.sql`delete from estado_conversa where telegram_id = ${telegramId}`;
  }

  // ---------------------------------------------------------------- catálogo e preços

  async catalogo(): Promise<ItemCatalogo[]> {
    if (!this.catalogoCache) {
      const r = await this.sql`
        select id, nome, busca, granel, conteudo_valor, conteudo_unidade, ordem from item_canonico order by ordem`;
      this.catalogoCache = r.map((i) => ({
        id: i.id, nome: i.nome, busca: i.busca, granel: i.granel,
        conteudoValor: num(i.conteudo_valor), conteudoUnidade: i.conteudo_unidade, ordem: i.ordem,
      }));
    }
    return this.catalogoCache;
  }

  async faixa(itemCanonicoId: string, municipio: number): Promise<Faixa | null> {
    const [e] = await this.sql`
      select e.*, case e.nivel
               when 'imediata' then (select nome from regiao_imediata where id = e.codigo_geo)
               when 'intermediaria' then (select nome from regiao_intermediaria where id = e.codigo_geo)
               when 'uf' then (select nome from uf where id = e.codigo_geo)
               else 'Brasil' end as nome_local
        from estimativa(${itemCanonicoId}, ${municipio}) e`;
    if (!e) return null;
    return {
      p10: Number(e.p10), p50: Number(e.p50), p90: Number(e.p90), nivel: e.nivel,
      nomeLocal: NOME_NIVEL[e.nivel as keyof typeof NOME_NIVEL](e.nome_local),
      atualizadoEm: new Date(e.atualizado_em),
    };
  }

  async preferencia(telegramId: number, texto: string): Promise<string | null> {
    const [p] = await this.sql`select item_canonico_id from preferencia_item where telegram_id = ${telegramId} and texto = ${texto}`;
    return p ? p.item_canonico_id : null;
  }

  async lembrarPreferencia(telegramId: number, texto: string, itemCanonicoId: string): Promise<void> {
    await this.sql`
      insert into preferencia_item (telegram_id, texto, item_canonico_id) values (${telegramId}, ${texto}, ${itemCanonicoId})
      on conflict (telegram_id, texto) do update set item_canonico_id = excluded.item_canonico_id, atualizado_em = now()`;
  }

  // ---------------------------------------------------------------- listas

  async listaAberta(telegramId: number): Promise<Lista> {
    const [l] = await this.sql`
      select id, nome from lista where dono_id = ${telegramId} and status = 'aberta' order by criada_em desc limit 1`;
    if (l) return { id: Number(l.id), nome: l.nome };
    const [n] = await this.sql`insert into lista (dono_id) values (${telegramId}) returning id, nome`;
    return { id: Number(n!.id), nome: n!.nome };
  }

  async finalizarLista(telegramId: number): Promise<number | null> {
    const [l] = await this.sql`
      update lista set status = 'finalizada', finalizada_em = now()
       where id = (select id from lista where dono_id = ${telegramId} and status = 'aberta' order by criada_em desc limit 1)
      returning id`;
    return l ? Number(l.id) : null;
  }

  async adicionarItens(listaId: number, entradas: { texto: string; quantidade: number }[]): Promise<void> {
    if (entradas.length === 0) return;
    const [{ prox }] = (await this.sql`select coalesce(max(ordem), 0) + 1 as prox from lista_item where lista_id = ${listaId}`) as unknown as [{ prox: number }];
    const linhas = entradas.map((e, n) => ({
      lista_id: listaId, texto_original: e.texto, quantidade: e.quantidade, nome_exibicao: e.texto, ordem: Number(prox) + n,
    }));
    await this.sql`insert into lista_item ${this.sql(linhas)}`;
  }

  async proximoPendente(listaId: number): Promise<ItemPendente | null> {
    const [i] = await this.sql`
      select li.*, coalesce(ic.granel, false) as granel from lista_item li
        left join item_canonico ic on ic.id = li.item_canonico_id
       where li.lista_id = ${listaId} and li.etapa <> 'pronto' order by li.ordem limit 1`;
    return i ? this.pendente(i) : null;
  }

  async item(telegramId: number, itemId: number): Promise<ItemPendente | null> {
    const [i] = await this.sql`
      select li.*, coalesce(ic.granel, false) as granel from lista_item li
        join lista l on l.id = li.lista_id and l.dono_id = ${telegramId}
        left join item_canonico ic on ic.id = li.item_canonico_id
       where li.id = ${itemId}`;
    return i ? this.pendente(i) : null;
  }

  private pendente(i: postgres.Row): ItemPendente {
    return {
      id: Number(i.id), textoOriginal: i.texto_original, quantidade: Number(i.quantidade),
      itemCanonicoId: i.item_canonico_id, nomeExibicao: i.nome_exibicao, granel: i.granel, etapa: i.etapa,
    };
  }

  /** Associa o item da lista a um item do catálogo (ou a nenhum, com null). */
  async definirItem(telegramId: number, itemId: number, canonico: { id: string; nome: string } | null, quantidade?: number): Promise<boolean> {
    const r = await this.sql`
      update lista_item li set
        item_canonico_id = ${canonico?.id ?? null},
        nome_exibicao = coalesce(${canonico?.nome ?? null}, li.texto_original),
        quantidade = coalesce(${quantidade ?? null}, li.quantidade),
        etapa = 'escolher_preco'
        from lista l
       where li.id = ${itemId} and l.id = li.lista_id and l.dono_id = ${telegramId}
      returning li.id`;
    return r.length === 1;
  }

  async definirPreco(telegramId: number, itemId: number, perfil: Perfil | null, preco: number | null, precoBase: number | null): Promise<boolean> {
    const r = await this.sql`
      update lista_item li set perfil = ${perfil}, preco_estimado = ${preco}, preco_base = ${precoBase}, etapa = 'pronto'
        from lista l
       where li.id = ${itemId} and l.id = li.lista_id and l.dono_id = ${telegramId}
      returning li.id`;
    return r.length === 1;
  }

  /** Marca ou desmarca de forma atômica (duas pessoas tocando ao mesmo tempo não se anulam). */
  async alternarMarcado(telegramId: number, itemId: number): Promise<boolean> {
    const r = await this.sql`
      update lista_item li set marcado = not li.marcado
        from lista l
       where li.id = ${itemId} and l.id = li.lista_id and l.dono_id = ${telegramId}
      returning li.id`;
    return r.length === 1;
  }

  /** Preço visto no mercado: grava e já marca o item como pego. */
  async definirPrecoReal(telegramId: number, itemId: number, preco: number): Promise<boolean> {
    const r = await this.sql`
      update lista_item li set preco_real = ${preco}, marcado = true
        from lista l
       where li.id = ${itemId} and l.id = li.lista_id and l.dono_id = ${telegramId}
      returning li.id`;
    return r.length === 1;
  }

  async itensDaLista(listaId: number): Promise<ItemLista[]> {
    const r = await this.sql`
      select li.*, coalesce(ic.granel, false) as granel from lista_item li
        left join item_canonico ic on ic.id = li.item_canonico_id
       where li.lista_id = ${listaId} and li.etapa = 'pronto' order by li.ordem`;
    return r.map((i) => ({
      id: Number(i.id), nomeExibicao: i.nome_exibicao, quantidade: Number(i.quantidade), granel: i.granel,
      perfil: i.perfil, precoEstimado: num(i.preco_estimado), precoReal: num(i.preco_real), marcado: i.marcado,
    }));
  }

  async removerPendentes(listaId: number): Promise<void> {
    await this.sql`delete from lista_item where lista_id = ${listaId} and etapa <> 'pronto'`;
  }

  async apagarUsuario(telegramId: number): Promise<void> {
    await this.sql`select apagar_usuario(${telegramId})`;
  }
}
