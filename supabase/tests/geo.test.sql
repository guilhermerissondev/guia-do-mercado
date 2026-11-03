-- Testes da geografia. Executar com: psql -v ON_ERROR_STOP=1 -f supabase/tests/geo.test.sql
do $$
declare
  r record;
  n integer;
begin
  -- Cobertura nacional
  select count(*) into n from municipio;
  assert n >= 5570, format('esperava >= 5570 municípios, veio %s', n);
  select count(*) into n from regiao_imediata;
  assert n = 510, format('esperava 510 regiões imediatas, veio %s', n);
  select count(*) into n from regiao_intermediaria;
  assert n = 133, format('esperava 133 regiões intermediárias, veio %s', n);
  select count(*) into n from uf;
  assert n = 27, format('esperava 27 UFs, veio %s', n);

  -- Hierarquia de Maringá (checkpoint M0)
  select * into r from geo where municipio_ibge = 4115200;
  assert r.municipio = 'Maringá', 'município 4115200 deveria ser Maringá';
  assert r.regiao_imediata = 410014, 'região imediata de Maringá deveria ser 410014';
  assert r.regiao_intermediaria_nome = 'Maringá', 'região intermediária de Maringá';
  assert r.uf = 'PR', 'UF de Maringá deveria ser PR';

  -- Nenhum município órfão
  select count(*) into n from geo;
  assert n = (select count(*) from municipio), 'a visão geo perdeu municípios';

  -- Busca de cidade tolerante a acento e erro de digitação
  select * into r from buscar_municipio('maringa', 1);
  assert r.municipio_ibge = 4115200, 'busca "maringa" deveria achar Maringá';
  select * into r from buscar_municipio('Maringá', 1);
  assert r.municipio_ibge = 4115200, 'busca "Maringá" deveria achar Maringá';
  select count(*) into n from buscar_municipio('sao paulo', 5) where uf = 'SP';
  assert n >= 1, 'busca "sao paulo" deveria achar São Paulo-SP';

  raise notice 'geo: todos os testes passaram';
end
$$;
