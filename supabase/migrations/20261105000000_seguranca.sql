-- Segurança (5/11): teto de peso por usuário no aprendizado, limpeza das atualizações do Telegram
-- e papel restrito para o bot.

-- 1. Aprendizado: cada usuário pesa no máximo `teto_usuario` por categoria na janela.
-- Sem isso, uma lista com 500 itens da mesma categoria corrigidos para 1,9× valia 500 ajustes e
-- dominava a média (k = 5). Quem passa do teto tem todos os pesos reduzidos na mesma proporção,
-- então a razão média dele é preservada; só o volume deixa de contar.
drop function recalcular_fatores(interval, real, integer, numeric, numeric);
create function recalcular_fatores(
  janela interval default '90 days', k real default 5, min_usuarios integer default 3,
  minimo numeric default 0.75, maximo numeric default 1.25, teto_usuario real default 3
) returns integer
language plpgsql as
$$
declare
  n integer;
begin
  perform pg_advisory_xact_lock(hashtext('recalcular_fatores'));
  drop table if exists _aj, _f;  -- pode rodar mais de uma vez na mesma transação

  create temp table _aj on commit drop as
  select a.categoria_id, a.telegram_id,
         a.peso * least(1, teto_usuario / sum(a.peso) over (partition by a.categoria_id, a.telegram_id)) as peso,
         a.log_razao, g.municipio_ibge, g.regiao_imediata, g.regiao_intermediaria, g.uf_id::integer as uf_id
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

-- 2. Idempotência: o Telegram só reenvia atualizações recentes; o resto é lixo acumulado.
create index telegram_update_recebido_idx on telegram_update (recebido_em);

create function limpar_updates(manter interval default '2 days') returns integer
language sql as
$$
  with apagados as (delete from telegram_update where recebido_em < now() - manter returning 1)
  select count(*)::integer from apagados
$$;

-- 3. Papel do bot: lê tudo, escreve só nas tabelas da conversa. Sem login aqui; na VPS:
--   alter role gm_bot login password '...';
-- Tabela nova que o bot precise escrever exige um grant na migração que a cria.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'gm_bot') then
    create role gm_bot nologin;
  end if;
end
$$;

grant usage on schema public to gm_bot;
grant select on all tables in schema public to gm_bot;
alter default privileges in schema public grant select on tables to gm_bot;
grant select, insert, update, delete on
  telegram_update, usuario, estado_conversa, lista, lista_item, lista_membro, preferencia_item,
  ajuste_usuario, fator_local
  to gm_bot;
grant insert, update on regiao_coleta to gm_bot;  -- ativar_regiao: a cidade nova entra na coleta
grant usage on all sequences in schema public to gm_bot;
