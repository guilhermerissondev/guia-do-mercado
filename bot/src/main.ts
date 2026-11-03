// Ponto de entrada: long polling (não precisa de URL pública). Roda na mesma VPS do coletor.
//   TELEGRAM_BOT_TOKEN=... DATABASE_URL=... npm start

import { criarBot } from "./bot.ts";
import { conectar, Repo } from "./repo.ts";

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
  console.error("defina TELEGRAM_BOT_TOKEN (crie o bot no @BotFather)");
  process.exit(1);
}

const sql = conectar();
const bot = criarBot(token, new Repo(sql));

await bot.api.setMyCommands([
  { command: "lista", description: "Ver a lista e o total" },
  { command: "mercado", description: "Modo mercado: marcar itens e corrigir preços" },
  { command: "nova", description: "Começar outra lista" },
  { command: "cidade", description: "Trocar a cidade" },
  { command: "ajuda", description: "Como usar" },
  { command: "apagar_meus_dados", description: "Apagar tudo o que o bot guardou sobre você" },
]);

const parar = async () => {
  await bot.stop();
  await sql.end();
};
process.once("SIGINT", parar);
process.once("SIGTERM", parar);

console.log("bot iniciado");
await bot.start({ drop_pending_updates: false });
