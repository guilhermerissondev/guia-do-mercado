-- Preço base: regiões ativas, redes por região (seleção D15), fila de coleta,
-- observações de preço e faixas por item e nível geográfico.

-- Região imediata ativa para coleta, com o CEP usado para consultar as redes.
create table regiao_coleta (
  regiao_imediata integer primary key references regiao_imediata (id),
  cep_referencia  char(8) not null check (cep_referencia ~ '^[0-9]{8}$'),
  ativa           boolean not null default true,
  criado_em       timestamptz not null default now()
);

-- Avaliação de cada rede em cada região. Só as selecionadas entram nas faixas.
create table rede_regiao (
  rede_id            text    not null references rede (id),
  regiao_imediata    integer not null references regiao_imediata (id),
  referencia         text,              -- regionId (VTEX) ou id da loja (OSuper)
  atende             boolean not null default false,
  itens_cobertos     integer not null default 0,
  produtos_com_preco integer not null default 0,
  selecionada        boolean not null default false,
  avaliado_em        timestamptz,
  primary key (rede_id, regiao_imediata)
);

-- Loja física de redes com preço por loja (OSuper), mapeada para o município do IBGE.
create table rede_loja (
  rede_id       text    not null references rede (id),
  loja_id       text    not null,
  nome          text    not null,
  municipio_ibge integer references municipio (id),
  primary key (rede_id, loja_id)
);

create index rede_loja_municipio_idx on rede_loja (municipio_ibge);

-- Fila de coleta (uma tarefa = uma rede numa região). Também é o registro de execução.
create table coleta_tarefa (
  id              bigint generated always as identity primary key,
  rede_id         text     not null references rede (id),
  regiao_imediata integer  not null references regiao_imediata (id),
  status          text     not null default 'pendente'
                  check (status in ('pendente', 'executando', 'concluida', 'falhou')),
  tentativas      smallint not null default 0,
  agendada_para   timestamptz not null default now(),
  iniciada_em     timestamptz,
  concluida_em    timestamptz,
  n_precos        integer,
  erro            text
);

create unique index coleta_tarefa_aberta_idx on coleta_tarefa (rede_id, regiao_imediata)
  where status in ('pendente', 'executando');
create index coleta_tarefa_fila_idx on coleta_tarefa (agendada_para) where status = 'pendente';

-- Observação de preço de um produto casado com o catálogo. Só cresce (append-only).
create table preco_obs (
  id               bigint generated always as identity primary key,
  rede_id          text    not null,
  codigo           text    not null,
  regiao_imediata  integer not null references regiao_imediata (id),
  item_canonico_id text    not null references item_canonico (id),
  preco            numeric(10, 2) not null check (preco > 0),
  preco_ref        numeric(10, 2) not null check (preco_ref > 0), -- comparável: R$/kg no granel
  coletado_em      timestamptz not null default now(),
  foreign key (rede_id, codigo) references produto_rede (rede_id, codigo)
);

create index preco_obs_item_regiao_idx on preco_obs (item_canonico_id, regiao_imediata, coletado_em desc);
create index preco_obs_produto_idx on preco_obs (rede_id, codigo, regiao_imediata, coletado_em desc);

-- Faixas pré-calculadas. O bot só lê esta tabela (via estimativa()).
create table estat_preco (
  item_canonico_id text    not null references item_canonico (id),
  nivel            text    not null check (nivel in ('imediata', 'intermediaria', 'uf', 'brasil')),
  codigo_geo       integer not null,  -- 0 para brasil
  p10              numeric(10, 2) not null,
  p50              numeric(10, 2) not null,
  p90              numeric(10, 2) not null,
  n_marcas         integer not null,  -- pontos (marca × rede)
  n_redes          integer not null,
  n_obs            integer not null,
  atualizado_em    timestamptz not null default now(),
  primary key (item_canonico_id, nivel, codigo_geo)
);

-- ----------------------------------------------------------------------------- funções

-- Chave de marca igual à de collector/gm/estatistica.py: sem marca confiável, o nome vira a chave.
create function chave_marca(marca text, nome text) returns text
language sql immutable parallel safe as
$$
  select case
    when marca is null or norm_texto(trim(marca)) in ('', 'nao informado', 'generico')
      then 'nome:' || norm_texto(nome)
    else norm_texto(trim(marca))
  end
$$;

-- Pega a próxima tarefa pendente sem disputa entre workers.
create function pegar_tarefa() returns setof coleta_tarefa
language sql as
$$
  update coleta_tarefa t
     set status = 'executando', iniciada_em = now(), tentativas = t.tentativas + 1
   where t.id = (
     select id from coleta_tarefa
      where status = 'pendente' and agendada_para <= now()
      order by agendada_para
      for update skip locked
      limit 1)
  returning t.*
$$;

