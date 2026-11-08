const { JSDOM } = require("jsdom");
const fs = require("fs");
const html = fs.readFileSync(require("path").join(__dirname, "../public/index.html"), "utf8").replace('<script src="/app.js"></script>', "");
const script = fs.readFileSync(require("path").join(__dirname, "../public/app.js"), "utf8");

const chamadas = [];
let logado = false;
const restaurante = { id: 7, name: "Sushi Zen", category: "Japonesa", rating: 4.9, imageUrl: "/uploads/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.webp" };
const pratos = [
  { id: 1, name: "Combinado", price: 59.9, description: "20 peças", available: true, imageUrl: "/uploads/bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb.webp", restaurantId: 7 },
  { id: 2, name: "<img src=x onerror=alert(1)>", price: 10, description: null, available: false, imageUrl: "javascript:alert(1)", restaurantId: 7 }
];
const pag = (dados) => ({ dados, paginacao: { pagina: 1, limite: 9, total: dados.length, totalPaginas: 1, temProxima: false, temAnterior: false } });

function resposta(status, corpo) {
  return Promise.resolve({ ok: status < 400, status, text: () => Promise.resolve(corpo === undefined ? "" : JSON.stringify(corpo)) });
}
function fetchFalso(url, opts = {}) {
  const metodo = opts.method || "GET";
  chamadas.push({ metodo, url, auth: opts.headers && opts.headers.Authorization, corpo: opts.body });
  if (url === "/api/v1/restaurants?pagina=1&limite=9") return resposta(200, pag([restaurante]));
  if (url === "/api/v1/restaurants/7") return resposta(200, restaurante);
  if (url === "/api/v1/restaurants/7/dishes?limite=50") return resposta(200, pag(pratos));
  if (url === "/api/v1/auth/login") return resposta(200, { tokens: { accessToken: "tok123" }, usuario: {} });
  if (url === "/api/v1/auth/register") return resposta(201, {});
  if (url === "/api/v1/auth/me") return opts.headers.Authorization ? resposta(200, { perfil: { id: 1, name: "Gleice", email: "g@x.com", role: "customer", imageUrl: null } }) : resposta(401, { error: { message: "Token não informado." } });
  if (url === "/api/v1/restaurants/7/dishes" && metodo === "POST") return resposta(201, { id: 3 });
  if (url === "/api/v1/dishes/1/image" && metodo === "POST") return resposta(200, { id: 1 });
  if (url === "/api/v1/auth/me/image" && metodo === "POST") return resposta(200, { perfil: {} });
  return resposta(404, { error: { message: "Rota não encontrada: " + url } });
}

const dom = new JSDOM(html, {
  runScripts: "outside-only", url: "http://localhost:3000/", pretendToBeVisual: true
});
const { window } = dom;
window.fetch = fetchFalso;
window.HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
window.HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
window.eval(script);

let ok = 0, falhas = 0;
const checar = (d, c, extra = "") => { if (c) { ok++; console.log("  ✓", d); } else { falhas++; console.log("  ✗", d, extra); } };
const esperar = (ms = 30) => new Promise((r) => setTimeout(r, ms));
const $ = (s) => window.document.querySelector(s);
const $$ = (s) => [...window.document.querySelectorAll(s)];

