-- M6: lista compartilhada. Quem abre o link do dono (token da lista) vira membro e edita a mesma lista.

create table lista_membro (
  lista_id    bigint not null references lista (id) on delete cascade,
  telegram_id bigint not null references usuario (telegram_id) on delete cascade,
  entrou_em   timestamptz not null default now(),
  primary key (lista_id, telegram_id)
);

create index lista_membro_usuario_idx on lista_membro (telegram_id);

-- Lista em que o usuário está trabalhando (a própria ou uma compartilhada com ele).
alter table usuario add column lista_ativa_id bigint references lista (id) on delete set null;

-- Dono ou membro pode ver e editar.
create function pode_editar(p_lista bigint, p_telegram_id bigint) returns boolean
language sql stable as
$$
  select exists (select 1 from lista where id = p_lista and dono_id = p_telegram_id)
      or exists (select 1 from lista_membro where lista_id = p_lista and telegram_id = p_telegram_id)
$$;

-- Entra na lista pelo token do link. Devolve o id da lista (null se o token não existe ou a lista
-- já foi finalizada). O dono abrindo o próprio link só reativa a lista.
create function entrar_na_lista(p_token text, p_telegram_id bigint) returns bigint
language plpgsql as
$$
declare
  l lista;
begin
  select * into l from lista where token_compartilhamento = p_token and status = 'aberta';
  if not found then
    return null;
  end if;
  if l.dono_id <> p_telegram_id then
    insert into lista_membro (lista_id, telegram_id) values (l.id, p_telegram_id) on conflict do nothing;
  end if;
  update usuario set lista_ativa_id = l.id where telegram_id = p_telegram_id;
  return l.id;
end
$$;
