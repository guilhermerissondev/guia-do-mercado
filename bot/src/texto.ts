// Normalização e leitura da lista digitada pelo usuário.
// normalizar() espelha collector/gm/texto.py para que bot e coletor vejam o mesmo texto.

export function normalizar(texto: string): string {
  return texto
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/(?<=\d),(?=\d)/g, ".")
    .replace(/[^a-z0-9.]+/g, " ")
    .replace(/(?<!\d)\.|\.(?!\d)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export interface Medida {
  valor: number; // em g, ml ou un
  unidade: "g" | "ml" | "un";
}

const MASSA: Record<string, number> = { kg: 1000, kgs: 1000, quilo: 1000, quilos: 1000, g: 1, gr: 1, grs: 1, grama: 1, gramas: 1 };
const VOLUME: Record<string, number> = { l: 1000, lt: 1000, lts: 1000, litro: 1000, litros: 1000, ml: 1 };
const UNIDADES = Object.keys({ ...MASSA, ...VOLUME }).sort((a, b) => b.length - a.length).join("|");
const RE_MEDIDA = new RegExp(`(?<![a-z0-9.])(\\d+(?:\\.\\d+)?)\\s*(${UNIDADES})\\b`);

/** Tamanho escrito pelo usuário ("arroz 5kg", "agua 1.5 litros"), já normalizado. */
export function extrairMedida(normalizado: string): { medida: Medida | null; resto: string } {
  const m = RE_MEDIDA.exec(normalizado);
  if (!m) return { medida: null, resto: normalizado };
  const valor = Number(m[1]);
  const unidade = m[2]!;
  const medida: Medida =
    unidade in MASSA
      ? { valor: valor * MASSA[unidade]!, unidade: "g" }
      : { valor: valor * VOLUME[unidade]!, unidade: "ml" };
  const resto = (normalizado.slice(0, m.index) + " " + normalizado.slice(m.index + m[0].length)).replace(/\s+/g, " ").trim();
  return { medida, resto };
}

const NUMERAIS: Record<string, number> = {
  um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9, dez: 10,
  duzia: 12, "meia duzia": 6,
};

/** Maior quantidade aceita por item: acima disso é erro de digitação (e estouraria a coluna). */
export const QTD_MAX = 99;

export interface Entrada {
  texto: string;      // como o usuário escreveu, sem a quantidade
  quantidade: number;
}

/** Divide a mensagem em itens ("2 leite, arroz 5kg e café") e separa a quantidade. */
export function lerLista(mensagem: string): Entrada[] {
  const partes = mensagem
    .split(/\n|,|;|\s+e\s+/i)
    .map((p) => p.replace(/^\s*[-*•·]+\s*/, "").trim())
    .filter((p) => p.length > 0);
  return partes.map(lerEntrada).filter((e) => normalizar(e.texto).length > 0);
}

function lerEntrada(parte: string): Entrada {
  let texto = parte.trim();
  let quantidade = 1;

  // "2 leite", "2x leite", "2 x leite", "2 un leite" (número sem unidade de medida logo depois)
  const inicio = /^(\d+)\s*(?:x|un|und|unid|unidades?)?\s+(?!kg\b|g\b|ml\b|l\b|litros?\b|gramas?\b)(.+)$/i.exec(texto);
  // "leite x2", "leite 2x", "leite (2)"
  const fim = /^(.+?)\s+(?:x\s*(\d+)|(\d+)\s*x|\((\d+)\))$/i.exec(texto);
  const porExtenso = /^(meia d[uú]zia|um|uma|dois|duas|tr[eê]s|quatro|cinco|seis|sete|oito|nove|dez|d[uú]zia)\s+(?:de\s+)?(.+)$/i.exec(texto);

  if (inicio) {
    quantidade = Number(inicio[1]);
    texto = inicio[2]!;
  } else if (fim) {
    quantidade = Number(fim[2] ?? fim[3] ?? fim[4]);
    texto = fim[1]!;
  } else if (porExtenso) {
    quantidade = NUMERAIS[normalizar(porExtenso[1]!)] ?? 1;
    texto = porExtenso[2]!;
  }
  return { texto: texto.trim(), quantidade: quantidade > 0 ? Math.min(quantidade, QTD_MAX) : 1 };
}

/** Valor em reais digitado pelo usuário ("6,20", "R$ 6.2", "12"). */
export function lerValor(mensagem: string): number | null {
  const m = /(\d{1,6}(?:[.,]\d{1,2})?)/.exec(mensagem.replace(/\s/g, ""));
  if (!m) return null;
  const v = Number(m[1]!.replace(",", "."));
  return Number.isFinite(v) && v > 0 && v < 100000 ? Math.round(v * 100) / 100 : null;
}