(async () => {
  await esperar();
  console.log("Restaurantes (visitante)");
  checar("lista o restaurante com nome", $$(".cartao h3").map((e) => e.textContent).includes("Sushi Zen"));
  checar("mostra a foto do restaurante", $(".cartao img.capa")?.getAttribute("src") === restaurante.imageUrl);
  checar("sem login não mostra formulário de cadastro", !$("form.painel") && /Entre para cadastrar/.test($("#view").textContent));
  checar("botão Entrar/Criar conta no topo", $$("#auth-area button").length === 2);

  console.log("Login");
  $$("#auth-area button")[0].click();
  checar("abre o diálogo de login", $("#dialogo-auth").hasAttribute("open"));
  $("#form-auth [name=email]").value = "g@x.com";
  $("#form-auth [name=password]").value = "SenhaForte1";
  $("#form-auth").dispatchEvent(new window.Event("submit", { cancelable: true }));
  await esperar(80);
  checar("guarda o token na sessão", window.sessionStorage.getItem("easyfood_token") === "tok123");
  checar("fecha o diálogo", !$("#dialogo-auth").hasAttribute("open"));
  checar("mostra o nome no topo e botão Sair", /Gleice/.test($("#auth-area").textContent) && /Sair/.test($("#auth-area").textContent));
  checar("logado: aparece o formulário Novo restaurante", Boolean($("form.painel")));
  checar("logado: botão Trocar foto no cartão", $$(".cartao button").some((b) => /Trocar foto/.test(b.textContent)));

  console.log("Cardápio");
  window.location.hash = "#/restaurante/7";
  await esperar(80);
  checar("título do restaurante", $("h1")?.textContent === "Sushi Zen");
  checar("lista os 2 pratos", $$(".grade .cartao").length === 2);
  checar("prato com foto usa a imagem retornada", $$(".grade img.capa")[0]?.getAttribute("src") === pratos[0].imageUrl);
  checar("preço formatado em reais", /R\$\s?59,90/.test($$(".preco")[0].textContent.replace(/\u00a0/g, " ")));
  checar("prato indisponível mostra o aviso", /Indisponível/.test($$(".grade .cartao")[1].textContent));
  checar("imageUrl perigosa (javascript:) é ignorada", $$(".grade .cartao")[1].querySelector("img") === null);
  checar("nome malicioso aparece como texto (sem HTML injetado)", $$(".grade .cartao h3")[1].textContent.includes("<img") && $$(".grade .cartao h3")[1].querySelector("img") === null);
  checar("formulário Novo prato presente", /Novo prato/.test($("form.painel h3").textContent));

  console.log("Cadastro de prato");
  const f = $("form.painel");
  f.querySelector("[name=name]").value = "Sashimi";
  f.querySelector("[name=price]").value = "42.5";
  f.dispatchEvent(new window.Event("submit", { cancelable: true }));
  await esperar(80);
  const post = chamadas.find((c) => c.metodo === "POST" && c.url === "/api/v1/restaurants/7/dishes");
  checar("POST /restaurants/7/dishes enviado com JWT", Boolean(post) && post.auth === "Bearer tok123");
  checar("corpo com nome e preço numérico", post && JSON.parse(post.corpo).name === "Sashimi" && JSON.parse(post.corpo).price === 42.5);
  checar("sem descrição vazia no corpo", post && !("description" in JSON.parse(post.corpo)));

  console.log("Foto do prato");
  const input = $$(".grade .cartao input[type=file]")[0];
  const arquivo = new window.File([new Uint8Array(10)], "foto.png", { type: "image/png" });
  Object.defineProperty(input, "files", { value: [arquivo], configurable: true });
  input.dispatchEvent(new window.Event("change"));
  await esperar(80);
  const up = chamadas.find((c) => c.url === "/api/v1/dishes/1/image");
  checar("POST /dishes/1/image enviado com JWT e multipart", Boolean(up) && up.auth === "Bearer tok123" && up.corpo instanceof window.FormData && up.corpo.get("image").name === "foto.png");

  const ruim = new window.File([new Uint8Array(10)], "x.gif", { type: "image/gif" });
  const antes = chamadas.length;
  Object.defineProperty(input, "files", { value: [ruim], configurable: true });
  input.dispatchEvent(new window.Event("change"));
  await esperar(30);
  checar("tipo inválido é barrado no navegador (sem chamada à API)", chamadas.length === antes && /PNG, JPG ou WEBP/.test($("#toasts").textContent));

  console.log("Perfil");
  window.location.hash = "#/perfil";
  await esperar(80);
  checar("mostra nome, e-mail e papel", /Gleice/.test($("#view").textContent) && /g@x.com/.test($("#view").textContent) && /customer/.test($("#view").textContent));
  const inputPerfil = $("#view input[type=file]");
  Object.defineProperty(inputPerfil, "files", { value: [arquivo], configurable: true });
  inputPerfil.dispatchEvent(new window.Event("change"));
  await esperar(80);
  checar("POST /auth/me/image enviado com JWT", chamadas.some((c) => c.url === "/api/v1/auth/me/image" && c.auth === "Bearer tok123"));

  console.log("Sair");
  $$("#auth-area button")[0].click();
  await esperar(50);
  checar("logout limpa a sessão", window.sessionStorage.getItem("easyfood_token") === null && $$("#auth-area button").length === 2);

  console.log(`\nResultado: ${ok} passaram${falhas ? ", " + falhas + " falharam" : ""}`);
  process.exit(falhas ? 1 : 0);
})();
