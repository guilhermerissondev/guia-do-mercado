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
| M7 Landing + privacidade | 🟡 **desktop desenhado no Paper**, aguardando revisão do dono |

## Próximo passo (amanhã)

1. **Revisão da landing no Paper** (arquivo `guia-do-mercado-landing`, prancheta "Landing — Desktop"). Briefing: clima "sinalização de gôndola", paleta #FFFFFF / #15120F / #FFD11A (amarelo de etiqueta) / #F1F1EF / #6A6863 / #1F8A4C, Archivo condensada (wdth 72–75, 900) + Inter. Seções: hero com mock do bot e etiqueta de total, Como funciona, Preços da região (508 regiões, 20 redes, 94 itens, domingo), Compras a dois (faixa escura), Privacidade, CTA amarelo, rodapé.
2. Depois da revisão: versão **mobile** no Paper; exportar para `apps/landing/` (HTML para GitHub Pages) com a **política de privacidade** (LGPD: só telegram_id, cidade, listas e preços corrigidos; `/apagar_meus_dados`).
3. Pendências abertas em `decisoes.md`: P13 (441 regiões só com Atacadão; caminho é adaptador novo), P14 (adaptador VTEX FastStore, ex.: Amigão em Maringá), VPS no Brasil para produção (P5), consulta jurídica antes de abrir ao público (P6).

## O que está rodando nesta máquina

- **Coleta nacional refeita** (4/11, desacoplada com `setsid`) depois da troca da busca (D32) e das regras (D33): todas as 653 tarefas voltaram para a fila. Script `~/gm-run/coleta-nacional.sh`, logs em `~/gm-run/coleta-<rede>.log`; `~/gm-run/coleta-fim.txt` aparece no fim (depois do `recalcular`). Fica fora de `/tmp` porque o `/tmp` some quando a máquina reinicia. Se a máquina reiniciar: `docker start gm-pg-dev` e relançar o script (tarefas presas em "executando" voltam para a fila depois de 3 h).
- **Bot** (desacoplado): `cd bot && npm start`, log em `~/gm-run/bot.log`. Só pode haver uma instância. Não volta sozinho depois de reiniciar a máquina.
- **Banco de desenvolvimento**: `tools/dev-db.sh` (Docker `gm-pg-dev`, porta 54329) tem os **preços reais**; nunca rodar testes de integração nele. Backup antes do recasamento de 4/11: `~/gm-backups/antes-recasar-2026-11-04.dump`.

## Como testar

```bash
tools/test-db.sh            # SQL (6 suítes)
tools/test-integracao.sh    # coletor (97) e bot (65) num banco descartável
```

Último commit do dia: ver `git log`.
