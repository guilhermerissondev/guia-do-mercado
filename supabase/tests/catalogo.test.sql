-- Testes do catálogo. Executar depois das migrações e seeds.
do $$
declare
  n integer;
begin
  select count(*) into n from item_canonico;
  assert n >= 90, format('esperava >= 90 itens canônicos, veio %s', n);

  select count(*) into n from item_canonico i left join categoria c on c.id = i.categoria_id where c.id is null;
  assert n = 0, 'item sem categoria';

  select count(*) into n from item_canonico where granel and conteudo_valor is not null;
  assert n = 0, 'item a granel com conteúdo';

  assert (select conteudo_valor from item_canonico where id = 'leite-integral-1l') = 1000, 'leite 1 L = 1000 ml';
  assert (select conteudo_unidade from item_canonico where id = 'leite-integral-1l') = 'ml', 'leite em ml';

  select count(*) into n from rede where ativa;
  assert n >= 2, 'pelo menos duas redes ativas';

  -- Integridade: produto não pode apontar para item inexistente
  begin
    insert into produto_rede (rede_id, codigo, nome, item_canonico_id) values ('atacadao', 'x', 'teste', 'nao-existe');
    assert false, 'deveria rejeitar item inexistente';
  exception when foreign_key_violation then
    null;
  end;

  raise notice 'catalogo: todos os testes passaram';
end
$$;
