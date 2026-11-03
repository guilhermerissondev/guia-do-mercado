// Ponto de entrada: long polling (não precisa de URL pública). Roda na mesma VPS do coletor.
//   npm start   (lê bot/.env: TELEGRAM_BOT_TOKEN e DATABASE_URL)

import { criarBot } from "./bot.ts";
import { conectar, Repo } from "./repo.ts";

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
  console.error("defina TELEGRAM_BOT_TOKEN em bot/.env (crie o bot no @BotFather)");
  process.exit(1);
}

// Erros de rede trazem a URL da API, que contém o token: nunca deixar o token ir para o log.
const mascarar = (v: unknown): unknown =>
  typeof v === "string" ? v.replaceAll(token, "<token>") :
  v instanceof Error ? mascarar(`${v.name}: ${v.message}${v.cause ? ` (causa: ${String((v.cause as Error).message ?? v.cause)})` : ""}`) :
  v;
for (const nivel of ["log", "warn", "error"] as const) {
  const original = console[nivel].bind(console);
  console[nivel] = (...args: unknown[]) => original(...args.map(mascarar));
}

const sql = conectar();
const bot = criarBot(token, new Repo(sql));

const COMANDOS = [
  { command: "lista", description: "Ver e ajustar a lista" },
  { command: "mercado", description: "Modo mercado: marcar itens e corrigir preços" },
  { command: "nova", description: "Começar outra lista" },
  { command: "cidade", description: "Trocar a cidade" },
  { command: "ajuda", description: "Como usar" },
  { command: "apagar_meus_dados", description: "Apagar tudo o que o bot guardou sobre você" },
];

/** O menu de comandos não é essencial: se a rede falhar, tenta de novo sem derrubar o bot. */
async function registrarComandos(tentativa = 1): Promise<void> {
  try {
    await bot.api.setMyCommands(COMANDOS);
  } catch (e) {
    const espera = Math.min(60, 5 * tentativa);
    console.warn(`não consegui registrar os comandos (tentativa ${tentativa}); tento de novo em ${espera}s:`, e);
    setTimeout(() => void registrarComandos(tentativa + 1), espera * 1000);
  }
}

const parar = async () => {
  await bot.stop();
  await sql.end();
};
process.once("SIGINT", parar);
process.once("SIGTERM", parar);

void registrarComandos();
console.log("bot iniciado");
// bot.start já repete o getUpdates quando a rede cai; aqui só garantimos que um erro na
// partida (ex.: getMe sem rede) não encerre o processo sem nova tentativa.
for (let tentativa = 1; ; tentativa++) {
  try {
    await bot.start({ drop_pending_updates: false });
    break; // parado por SIGINT/SIGTERM
  } catch (e) {
    const espera = Math.min(60, 5 * tentativa);
    console.error(`bot parou por erro (tentativa ${tentativa}); reinicio em ${espera}s:`, e);
    await new Promise((r) => setTimeout(r, espera * 1000));
  }
}
