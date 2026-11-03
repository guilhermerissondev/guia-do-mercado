# Criar o bot no Telegram e rodar o piloto

O código do bot está pronto (`bot/`). Falta criar a conta do bot no Telegram, o que só o dono do produto pode fazer.

## 1. Criar o bot no @BotFather (5 minutos, no celular)

1. No Telegram, abra uma conversa com **@BotFather** (tem o selo azul de verificado).
2. Envie `/newbot`.
3. **Nome** (aparece no topo da conversa): por exemplo `Guia do Mercado`.
4. **Usuário** (o endereço `t.me/...`): precisa terminar em `bot` e estar livre. Por exemplo `GuiaDoMercadoBot` ou `guia_do_mercado_bot`.
5. O BotFather responde com o **token**, algo como `1234567890:AAH...`. **Trate como senha**: não mande em grupo, não publique, não coloque no repositório.

Opcional, para deixar o bot apresentável:

- `/setdescription`: texto que aparece antes do usuário iniciar a conversa. Sugestão: *"Monte sua lista de compras, veja quanto ela vai custar com preços dos mercados da sua região e marque os itens no mercado com o total sempre atualizado."*
- `/setabouttext`: frase curta do perfil. Sugestão: *"Lista de compras com preço estimado da sua região."*
- `/setuserpic`: foto do perfil.

Os comandos do menu (`/lista`, `/mercado`, ...) o próprio bot registra quando inicia.

## 2. Me passar o token com segurança

Não cole o token no chat. Crie o arquivo `bot/.env` (já está fora do git) com:

```
TELEGRAM_BOT_TOKEN=cole-o-token-aqui
DATABASE_URL=postgresql://postgres:dev@localhost:54329/postgres
```

## 3. Rodar o piloto na máquina de desenvolvimento

```bash
tools/dev-db.sh                      # banco local com preços de Maringá
cd bot
npm start                            # lê o bot/.env sozinho; mostra "bot iniciado"
```

Para parar: `Ctrl+C`. Só pode haver **um** bot rodando por vez (o Telegram recusa dois ao mesmo tempo).

Com o processo rodando, abra `t.me/<usuário do bot>` no celular e mande `/start`. O bot responde enquanto o processo estiver ligado. Na produção ele roda na VPS (`deploy/guia-do-mercado-bot.service`).

## 4. Se o token vazar

No @BotFather: `/revoke`, escolha o bot e gere outro token. O antigo para de funcionar na hora.
