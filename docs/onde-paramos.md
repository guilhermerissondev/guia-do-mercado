# Onde paramos (atualizado em 2026-11-04)

Nota de passagem para o próximo agente ou sessão. Leia junto com `plano.md`, `decisoes.md` e `validacao-maringa.md`.

## Contexto rápido

Bot de Telegram (@GuiaDoMercadoBot) para lista de compras com faixa de preço (econômico/típico/premium) por região do IBGE, modo mercado com check e correção de preço, aprendizado com os preços corrigidos e lista compartilhada. O dono do produto (Guilherme, Maringá-PR) valida cada etapa em uso real. Comunicação em português.

## Etapas

| Etapa | Situação |
|---|---|
| M0 Geografia IBGE | ✅ |
| M1 Spike de coleta | ✅ |
| M2 Catálogo e casamento (94 itens) | ✅ aprovado (50/50 casamentos) |
| M3 Coletor e preço base | ✅ aprovado; coleta semanal domingo 12h; CEP em 508 de 510 regiões |
| M4 Bot núcleo | ✅ lista numa mensagem (E/T/P), "você quis dizer?", adicionar, desfazer remoção |
| Mapa nacional de redes | ✅ 20 redes viáveis de 96 candidatas (`docs/mapa-redes.md`) |
| M5 Aprendizado com preços corrigidos | ✅ código; teste real quando o app estiver no ar |
| M6 Lista compartilhada | ✅ código; teste real com duas pessoas quando o app estiver no ar |
| M7 Landing + privacidade | 🟡 **landing em código** em `apps/landing/` (desktop + mobile responsivos, política de privacidade), aguardando revisão do dono |

## Próximo passo (amanhã)

1. **Revisão da landing no Paper** (arquivo `guia-do-mercado-landing`, prancheta "Landing — Desktop"). Briefing: clima "sinalização de gôndola", paleta #FFFFFF / #15120F / #FFD11A (amarelo de etiqueta) / #F1F1EF / #6A6863 / #1F8A4C, Archivo condensada (wdth 72–75, 900) + Inter. Seções: hero com mock do bot e etiqueta de total, Como funciona, Preços da região (508 regiões, 20 redes, 94 itens, domingo), Compras a dois (faixa escura), Privacidade, CTA amarelo, rodapé.
2. **Landing migrou do Paper para o código** (2026-11-04): a cota semanal do MCP do Paper acabou, então a construção segue no repositório e é conferida no navegador do Orca. `apps/landing/index.html` + `styles.css` (um corte em 1180 px e outro em 860 px), `chat.js` (mock do hero com a resposta real do bot para "2 leite, arroz 5kg, café, tomate 1kg" em Maringá, preços da coleta de 4/11; animado: mensagem, "digitando…", texto digitado, teclado linha a linha, toques de demonstração em E/T/P com total recalculado, etiqueta balançando; desliga com "reduzir movimento") e `privacidade.html`. Paleta (4/11): coolors.co/fdfffc-235789-c1292e-f1d302-161925, com fundo #FDFFFC, tinta #161925, amarelo #F1D302, azul #235789 na faixa "Compras a dois", vermelho #C1292E só nos rótulos e números dos passos; variáveis no topo de `styles.css`. Para ver: `cd apps/landing && python3 -m http.server 8765` e abrir `http://127.0.0.1:8765/`. O Paper (`guia-do-mercado-landing`) fica só como referência do desenho original. Próximo: o dono revisa; depois cores, design e animações; publicar no GitHub Pages.
   - Posicionamento (4/11): dois pilares, agilidade ("Lista de compras pronta em uma mensagem") e lista compartilhada (faixa azul com o modo mercado animado em `mercado.js`). Ordem: hero → contraste sem/com o Guia → como funciona → compras a dois → preços da região → privacidade → perguntas frequentes → CTA. CTA principal "Montar minha lista grátis". Sem depoimentos, contadores ou urgência inventados enquanto não houver usuários reais. O site promete "acompanhar de casa" (botão 🔄 Atualizar), não "ao vivo": o bot não empurra atualizações para quem está em casa.
   - Marca (4/11): ícone em `apps/landing/logo.svg` (carrinho levando bloco de notas, lápis, cédula e moeda; cores da paleta). Derivados: `favicon.svg` (tile amarelo), `apple-touch-icon.png` (180 px) e `avatar-telegram.png` (640 px, para a foto do bot no BotFather com `/setuserpic`, ainda não aplicada). Regerar os PNGs com `rsvg-convert`.
   - Fundo azul (4/11): o site todo usa #235789 de fundo. Esquema por variáveis em `styles.css`: padrão azul (texto claro, rótulos e números em amarelo) e superfícies claras (`.chat`, `.final`, `.aviso`) que voltam ao texto escuro. Faixas: azul fundo #1B4670 em "Como funciona" e "Privacidade", tinta #161925 em "Compras a dois" e no rodapé, amarelo no CTA final. Botões principais amarelos com texto escuro. Vermelho só no selo do ✕ (texto vermelho sobre azul não passa no contraste). Marca do menu em SVG embutido e animada (chega rodando, balança a cada 5 s, empurrão e moeda girando no hover).
   - Política de privacidade: o bot também guarda o **primeiro nome do Telegram** (`usuario.nome`), e a política diz isso. "Contato" aponta para o próprio bot até haver um canal (e-mail) definido. Revisar com a consulta jurídica (P6) antes de abrir ao público.
3. Pendências abertas em `decisoes.md`: P13 (441 regiões só com Atacadão; caminho é adaptador novo), P14 (adaptador VTEX FastStore, ex.: Amigão em Maringá), VPS no Brasil para produção (P5), consulta jurídica antes de abrir ao público (P6).

## O que está rodando nesta máquina

- **Coleta nacional refeita e concluída** (4/11, 07h15–14h30) com a busca dupla (D32) e as regras novas (D33): 651 de 653 tarefas; 2 do Atacadão (regiões 350037 e 410001) pararam em 503 e ficam para o domingo, com os preços de 3/11 valendo. 316 mil preços, **508 regiões com faixa** (antes 137), Atacadão com 79 itens por região (antes 67), Maringá com 87 de 94 itens. Script `~/gm-run/coleta-nacional.sh`, logs em `~/gm-run/`. Se a máquina reiniciar: `docker start gm-pg-dev`.
- **Bot** (desacoplado): `cd bot && npm start`, log em `~/gm-run/bot.log`. Só pode haver uma instância. Não volta sozinho depois de reiniciar a máquina.
- **Banco de desenvolvimento**: `tools/dev-db.sh` (Docker `gm-pg-dev`, porta 54329) tem os **preços reais**; nunca rodar testes de integração nele. Backup antes do recasamento de 4/11: `~/gm-backups/antes-recasar-2026-11-04.dump`.

## Como testar

```bash
tools/test-db.sh            # SQL (6 suítes)
tools/test-integracao.sh    # coletor (97) e bot (65) num banco descartável
```

Último commit do dia: ver `git log`.
