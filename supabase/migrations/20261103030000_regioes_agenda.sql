-- CEP de referência por região imediata e ativação automática de região.
-- Agenda semanal: a coleta roda todo domingo às 12h (horário de Brasília), ver deploy/.

create table regiao_cep_referencia (
  regiao_imediata integer primary key references regiao_imediata (id),
  municipio_polo  integer not null references municipio (id),
  cep             char(8) not null check (cep ~ '^[0-9]{8}$'),
  bairro          text
);

-- Ativa a coleta da região imediata de um município (ex.: quando um usuário se cadastra).
-- Devolve o id da região, ou null se a região não tiver CEP de referência.
create function ativar_regiao(p_municipio integer) returns integer
language sql as
$$
  insert into regiao_coleta (regiao_imediata, cep_referencia)
  select r.regiao_imediata, r.cep
    from municipio m
    join regiao_cep_referencia r on r.regiao_imediata = m.regiao_imediata_id
   where m.id = p_municipio
  on conflict (regiao_imediata) do update set ativa = true
  returning regiao_imediata
$$;

-- A coleta é semanal (domingo 12h). As redes selecionadas vencem com 6 dias para que toda
-- execução de domingo as inclua, mesmo com pequenas variações de horário; as não selecionadas
-- são reavaliadas uma vez por mês.
create or replace function agendar_coletas(
  intervalo_selecionadas interval default '6 days',
  intervalo_avaliacao    interval default '27 days'
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
