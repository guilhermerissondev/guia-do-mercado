-- Testes de preço base com dados sintéticos. Tudo é desfeito no rollback.
begin;

insert into rede (id, nome, plataforma) values ('teste4', 'Rede Teste 4', 'vtex');

-- Região imediata de Maringá (410014) com 4 redes avaliadas; só 3 devem ser selecionadas.
insert into regiao_coleta (regiao_imediata, cep_referencia) values (410014, '87013000');
insert into rede_regiao (rede_id, regiao_imediata, atende, itens_cobertos, produtos_com_preco, avaliado_em) values
  ('atacadao', 410014, true, 76, 1116, now()),
  ('angeloni', 410014, true, 75, 922, now()),
  ('condor',   410014, true, 68, 190, now()),
  ('teste4',   410014, true, 10, 50, now());

do $$
declare n integer;
begin
  n := selecionar_redes(410014);
  assert n = 3, format('esperava 3 redes selecionadas, veio %s', n);
  assert not (select selecionada from rede_regiao where rede_id = 'teste4'), 'rede com menor cobertura não pode ser selecionada';
end $$;

-- Produtos e preços (leite integral 1 L)
insert into produto_rede (rede_id, codigo, nome, marca, item_canonico_id) values
  ('atacadao', 'a1', 'Leite Italac Integral 1L', 'Italac', 'leite-integral-1l'),
  ('atacadao', 'a2', 'Leite Piracanjuba Integral 1L', 'Piracanjuba', 'leite-integral-1l'),
  ('angeloni', 'g1', 'Leite PIRACANJUBA Integral 1l', 'PIRACANJUBA', 'leite-integral-1l'),
  ('angeloni', 'g2', 'Leite Tirol Integral 1l', 'Tirol', 'leite-integral-1l'),
  ('angeloni', 'g3', 'Leite Tirol Integral Tampa 1l', 'Tirol', 'leite-integral-1l'),
  ('condor',   'c1', 'Leite Frimesa Integral 1L', 'Frimesa', 'leite-integral-1l'),
  ('condor',   'c2', 'Leite Erro de Cadastro 1L', 'Erro', 'leite-integral-1l'),
  ('teste4',   't1', 'Leite Caro 1L', 'Caro', 'leite-integral-1l');

insert into preco_obs (rede_id, codigo, regiao_imediata, item_canonico_id, preco, preco_ref, coletado_em) values
  ('atacadao', 'a1', 410014, 'leite-integral-1l', 6.50, 6.50, now() - interval '10 days'), -- preço antigo
  ('atacadao', 'a1', 410014, 'leite-integral-1l', 5.89, 5.89, now()),                     -- vale o último
  ('atacadao', 'a2', 410014, 'leite-integral-1l', 5.49, 5.49, now()),
  ('angeloni', 'g1', 410014, 'leite-integral-1l', 4.69, 4.69, now()),
  ('angeloni', 'g2', 410014, 'leite-integral-1l', 4.69, 4.69, now()),
  ('angeloni', 'g3', 410014, 'leite-integral-1l', 4.89, 4.89, now()),                     -- mesma marca: 1 ponto
  ('condor',   'c1', 410014, 'leite-integral-1l', 5.99, 5.99, now()),
  ('condor',   'c2', 410014, 'leite-integral-1l', 59.90, 59.90, now()),                   -- outlier (>5× mediana)
  ('teste4',   't1', 410014, 'leite-integral-1l', 9.99, 9.99, now()),                     -- rede não selecionada
  ('atacadao', 'a2', 410014, 'leite-integral-1l', 1.00, 1.00, now() - interval '20 days'); -- fora da janela de 15 dias

do $$
declare
  e record;
begin
  perform recalcular_estat_preco();

  select * into e from estat_preco where item_canonico_id = 'leite-integral-1l' and nivel = 'imediata' and codigo_geo = 410014;
  -- pontos: atacadao/italac 5.89, atacadao/piracanjuba 5.49, angeloni/piracanjuba 4.69,
  --         angeloni/tirol mediana(4.69, 4.89)=4.79, condor/frimesa 5.99 (outlier e rede não selecionada fora)
  assert e.n_marcas = 5, format('esperava 5 pontos marca×rede, veio %s', e.n_marcas);
  assert e.n_redes = 3, format('esperava 3 redes, veio %s', e.n_redes);
  assert e.p50 = 5.49, format('esperava típico 5,49, veio %s', e.p50);
  assert e.p10 < e.p50 and e.p50 < e.p90, 'faixa precisa ser crescente';
  assert e.p90 < 6.0, format('outlier e rede não selecionada não podem entrar no premium (%s)', e.p90);

  -- Cascata: Maringá usa a região imediata; Sarandi (mesma região imediata) também
  select * into e from estimativa('leite-integral-1l', 4115200);
  assert e.nivel = 'imediata', format('Maringá deveria usar a região imediata, usou %s', e.nivel);
  select * into e from estimativa('leite-integral-1l', 4126256);
  assert e.nivel = 'imediata', format('Sarandi deveria usar a região imediata de Maringá, usou %s', e.nivel);

  -- Curitiba (outra região do PR) sobe para o estado; São Paulo sobe para o Brasil
  select * into e from estimativa('leite-integral-1l', 4106902);
  assert e.nivel = 'uf', format('Curitiba deveria cair no nível UF, caiu em %s', e.nivel);
  select * into e from estimativa('leite-integral-1l', 3550308);
  assert e.nivel = 'brasil', format('São Paulo deveria cair no nível Brasil, caiu em %s', e.nivel);

  -- Sem dado em nenhum nível: nenhuma linha (o bot pergunta o valor ao usuário)
  assert not exists (select 1 from estimativa('ketchup-400g', 4115200)), 'item sem preço não pode ter estimativa';

  -- Fila: agenda as 3 redes reais + teste4? Todas foram avaliadas agora, então nada a agendar
  assert agendar_coletas() = 0, 'redes recém-avaliadas não devem ser reagendadas';
  update rede_regiao set avaliado_em = now() - interval '8 days' where regiao_imediata = 410014;
  assert agendar_coletas() = 3, 'as 3 selecionadas com 8 dias devem ser reagendadas (a não selecionada só em 30)';
  assert agendar_coletas() = 0, 'não pode duplicar tarefa aberta';
  assert (select count(*) from pegar_tarefa()) = 1, 'pegar_tarefa deve devolver uma tarefa';
  assert (select count(*) from coleta_tarefa where status = 'executando') = 1, 'tarefa marcada como executando';

  raise notice 'precos: todos os testes passaram';
end $$;

rollback;
