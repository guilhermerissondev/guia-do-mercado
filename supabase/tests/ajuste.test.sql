-- M5: ajustes dos usuários e fator local. Tudo desfeito no rollback.
begin;

-- 4 usuários em Maringá (e 1 em Sarandi, mesma região) compraram leite e corrigiram o preço
insert into usuario (telegram_id, municipio_ibge) values
  (1001, 4115200), (1002, 4115200), (1003, 4115200), (1004, 4126256), (1005, 4115200);

do $$
declare
  u bigint; l bigint; n integer := 0;
begin
  foreach u in array array[1001, 1002, 1003, 1004]::bigint[] loop
    insert into lista (dono_id) values (u) returning id into l;
    -- leite típico 5,00, pago 5,50 (+10%)
    insert into lista_item (lista_id, texto_original, nome_exibicao, ordem, item_canonico_id, perfil,
                            faixa_p10, faixa_p50, faixa_p90, preco_estimado, preco_real, marcado)
    values (l, 'leite', 'Leite integral 1 L', 1, 'leite-integral-1l', 'tipico', 4.50, 5.00, 6.00, 5.00, 5.50, true);
    -- arroz econômico 20,00, pago 40,00: outro produto, descartado
    insert into lista_item (lista_id, texto_original, nome_exibicao, ordem, item_canonico_id, perfil,
                            faixa_p10, faixa_p50, faixa_p90, preco_estimado, preco_real, marcado)
    values (l, 'arroz', 'Arroz 5 kg', 2, 'arroz-branco-5kg', 'economico', 20.00, 25.00, 30.00, 20.00, 40.00, true);
    -- café não marcado: não vira ajuste
    insert into lista_item (lista_id, texto_original, nome_exibicao, ordem, item_canonico_id, perfil,
                            faixa_p10, faixa_p50, faixa_p90, preco_estimado)
    values (l, 'cafe', 'Café 500 g', 3, 'cafe-torrado-moido-500g', 'tipico', 18, 25, 36, 25);
    n := n + registrar_ajustes(l);
    assert registrar_ajustes(l) = 0, 'registrar de novo não pode duplicar';
  end loop;
  assert n = 4, format('esperava 4 ajustes (só o leite de cada um), veio %s', n);

  -- 5º usuário marcou o leite sem corrigir: conta como "preço bateu", peso 0,3
  insert into lista (dono_id) values (1005) returning id into l;
  insert into lista_item (lista_id, texto_original, nome_exibicao, ordem, item_canonico_id, perfil,
                          faixa_p10, faixa_p50, faixa_p90, preco_estimado, marcado)
  values (l, 'leite', 'Leite integral 1 L', 1, 'leite-integral-1l', 'tipico', 4.50, 5.00, 6.00, 5.00, true);
  assert registrar_ajustes(l) = 1, 'item confirmado deveria virar ajuste';
  assert (select peso from ajuste_usuario where telegram_id = 1005) = 0.3::real, 'peso do confirmado';
  assert (select log_razao from ajuste_usuario where telegram_id = 1005) = 0, 'confirmado tem razão 1';
end $$;

do $$
declare
  f numeric;
  e record;
begin
  perform recalcular_fatores();
  f := fator_para('laticinios', 4115200);
  -- +10% de 4 pessoas (e um "bateu"), suavizado pelos níveis de cima: sobe, mas não salta para 1,10
  assert f > 1.03 and f < 1.10, format('fator de laticínios em Maringá fora do esperado: %s', f);
  -- Outra categoria e outro estado: sem dado, fator 1
  assert fator_para('graos', 4115200) = 1, 'grãos não tem ajuste';
  assert fator_para('laticinios', 3550308) <= f, 'São Paulo não pode receber mais ajuste que Maringá';

  -- A estimativa sai multiplicada pelo fator
  insert into estat_preco (item_canonico_id, nivel, codigo_geo, p10, p50, p90, n_marcas, n_redes, n_obs)
  values ('leite-integral-1l', 'imediata', 410014, 4.50, 5.00, 6.00, 5, 3, 20)
  on conflict (item_canonico_id, nivel, codigo_geo) do update set p10 = 4.50, p50 = 5.00, p90 = 6.00, n_marcas = 5;
  select * into e from estimativa('leite-integral-1l', 4115200);
  assert e.fator = f, 'estimativa deveria informar o fator';
  assert e.p50 = round(5.00 * f, 2), format('p50 com fator: %s', e.p50);

  -- Mínimo de 3 usuários: com 2, nada é publicado
  delete from ajuste_usuario where telegram_id in (1001, 1002, 1005);
  perform recalcular_fatores();
  assert fator_para('laticinios', 4115200) = 1, 'com 2 usuários não pode haver fator';

  -- Limite: mesmo com todos pagando 90% a mais e sem suavização, no máximo 1,25
  update ajuste_usuario set log_razao = ln(1.9);
  insert into ajuste_usuario (telegram_id, lista_item_id, item_canonico_id, categoria_id, municipio_ibge,
                              preco_referencia, preco_usuario, log_razao, peso, origem)
  values (1001, -1, 'leite-integral-1l', 'laticinios', 4115200, 5, 9.5, ln(1.9), 1, 'edicao');
  perform recalcular_fatores(k => 0);
  assert fator_para('laticinios', 4115200) = 1.25, format('limite de 1,25: %s', fator_para('laticinios', 4115200));

  -- LGPD: apagar o usuário apaga os ajustes dele
  perform apagar_usuario(1001);
  assert not exists (select 1 from ajuste_usuario where telegram_id = 1001), 'ajustes do usuário apagado';

  raise notice 'ajuste: todos os testes passaram';
end $$;

rollback;
