-- Redes em escala nacional: cada rede declara os estados onde atua e, depois do mapa nacional
-- (catalogo/mapa_redes.json), as regiões aprovadas (config->'regioes'). A coleta só agenda uma rede
-- onde ela atende.

alter table rede add column ufs char(2)[];  -- null = qualquer estado

create or replace function agendar_coletas(
  intervalo_selecionadas interval default '6 days',
  intervalo_avaliacao    interval default '27 days'
) returns integer
language sql as
$$
  with candidatas as (
    select r.id as rede_id, rc.regiao_imediata
      from regiao_coleta rc
      join regiao_imediata ri on ri.id = rc.regiao_imediata
      join regiao_intermediaria rin on rin.id = ri.regiao_intermediaria_id
      join uf u on u.id = rin.uf_id
      join rede r on r.ativa and (r.ufs is null or u.sigla = any (r.ufs))
                 and (r.config -> 'regioes' is null or r.config -> 'regioes' ? rc.regiao_imediata::text)
      left join rede_regiao rr on rr.rede_id = r.id and rr.regiao_imediata = rc.regiao_imediata
     where rc.ativa
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

-- Um worker por rede: cada site recebe no máximo uma requisição por vez, e as redes andam em paralelo.
drop function pegar_tarefa();
create function pegar_tarefa(p_rede text default null) returns setof coleta_tarefa
language sql as
$$
  update coleta_tarefa t
     set status = 'executando', iniciada_em = now(), tentativas = t.tentativas + 1
   where t.id = (
     select id from coleta_tarefa
      where (p_rede is null or rede_id = p_rede)
        and ((status = 'pendente' and agendada_para <= now())
             -- worker que morreu no meio (máquina reiniciada, processo encerrado): tarefa volta a valer
             or (status = 'executando' and iniciada_em < now() - interval '3 hours'))
      order by agendada_para
      for update skip locked
      limit 1)
  returning t.*
$$;
