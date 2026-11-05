-- Segurança: teto de peso por usuário, limpeza de atualizações e papel do bot. Tudo desfeito no rollback.
begin;

-- 10 usuários em Maringá viram leite pelo preço da faixa; 1 corrigiu 300 itens de laticínios para 1,9×
insert into usuario (telegram_id, municipio_ibge)
select 2000 + i, 4115200 from generate_series(1, 11) i;

insert into ajuste_usuario (telegram_id, lista_item_id, item_canonico_id, categoria_id, municipio_ibge,
                            preco_referencia, preco_usuario, log_razao, peso, origem)
select 2000 + i, -2000 - i, 'leite-integral-1l', 'laticinios', 4115200, 5, 5, 0, 1, 'edicao'
  from generate_series(1, 10) i
union all
select 2011, -3000 - j, 'leite-integral-1l', 'laticinios', 4115200, 5, 9.5, ln(1.9), 1, 'edicao'
  from generate_series(1, 300) j;

do $$
declare
  sem_teto numeric;
  com_teto numeric;
begin
  perform recalcular_fatores(teto_usuario => 1e9);
  sem_teto := fator_para('laticinios', 4115200);
  perform recalcular_fatores();
  com_teto := fator_para('laticinios', 4115200);
  assert sem_teto = 1.25, format('sem teto, um usuário sozinho leva ao limite: %s', sem_teto);
  -- com teto 3: 3 de 13 de peso a +90%, puxado para 1 pelos níveis de cima
  assert com_teto < 1.16, format('com teto, o volume de um usuário não pode dominar: %s', com_teto);
  -- quem fica abaixo do teto não muda: só os 10 honestos, fator 1
  delete from ajuste_usuario where telegram_id = 2011;
  perform recalcular_fatores();
  assert fator_para('laticinios', 4115200) = 1, 'sem o usuário fora da curva, fator 1';
end $$;

-- Atualizações antigas do Telegram saem; as recentes ficam (o Telegram pode reenviar)
insert into telegram_update (update_id, recebido_em) values (-1, now() - interval '3 days'), (-2, now());
do $$
begin
  assert limpar_updates() >= 1, 'deveria apagar a atualização antiga';
  assert not exists (select 1 from telegram_update where update_id = -1), 'antiga apagada';
  assert exists (select 1 from telegram_update where update_id = -2), 'recente mantida';
end $$;

-- O bot, como gm_bot, faz a conversa inteira, mas não mexe em preços nem no catálogo
-- (as temporárias de recalcular_fatores criadas acima são do postgres até o fim da transação)
drop table if exists _aj, _f;
set local role gm_bot;
do $$
declare
  l bigint;
begin
  perform limpar_updates();
  insert into telegram_update (update_id) values (-3);
  insert into usuario (telegram_id, nome) values (2100, 'Teste');
  update usuario set municipio_ibge = 4115200 where telegram_id = 2100;
  perform ativar_regiao(4115200);
  perform * from buscar_municipio('maringa', 5);
  perform * from estimativa('leite-integral-1l', 4115200);
  insert into estado_conversa (telegram_id, aguardando) values (2100, 'cidade');
  insert into lista (dono_id) values (2100) returning id into l;
  perform entrar_na_lista((select token_compartilhamento from lista where id = l), 2100);
  insert into lista_item (lista_id, texto_original, nome_exibicao, ordem, item_canonico_id, perfil,
                          faixa_p10, faixa_p50, faixa_p90, preco_estimado, preco_real, marcado)
  values (l, 'leite', 'Leite integral 1 L', 1, 'leite-integral-1l', 'tipico', 4.5, 5, 6, 5, 5.5, true);
  insert into preferencia_item (telegram_id, texto, item_canonico_id) values (2100, 'leite', 'leite-integral-1l');
  assert registrar_ajustes(l) = 1, 'gm_bot grava o ajuste';
  perform recalcular_fatores();
  perform apagar_usuario(2100);

  begin
    insert into estat_preco (item_canonico_id, nivel, codigo_geo, p10, p50, p90, n_marcas, n_redes, n_obs)
    values ('leite-integral-1l', 'brasil', 0, 1, 1, 1, 9, 9, 9);
    raise exception 'gm_bot não pode gravar preços';
  exception when insufficient_privilege then null;
  end;
  begin
    update item_canonico set nome = 'x';
    raise exception 'gm_bot não pode mudar o catálogo';
  exception when insufficient_privilege then null;
  end;
  raise notice 'seguranca: todos os testes passaram';
end $$;

rollback;
