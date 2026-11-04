// Mock do modo mercado na faixa "Compras a dois": a outra pessoa entra na lista e vai marcando
// os itens no corredor; "No carrinho" e "Falta pegar" acompanham. Em loop, volta ao começo.

(() => {
  const mercado = document.querySelector(".mercado");
  if (!mercado || matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const aviso = mercado.querySelector(".aviso");
  const linhas = [...mercado.querySelectorAll(".linha")];
  const marcados = mercado.querySelector("[data-marcados]");
  const carrinho = mercado.querySelector("[data-carrinho]");
  const falta = mercado.querySelector("[data-falta]");
  const inicial = linhas.map((l) => !l.classList.contains("linha--aberta"));

  const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
  const reais = (c) => "R$ " + (c / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const centavos = (l) => Math.round(Number(l.dataset.preco) * 100);

  function contar() {
    const dentro = linhas.filter((l) => !l.classList.contains("linha--aberta"));
    marcados.textContent = dentro.length;
    carrinho.textContent = reais(dentro.reduce((s, l) => s + centavos(l), 0));
    falta.textContent = reais(linhas.filter((l) => !dentro.includes(l)).reduce((s, l) => s + centavos(l), 0));
  }

  function marcar(l, sim) {
    l.classList.toggle("linha--aberta", !sim);
    l.classList.remove("linha--marcou");
    if (sim) {
      void l.offsetWidth;
      l.classList.add("linha--marcou");
    }
    contar();
  }

  async function ciclo() {
    aviso.classList.add("aviso--chegou");
    for (;;) {
      await esperar(2200);
      for (const [i, l] of linhas.entries()) {
        if (inicial[i]) continue;
        marcar(l, true);
        await esperar(2000);
      }
      await esperar(2400);
      linhas.forEach((l, i) => marcar(l, inicial[i]));
    }
  }

  mercado.classList.add("mercado--animado");
  const observador = new IntersectionObserver(
    ([e]) => {
      if (!e.isIntersecting) return;
      observador.disconnect();
      ciclo();
    },
    { threshold: 0.3 },
  );
  observador.observe(mercado);
})();
