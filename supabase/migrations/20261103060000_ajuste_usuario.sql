-- M5: aprendizado com os preços que os usuários veem no mercado.
--
-- Sinal: ao finalizar a compra, cada item com faixa da região vira um ajuste:
--   com preço corrigido (✏️) -> log(preço real / preço da faixa escolhida, sem fator), peso 1
--   marcado sem correção     -> log(1) = 0, peso 0,3 (o preço bateu)
-- Comparar com a faixa escolhida (e não com o típico) separa "escolhi premium" de "a região é cara".
-- Fator por categoria e localidade, suavizado em direção ao nível acima, limitado a [0,75; 1,25] e
-- só publicado com pelo menos 3 usuários distintos.

-- Fator que estava valendo quando o item entrou na lista (a faixa mostrada já vem multiplicada).
alter table lista_item add column fator_aplicado numeric(6, 4) not null default 1;

create table ajuste_usuario (
  id               bigint generated always as identity primary key,
  telegram_id      bigint  not null references usuario (telegram_id) on delete cascade,
  lista_item_id    bigint  not null unique,   -- um ajuste por item de lista
  item_canonico_id text    not null references item_canonico (id),
  categoria_id     text    not null references categoria (id),
  municipio_ibge   integer not null references municipio (id),
  preco_referencia numeric(10, 2) not null,   -- preço da faixa escolhida, sem fator
  preco_usuario    numeric(10, 2) not null,
  log_razao        double precision not null,
  peso             real not null,
  origem           text not null check (origem in ('edicao', 'confirmado')),
  criado_em        timestamptz not null default now()
);

create index ajuste_usuario_categoria_idx on ajuste_usuario (categoria_id, criado_em desc);

create table fator_local (
  categoria_id  text    not null references categoria (id),
  nivel         text    not null check (nivel in ('municipio', 'imediata', 'intermediaria', 'uf', 'brasil')),
  codigo_geo    integer not null,  -- 0 para brasil
  fator         numeric(6, 4) not null,
  n_usuarios    integer not null,
  n_ajustes     integer not null,
  atualizado_em timestamptz not null default now(),
  primary key (categoria_id, nivel, codigo_geo)
);

-- Grava os ajustes de uma lista finalizada. Devolve quantos foram gravados.
create function registrar_ajustes(p_lista bigint, peso_confirmado real default 0.3) returns integer
language sql as
$$
  with itens as (
    select li.id, l.dono_id, li.item_canonico_id, ic.categoria_id, u.municipio_ibge, li.preco_real, li.marcado,
           -- preço da faixa escolhida, sem o fator que já estava aplicado
           case li.perfil when 'economico' then li.faixa_p10 when 'premium' then li.faixa_p90 else li.faixa_p50 end
             / nullif(li.fator_aplicado, 0) as referencia
      from lista_item li
      join lista l on l.id = li.lista_id
      join usuario u on u.telegram_id = l.dono_id
      join item_canonico ic on ic.id = li.item_canonico_id
     where li.lista_id = p_lista and li.marcado and li.removido_em is null
       and li.perfil in ('economico', 'tipico', 'premium') and li.faixa_p50 is not null and u.municipio_ibge is not null
  ), sinais as (
    select *, coalesce(preco_real, referencia) as pago,
           case when preco_real is null then 'confirmado' else 'edicao' end as origem
      from itens
     where referencia > 0
  ), novos as (
    insert into ajuste_usuario (telegram_id, lista_item_id, item_canonico_id, categoria_id, municipio_ibge,
                                preco_referencia, preco_usuario, log_razao, peso, origem)
    select dono_id, id, item_canonico_id, categoria_id, municipio_ibge, round(referencia, 2), round(pago, 2),
           ln(pago / referencia), case origem when 'edicao' then 1 else peso_confirmado end, origem
      from sinais
     -- razão de 0,5 ou menos, ou de 2 ou mais, provavelmente é outro produto (outra marca, outro tamanho)
     where pago / referencia > 0.5 and pago / referencia < 2
    on conflict (lista_item_id) do nothing
    returning 1
  )
  select count(*)::integer from novos
$$;

-- Recalcula os fatores do Brasil até o município, cada nível puxado em direção ao de cima:
--   log_fator = (Σ peso·log_razao + k · log_fator_pai) / (Σ peso + k)
create function recalcular_fatores(
  janela interval default '90 days', k real default 5, min_usuarios integer default 3,
  minimo numeric default 0.75, maximo numeric default 1.25
) returns integer
language plpgsql as
$$
declare
  n integer;
