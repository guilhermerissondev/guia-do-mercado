# Requisitos

## Problema

Montar a lista de compras em apps de notas ou no WhatsApp é manual; não há previsão do valor da compra; no mercado, somar item a item de cabeça leva a esquecimentos e contas refeitas.

## Requisitos funcionais (MVP)

| ID | Requisito |
|---|---|
| RF1 | Cadastrar a cidade do usuário (código IBGE) no primeiro uso, com busca tolerante a acento e erro de digitação. |
| RF2 | Criar lista por texto livre ("2 leite, arroz 5kg, café"), vários itens por mensagem, com quantidade. |
| RF3 | Mapear cada item a um item canônico ("leite integral 1L"); perguntar quando houver ambiguidade. |
| RF4 | Mostrar três faixas de preço por item (econômico, típico, premium) para a região do usuário; o usuário escolhe uma ou digita o valor. |
| RF5 | Calcular o total estimado da lista a partir dos valores escolhidos. |
| RF6 | Modo mercado: marcar item como pego, editar preço (opcional), ver total real e quanto falta, na mesma mensagem. |
| RF7 | Compartilhar a lista por convite, com edição concorrente segura. |
| RF8 | Aprender, a partir das edições espontâneas de preço, uma correção leve por categoria e localidade. |
| RF9 | Exibir origem e idade da estimativa ("região de Maringá, atualizada há 2 dias"). |
| RF10 | Sem dado em nenhum nível geográfico, perguntar o valor ao usuário. |
| RF11 | Excluir os dados do usuário sob comando. |

## Requisitos não funcionais

- **Nacional por construção:** nenhum código específico de cidade ou estado; toda estimativa usa a hierarquia do IBGE.
- **Uma fonte de preço base por método, não por UF:** coletor por plataforma de e-commerce.
- **Desempenho:** ações de lista respondem em menos de 1 s (estimativas pré-calculadas).
- **Idempotência:** reenvio de atualização do Telegram não duplica itens.
- **Explicabilidade:** toda estimativa mostra de onde vem; dado velho nunca é apresentado como atual.
- **Privacidade (LGPD):** só `telegram_id`, cidade e listas; sem telefone; tokens de lista longos e aleatórios.
- **Custo:** quase zero no piloto; ordem de dezenas de dólares por mês em produção inicial (a confirmar).

## Fora de escopo

WhatsApp, foto de cupom, coletores por estado, Mini App, histórico, listas recorrentes, leitura de código de barras, áudio, lembretes ativos, monetização.
