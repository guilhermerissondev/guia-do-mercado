-- Geografia nacional (IBGE): município -> região imediata -> região intermediária -> UF.
-- Toda estatística de preço e todo fator de ajuste se ancoram nesta hierarquia.

create extension if not exists pg_trgm with schema public;
create extension if not exists unaccent with schema public;

create table uf (
  id    smallint primary key,
  sigla char(2)  not null unique,
  nome  text     not null
);

create table regiao_intermediaria (
  id    integer  primary key,
  nome  text     not null,
  uf_id smallint not null references uf (id)
);

create table regiao_imediata (
  id                      integer primary key,
  nome                    text    not null,
  regiao_intermediaria_id integer not null references regiao_intermediaria (id)
);

create table municipio (
  id                 integer primary key, -- código IBGE de 7 dígitos
  nome               text    not null,
  regiao_imediata_id integer not null references regiao_imediata (id)
);

create index municipio_regiao_imediata_idx on municipio (regiao_imediata_id);
create index regiao_imediata_intermediaria_idx on regiao_imediata (regiao_intermediaria_id);
create index regiao_intermediaria_uf_idx on regiao_intermediaria (uf_id);

-- unaccent() não é IMMUTABLE; este wrapper permite usá-la em índice.
create function norm_texto(t text) returns text
language sql immutable parallel safe as
$$ select lower(public.unaccent('public.unaccent'::regdictionary, t)) $$;

-- Busca de cidade por nome sem acento, tolerante a erro de digitação.
create index municipio_nome_trgm_idx on municipio using gin (norm_texto(nome) gin_trgm_ops);

-- Visão desnormalizada: uma linha por município com todos os ancestrais.
create view geo as
select
  m.id                       as municipio_ibge,
  m.nome                     as municipio,
  ri.id                      as regiao_imediata,
  ri.nome                    as regiao_imediata_nome,
  rin.id                     as regiao_intermediaria,
  rin.nome                   as regiao_intermediaria_nome,
  u.id                       as uf_id,
  u.sigla                    as uf
from municipio m
join regiao_imediata ri on ri.id = m.regiao_imediata_id
join regiao_intermediaria rin on rin.id = ri.regiao_intermediaria_id
join uf u on u.id = rin.uf_id;

-- Cidades candidatas para um texto digitado pelo usuário (cadastro de cidade no bot).
create function buscar_municipio(texto text, limite integer default 5)
returns table (municipio_ibge integer, municipio text, uf char(2), similaridade real)
language sql stable as
$$
  select g.municipio_ibge, g.municipio, g.uf::char(2),
         similarity(norm_texto(g.municipio), norm_texto(texto)) as similaridade
  from geo g
  where norm_texto(g.municipio) % norm_texto(texto)
  order by similaridade desc, g.municipio
  limit limite
$$;
