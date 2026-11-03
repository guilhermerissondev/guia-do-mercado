-- CEP de referência por região e ativação automática. Desfeito no rollback.
begin;
do $$
declare n integer; r integer;
begin
  select count(*) into n from regiao_cep_referencia;
  assert n >= 440, format('esperava CEP para pelo menos 440 regiões imediatas, veio %s', n);

  -- O polo pertence à própria região
  select count(*) into n from regiao_cep_referencia rc join municipio m on m.id = rc.municipio_polo
   where m.regiao_imediata_id <> rc.regiao_imediata;
  assert n = 0, 'município-polo fora da sua região';

  -- Maringá: polo é a própria Maringá e o CEP começa com 870 (faixa de Maringá)
  assert (select municipio_polo from regiao_cep_referencia where regiao_imediata = 410014) = 4115200, 'polo de Maringá';
  assert (select cep from regiao_cep_referencia where regiao_imediata = 410014) like '870%', 'CEP de Maringá';

  -- Ativação a partir de qualquer município da região (Sarandi ativa a região de Maringá)
  delete from regiao_coleta where regiao_imediata = 410014;
  r := ativar_regiao(4126256);
  assert r = 410014, format('Sarandi deveria ativar a região 410014, ativou %s', r);
  assert (select ativa from regiao_coleta where regiao_imediata = 410014), 'região ativa';
  assert ativar_regiao(4126256) = 410014, 'ativar de novo não pode falhar';

  raise notice 'regioes: todos os testes passaram';
end $$;
rollback;
