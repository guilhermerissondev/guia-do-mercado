-- Bot do Telegram: usuários, listas, itens da lista, estado da conversa e idempotência.

create extension if not exists pgcrypto with schema public;

-- Palavras de busca de cada item (nome + regras do catálogo), para sugerir itens a partir
-- do texto livre do usuário. Preenchido pelo seed gerado do catálogo.
alter table item_canonico add column busca text not null default '';
-- Ordem no catálogo: dentro de cada tipo, o primeiro é o mais comum (desempate das sugestões).
alter table item_canonico add column ordem integer not null default 0;

create table usuario (
  telegram_id    bigint primary key,
  nome           text,
  municipio_ibge integer references municipio (id),
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now()
);

-- O que o bot espera como próxima mensagem de texto do usuário.
create table estado_conversa (
  telegram_id bigint primary key references usuario (telegram_id) on delete cascade,
  aguardando  text not null check (aguardando in ('cidade', 'preco_estimado', 'preco_real')),
  referencia  bigint,                 -- lista_item.id quando aguardando preço
  texto       text,                   -- lista mandada antes de cadastrar a cidade
  criado_em   timestamptz not null default now()
);

create table lista (
  id                    bigint generated always as identity primary key,
  dono_id               bigint not null references usuario (telegram_id) on delete cascade,
  nome                  text not null default 'Lista de compras',
  status                text not null default 'aberta' check (status in ('aberta', 'finalizada')),
  token_compartilhamento text not null unique
                        default translate(encode(public.gen_random_bytes(18), 'base64'), '+/', '-_'),
  criada_em             timestamptz not null default now(),
  finalizada_em         timestamptz
);

create index lista_dono_aberta_idx on lista (dono_id, criada_em desc) where status = 'aberta';

create table lista_item (
  id               bigint generated always as identity primary key,
  lista_id         bigint not null references lista (id) on delete cascade,
  texto_original   text not null,
  correcao         text,              -- texto corrigido sugerido ("file de frango"), aguardando o usuário
  quantidade       numeric(10, 3) not null default 1 check (quantidade > 0),
  item_canonico_id text references item_canonico (id),
  nome_exibicao    text not null,
  incerto          boolean not null default false, -- casou só parte do texto: mostrar com ❓
  -- Faixa da região no momento em que o item entrou (os botões E/T/P usam estes valores)
  faixa_p10        numeric(10, 2),
  faixa_p50        numeric(10, 2),
  faixa_p90        numeric(10, 2),
  perfil           text check (perfil in ('economico', 'tipico', 'premium', 'manual')),
  preco_estimado   numeric(10, 2) check (preco_estimado >= 0),  -- preço unitário escolhido
  preco_real       numeric(10, 2) check (preco_real >= 0),       -- preço unitário visto no mercado
  marcado          boolean not null default false,
  removido_em      timestamptz,       -- 🗑 é reversível: o item fica guardado até a lista fechar
  etapa            text not null default 'pronto' check (etapa in ('confirmar_correcao', 'pronto')),
  ordem            integer not null,
  criado_em        timestamptz not null default now()
);

create index lista_item_lista_idx on lista_item (lista_id, ordem);

-- Escolha anterior do usuário para o mesmo texto ("leite" -> leite integral 1 L).
create table preferencia_item (
  telegram_id      bigint not null references usuario (telegram_id) on delete cascade,
  texto            text not null,  -- normalizado
  item_canonico_id text not null references item_canonico (id),
  atualizado_em    timestamptz not null default now(),
  primary key (telegram_id, texto)
);

-- Atualizações do Telegram já processadas (o Telegram pode reenviar).
create table telegram_update (
  update_id   bigint primary key,
  recebido_em timestamptz not null default now()
);

-- Apaga tudo do usuário (LGPD). Listas e itens saem em cascata.
create function apagar_usuario(p_telegram_id bigint) returns void
language sql as $$ delete from usuario where telegram_id = p_telegram_id $$;
