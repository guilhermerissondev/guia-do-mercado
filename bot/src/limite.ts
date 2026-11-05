// Limite de ritmo por usuário, em memória (uma instância do bot só). Protege o banco de quem
// manda mensagens ou toca em botões sem parar; uso normal no mercado fica bem abaixo do limite.

export interface Limite {
  max: number;      // atualizações permitidas por janela
  janelaMs: number;
}

export const LIMITE_PADRAO: Limite = { max: 60, janelaMs: 60_000 };

export class Limitador {
  private readonly vistos = new Map<number, number[]>();
  private readonly avisados = new Map<number, number>();

  constructor(private readonly limite: Limite = LIMITE_PADRAO, private readonly agora: () => number = Date.now) {}

  /** true se o usuário ainda pode ser atendido; registra a atualização. */
  permitir(id: number): boolean {
    const t = this.agora();
    const desde = t - this.limite.janelaMs;
    const lista = (this.vistos.get(id) ?? []).filter((v) => v > desde);
    if (lista.length >= this.limite.max) {
      this.vistos.set(id, lista);
      return false;
    }
    lista.push(t);
    this.vistos.set(id, lista);
    if (this.vistos.size > 10_000) this.esquecer(desde);
    return true;
  }

  /** true uma vez por janela para quem passou do limite: avisa sem responder a cada mensagem. */
  avisar(id: number): boolean {
    const t = this.agora();
    const ultimo = this.avisados.get(id);
    if (ultimo !== undefined && t - ultimo < this.limite.janelaMs) return false;
    this.avisados.set(id, t);
    return true;
  }

  private esquecer(desde: number): void {
    for (const [id, lista] of this.vistos) if (!lista.some((v) => v > desde)) this.vistos.delete(id);
    for (const [id, t] of this.avisados) if (t <= desde) this.avisados.delete(id);
  }
}