begin
  perform pg_advisory_xact_lock(hashtext('recalcular_fatores'));
  drop table if exists _aj, _f;  -- pode rodar mais de uma vez na mesma transação

  create temp table _aj on commit drop as
  select a.categoria_id, a.telegram_id, a.peso, a.log_razao, g.municipio_ibge, g.regiao_imediata,
         g.regiao_intermediaria, g.uf_id::integer as uf_id
    from ajuste_usuario a join geo g on g.municipio_ibge = a.municipio_ibge
   where a.criado_em >= now() - janela;

  create temp table _f (categoria_id text, nivel text, codigo_geo integer, log_fator double precision,
                        n_usuarios integer, n_ajustes integer) on commit drop;

  -- Brasil: puxado para 0 (fator 1)
  insert into _f
  select categoria_id, 'brasil', 0, sum(peso * log_razao) / (sum(peso) + k), count(distinct telegram_id), count(*)
    from _aj group by categoria_id;

  -- Demais níveis, de cima para baixo, cada um usando o pai já calculado
  insert into _f
  select a.categoria_id, 'uf', a.uf_id, (sum(a.peso * a.log_razao) + k * max(p.log_fator)) / (sum(a.peso) + k),
         count(distinct a.telegram_id), count(*)
    from _aj a join _f p on p.categoria_id = a.categoria_id and p.nivel = 'brasil'
   group by a.categoria_id, a.uf_id;

  insert into _f
  select a.categoria_id, 'intermediaria', a.regiao_intermediaria,
         (sum(a.peso * a.log_razao) + k * max(p.log_fator)) / (sum(a.peso) + k), count(distinct a.telegram_id), count(*)
    from _aj a join _f p on p.categoria_id = a.categoria_id and p.nivel = 'uf' and p.codigo_geo = a.uf_id
   group by a.categoria_id, a.regiao_intermediaria;

  insert into _f
  select a.categoria_id, 'imediata', a.regiao_imediata,
         (sum(a.peso * a.log_razao) + k * max(p.log_fator)) / (sum(a.peso) + k), count(distinct a.telegram_id), count(*)
    from _aj a join _f p on p.categoria_id = a.categoria_id and p.nivel = 'intermediaria' and p.codigo_geo = a.regiao_intermediaria
   group by a.categoria_id, a.regiao_imediata;

  insert into _f
  select a.categoria_id, 'municipio', a.municipio_ibge,
         (sum(a.peso * a.log_razao) + k * max(p.log_fator)) / (sum(a.peso) + k), count(distinct a.telegram_id), count(*)
    from _aj a join _f p on p.categoria_id = a.categoria_id and p.nivel = 'imediata' and p.codigo_geo = a.regiao_imediata
   group by a.categoria_id, a.municipio_ibge;

  delete from fator_local;
  -- Só publica níveis com usuários suficientes; abaixo disso, vale o nível de cima (ou 1)
  insert into fator_local (categoria_id, nivel, codigo_geo, fator, n_usuarios, n_ajustes)
  select categoria_id, nivel, codigo_geo, least(maximo, greatest(minimo, exp(log_fator)))::numeric(6, 4), n_usuarios, n_ajustes
    from _f where n_usuarios >= min_usuarios;
  get diagnostics n = row_count;
  return n;
end
$$;

-- Fator para uma categoria no município: o nível mais local publicado; sem nenhum, 1.
create function fator_para(p_categoria text, p_municipio integer) returns numeric
language sql stable as
$$
  select coalesce((
    select f.fator
      from geo g
      cross join lateral (values
        ('municipio', g.municipio_ibge, 1), ('imediata', g.regiao_imediata, 2),
        ('intermediaria', g.regiao_intermediaria, 3), ('uf', g.uf_id::integer, 4), ('brasil', 0, 5)) as l (nivel, codigo, ordem)
      join fator_local f on f.categoria_id = p_categoria and f.nivel = l.nivel and f.codigo_geo = l.codigo
     where g.municipio_ibge = p_municipio
     order by l.ordem
     limit 1), 1)
$$;

-- A estimativa passa a vir com o fator aplicado (e informa o fator usado).
drop function estimativa(text, integer, integer);
create function estimativa(p_item text, p_municipio integer, min_marcas integer default 2)
returns table (nivel text, codigo_geo integer, p10 numeric, p50 numeric, p90 numeric,
               n_marcas integer, n_redes integer, atualizado_em timestamptz, fator numeric)
language sql stable as
$$
  with base as (
    select e.nivel, e.codigo_geo, e.p10, e.p50, e.p90, e.n_marcas, e.n_redes, e.atualizado_em
      from geo g
      cross join lateral (values
        ('imediata', g.regiao_imediata, 1),
        ('intermediaria', g.regiao_intermediaria, 2),
        ('uf', g.uf_id::integer, 3),
        ('brasil', 0, 4)) as l (nivel, codigo, ordem)
      join estat_preco e on e.item_canonico_id = p_item and e.nivel = l.nivel and e.codigo_geo = l.codigo
     where g.municipio_ibge = p_municipio and e.n_marcas >= min_marcas
     order by l.ordem
     limit 1
  ), f as (
    select fator_para(ic.categoria_id, p_municipio) as fator from item_canonico ic where ic.id = p_item
  )
  select b.nivel, b.codigo_geo, round(b.p10 * f.fator, 2), round(b.p50 * f.fator, 2), round(b.p90 * f.fator, 2),
         b.n_marcas, b.n_redes, b.atualizado_em, f.fator
    from base b cross join f
$$;
