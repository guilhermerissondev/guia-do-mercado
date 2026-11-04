// Mock da conversa no hero, com a resposta que o bot dá hoje para "2 leite, arroz 5kg, café,
// tomate 1kg" em Maringá. Roteiro: a mensagem sai, o bot fica "digitando…", a resposta chega
// com o texto digitado aos poucos e o teclado linha a linha; depois, toques de demonstração
// nas faixas E/T/P. O primeiro clique da pessoa encerra a demonstração.

(() => {
  const chat = document.querySelector(".chat");
  if (!chat) return;

  const teclado = chat.querySelector(".teclado");
  const totais = chat.querySelectorAll("[data-total]");
  const etiqueta = chat.querySelector(".etiqueta");
  const texto = chat.querySelector("[data-digitar]");
  const status = chat.querySelector("[data-status]");
  const quieto = matchMedia("(prefers-reduced-motion: reduce)").matches;

  const reais = (c) => "R$ " + (c / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

  // Em centavos, como o bot: cada botão já mostra o valor da linha arredondado
  const calcular = () =>
    [...teclado.querySelectorAll(".tecla--escolhida")].reduce((s, b) => s + Math.round(Number(b.dataset.valor) * 100), 0);

  // ------------------------------------------------------------------ total

  let mostrado = calcular();
  let quadro = 0;

  function mostrarTotal(alvo) {
    cancelAnimationFrame(quadro);
    if (quieto) {
      mostrado = alvo;
      totais.forEach((t) => (t.textContent = reais(alvo)));
      return;
    }
    const de = mostrado;
    const inicio = performance.now();
    const passo = (agora) => {
      const t = Math.min(1, (agora - inicio) / 450);
      mostrado = Math.round(de + (alvo - de) * (1 - Math.pow(1 - t, 3)));
      totais.forEach((el) => (el.textContent = reais(mostrado)));
      if (t < 1) quadro = requestAnimationFrame(passo);
    };
    quadro = requestAnimationFrame(passo);
    etiqueta.classList.remove("etiqueta--pulo");
    void etiqueta.offsetWidth; // reinicia a animação
    etiqueta.classList.add("etiqueta--pulo");
  }

  // ------------------------------------------------------------------ toque

  function escolher(botao) {
    const grupo = botao.parentElement;
    const antes = grupo.querySelector(".tecla--escolhida");
    botao.classList.remove("tecla--toque");
    void botao.offsetWidth;
    botao.classList.add("tecla--toque");
    if (antes === botao) return;
    antes?.classList.remove("tecla--escolhida");
    antes?.setAttribute("aria-pressed", "false");
    botao.classList.add("tecla--escolhida");
    botao.setAttribute("aria-pressed", "true");
    mostrarTotal(calcular());
  }

  let demonstrando = !quieto;

  teclado.addEventListener("click", (e) => {
    const botao = e.target.closest("button.tecla");
    if (!botao) return;
    demonstrando = false;
    escolher(botao);
  });

  teclado.addEventListener("animationend", (e) => {
    if (e.animationName === "toque") e.target.classList.remove("tecla--toque");
  });

  // ------------------------------------------------------------------ demonstração

  // [item, faixa]: volta tudo ao típico, para o loop recomeçar sem salto.
  const roteiro = [
    [3, 0], [0, 0], [1, 2], [2, 0], [3, 1], [1, 1], [0, 1], [2, 1],
  ];

  async function demonstrar() {
    const grupos = teclado.querySelectorAll(".teclado__faixas");
    while (demonstrando) {
      for (const [item, faixa] of roteiro) {
        await esperar(1600);
        if (!demonstrando || document.hidden) break;
        escolher(grupos[item].children[faixa]);
      }
      await esperar(1200);
    }
  }

  // ------------------------------------------------------------------ texto digitado

  // Cada pedaço de texto vira [digitado][restante invisível]: o balão já nasce do tamanho
  // final e nada pula enquanto as letras aparecem. Negritos e quebras de linha ficam onde estão.
  function prepararDigitacao() {
    const pedacos = [];
    const andar = document.createTreeWalker(texto, NodeFilter.SHOW_TEXT);
    const nos = [];
    while (andar.nextNode()) nos.push(andar.currentNode);
    nos.forEach((no, i) => {
      let t = no.textContent.replace(/\s+/g, " ");
      if (i === 0) t = t.trimStart();
      if (i === nos.length - 1) t = t.trimEnd();
      const feito = document.createElement("span");
      const resto = document.createElement("span");
      resto.className = "digitando__resto";
      resto.textContent = t;
      no.replaceWith(feito, resto);
      pedacos.push({ feito, resto, t });
    });
    return pedacos;
  }

  async function digitar(pedacos) {
    const cursor = document.createElement("span");
    cursor.className = "digitando__cursor";
    for (const { feito, resto, t } of pedacos) {
      feito.after(cursor);
      for (const c of t.match(/\p{Extended_Pictographic}️?|./gsu) ?? []) {
        feito.textContent += c;
        resto.textContent = resto.textContent.slice(c.length);
        await esperar(c === "," || c === ";" ? 140 : c === "." ? 240 : 16 + Math.random() * 20);
      }
    }
    await esperar(500);
    cursor.remove();
  }

  // ------------------------------------------------------------------ roteiro

  if (quieto) return;

  const mensagem = chat.querySelector(".balao--eu");
  const pontos = chat.querySelector(".balao--digitando");
  const balao = chat.querySelector(".balao--bot");
  const linhas = chat.querySelectorAll(".teclado__linha");
  const pedacos = prepararDigitacao();
  chat.classList.add("chat--animado");

  async function conversar() {
    await esperar(300);
    mensagem.classList.add("chegou");
    await esperar(700);
    status.textContent = "digitando…";
    pontos.classList.add("chegou");
    await esperar(1400);
    pontos.classList.remove("chegou");
    status.textContent = "bot";
    balao.classList.add("chegou");
    await esperar(250);
    await digitar(pedacos);
    for (const l of linhas) {
      l.classList.add("chegou");
      await esperar(70);
    }
    etiqueta.classList.add("chegou");
    await esperar(600);
    demonstrar();
  }

  // Começa quando o card aparece na tela.
  const observador = new IntersectionObserver(
    ([entrada]) => {
      if (!entrada.isIntersecting) return;
      observador.disconnect();
      conversar();
    },
    { threshold: 0.2 },
  );
  observador.observe(chat);
})();