-- Agenda coletas: redes selecionadas a cada `intervalo_selecionadas`; redes nunca avaliadas
-- ou não selecionadas são reavaliadas a cada `intervalo_avaliacao`.
create function agendar_coletas(
  intervalo_selecionadas interval default '7 days',
  intervalo_avaliacao    interval default '30 days'
) returns integer
language sql as
$$
  with candidatas as (
    select r.id as rede_id, rc.regiao_imediata
      from regiao_coleta rc
      cross join rede r
      left join rede_regiao rr on rr.rede_id = r.id and rr.regiao_imediata = rc.regiao_imediata
     where rc.ativa and r.ativa
       and (
         rr.avaliado_em is null
         or (rr.selecionada and rr.avaliado_em < now() - intervalo_selecionadas)
         or (not rr.selecionada and rr.avaliado_em < now() - intervalo_avaliacao)
       )
  ), novas as (
    insert into coleta_tarefa (rede_id, regiao_imediata)
    select rede_id, regiao_imediata from candidatas
    on conflict do nothing
    returning 1
  )
  select count(*)::integer from novas
$$;

-- Escolhe até `max_redes` redes por região: as que cobrem mais itens do catálogo (D15).
create function selecionar_redes(p_regiao integer, max_redes integer default 3) returns integer
language sql as
$$
  with ranking as (
    select rede_id,
           row_number() over (order by itens_cobertos desc, produtos_com_preco desc, rede_id) as pos
      from rede_regiao
     where regiao_imediata = p_regiao and atende and itens_cobertos > 0
  ), atualizadas as (
    update rede_regiao rr
       set selecionada = coalesce((select r.pos <= max_redes from ranking r where r.rede_id = rr.rede_id), false)
     where rr.regiao_imediata = p_regiao
    returning rr.selecionada
  )
  select count(*) filter (where selecionada)::integer from atualizadas
$$;

-- Recalcula as faixas em todos os níveis a partir do último preço de cada produto na janela.
-- Regras (iguais a collector/gm/estatistica.py): só redes selecionadas; descarta preço fora de
-- [mediana/5, mediana×5]; cada marca conta uma vez por rede; P10/P50/P90 sobre esses pontos.
-- Janela de 15 dias: com coleta semanal (domingo 12h), cobre uma coleta perdida.
create function recalcular_estat_preco(janela interval default '15 days') returns integer
language plpgsql as
$$
declare
  n integer;
begin
  -- Vários workers de coleta terminam em paralelo: um recálculo por vez
  perform pg_advisory_xact_lock(hashtext('recalcular_estat_preco'));
  drop table if exists _obs, _niveis;  -- pode rodar mais de uma vez na mesma transação

  create temp table _obs on commit drop as
  select distinct on (o.rede_id, o.codigo, o.regiao_imediata)
         o.item_canonico_id, o.rede_id, o.regiao_imediata, o.preco_ref,
         chave_marca(pr.marca, pr.nome) as marca,
         ri.regiao_intermediaria_id, rin.uf_id
    from preco_obs o
    join produto_rede pr on pr.rede_id = o.rede_id and pr.codigo = o.codigo
    join rede_regiao rr on rr.rede_id = o.rede_id and rr.regiao_imediata = o.regiao_imediata and rr.selecionada
    join regiao_imediata ri on ri.id = o.regiao_imediata
    join regiao_intermediaria rin on rin.id = ri.regiao_intermediaria_id
   where o.coletado_em >= now() - janela
   order by o.rede_id, o.codigo, o.regiao_imediata, o.coletado_em desc;

  create temp table _niveis on commit drop as
  select item_canonico_id, 'imediata'::text as nivel, regiao_imediata as codigo_geo, rede_id, marca, preco_ref from _obs
  union all
  select item_canonico_id, 'intermediaria', regiao_intermediaria_id, rede_id, marca, preco_ref from _obs
  union all
  select item_canonico_id, 'uf', uf_id, rede_id, marca, preco_ref from _obs
  union all
  select item_canonico_id, 'brasil', 0, rede_id, marca, preco_ref from _obs;

  delete from estat_preco;

  insert into estat_preco (item_canonico_id, nivel, codigo_geo, p10, p50, p90, n_marcas, n_redes, n_obs)
  with referencia as (
    select item_canonico_id, nivel, codigo_geo,
           percentile_cont(0.5) within group (order by preco_ref) as mediana
      from _niveis group by 1, 2, 3
  ), filtrado as (
    select n.* from _niveis n
      join referencia r using (item_canonico_id, nivel, codigo_geo)
     where n.preco_ref between r.mediana / 5 and r.mediana * 5
  ), pontos as (
    select item_canonico_id, nivel, codigo_geo, rede_id, marca,
           percentile_cont(0.5) within group (order by preco_ref) as preco,
           count(*) as n_obs
      from filtrado group by 1, 2, 3, 4, 5
  )
  select item_canonico_id, nivel, codigo_geo,
         round(percentile_cont(0.1) within group (order by preco)::numeric, 2),
         round(percentile_cont(0.5) within group (order by preco)::numeric, 2),
         round(percentile_cont(0.9) within group (order by preco)::numeric, 2),
         count(*), count(distinct rede_id), sum(n_obs)
    from pontos
   group by 1, 2, 3;

  get diagnostics n = row_count;
  return n;
end
$$;

-- Faixa de um item para o município do usuário: o nível mais local com amostra suficiente.
create function estimativa(p_item text, p_municipio integer, min_marcas integer default 2)
returns table (nivel text, codigo_geo integer, p10 numeric, p50 numeric, p90 numeric,
               n_marcas integer, n_redes integer, atualizado_em timestamptz)
language sql stable as
$$
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
$$;
