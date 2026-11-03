-- Catálogo canônico, redes e produtos das redes.
-- Fonte do catálogo: collector/catalogo/itens.toml (seed gerado por collector/gm/ferramentas/seed_catalogo.py).

create table categoria (
  id   text primary key,
  nome text not null
);

create table item_canonico (
  id               text    primary key,
  nome             text    not null,
  categoria_id     text    not null references categoria (id),
  conteudo_valor   numeric,          -- tamanho da embalagem em unidade base; null quando granel
  conteudo_unidade text    check (conteudo_unidade in ('g', 'ml', 'un')),
  granel           boolean not null default false,
  check (granel = (conteudo_valor is null)),
  check ((conteudo_valor is null) = (conteudo_unidade is null))
);

create index item_canonico_categoria_idx on item_canonico (categoria_id);
create index item_canonico_nome_trgm_idx on item_canonico using gin (norm_texto(nome) gin_trgm_ops);

-- Rede de supermercado e a plataforma que ela usa. Rede nova = linha nova, não código novo.
create table rede (
  id         text primary key,
  nome       text not null,
  plataforma text not null check (plataforma in ('vtex', 'osuper')),
  config     jsonb not null default '{}'::jsonb,   -- host, api, etc.
  ativa      boolean not null default true
);

-- Produto como a rede o vende. EAN quando a plataforma informa (VTEX sim, OSuper não).
create table produto_rede (
  rede_id             text not null references rede (id),
  codigo              text not null,                 -- id do produto/SKU na rede
  nome                text not null,
  marca               text,
  ean                 text,
  item_canonico_id    text references item_canonico (id),
  casamento_metodo    text check (casamento_metodo in ('ean', 'regra', 'llm', 'manual')),
  casamento_confianca real,
  atualizado_em       timestamptz not null default now(),
  primary key (rede_id, codigo)
);

create index produto_rede_ean_idx on produto_rede (ean) where ean is not null;
create index produto_rede_item_idx on produto_rede (item_canonico_id) where item_canonico_id is not null;

-- EAN confirmado para um item: vale para todas as redes e pula as regras de texto.
create table ean_item (
  ean              text primary key,
  item_canonico_id text not null references item_canonico (id),
  origem           text not null check (origem in ('regra', 'llm', 'manual')),
  criado_em        timestamptz not null default now()
);

-- Casamentos que as regras não resolveram (ambíguos) ou que alguém contestou.
create table revisao_casamento (
  id          bigint generated always as identity primary key,
  rede_id     text not null,
  codigo      text not null,
  nome        text not null,
  candidatos  text[] not null default '{}',
  status      text not null default 'pendente' check (status in ('pendente', 'resolvido', 'descartado')),
  resolucao   text references item_canonico (id),
  criado_em   timestamptz not null default now(),
  foreign key (rede_id, codigo) references produto_rede (rede_id, codigo)
);

create index revisao_casamento_pendente_idx on revisao_casamento (criado_em) where status = 'pendente';
