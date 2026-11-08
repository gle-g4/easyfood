const CATEGORIAS = ["Italiana", "Japonesa", "Brasileira", "Mexicana", "Árabe", "Vegetariana", "Fast Food", "Cafeteria", "Outra"];
const TIPOS_IMAGEM = ["image/png", "image/jpeg", "image/webp"];
const LIMITE_BYTES = 5 * 1024 * 1024;
const CHAVE_TOKEN = "easyfood_token";

const state = {
  token: sessionStorage.getItem(CHAVE_TOKEN),
  perfil: null,
  modoAuth: "login",
  paginaRestaurantes: 1
};

const view = document.getElementById("view");
const dialogo = document.getElementById("dialogo-auth");
const formAuth = document.getElementById("form-auth");

function h(tag, attrs, ...filhos) {
  const el = document.createElement(tag);
  for (const [chave, valor] of Object.entries(attrs || {})) {
    if (valor === null || valor === undefined || valor === false) continue;
    if (chave === "class") el.className = valor;
    else if (chave.startsWith("on")) el.addEventListener(chave.slice(2), valor);
    else if (chave === "value") el.value = valor;
    else el.setAttribute(chave, valor === true ? "" : valor);
  }
  for (const filho of filhos.flat()) {
    if (filho === null || filho === undefined || filho === false) continue;
    el.append(filho instanceof Node ? filho : document.createTextNode(String(filho)));
  }
  return el;
}

class ApiError extends Error {
  constructor(status, dados) {
    super(mensagemDe(dados));
    this.status = status;
  }
}

function mensagemDe(dados) {
  const erro = dados && dados.error;
  if (!erro) return "Erro inesperado. Tente novamente.";
  const detalhes = Array.isArray(erro.details) ? erro.details.map((d) => `${d.campo}: ${d.erro}`).join("; ") : "";
  return detalhes ? `${erro.message} (${detalhes})` : erro.message;
}

function lerJson(texto) {
  try {
    return texto ? JSON.parse(texto) : null;
  } catch {
    return null;
  }
}

async function api(caminho, { method = "GET", body, form } = {}) {
  const headers = {};
  if (state.token) headers.Authorization = `Bearer ${state.token}`;
  let corpo;
  if (form) {
    corpo = form;
  } else if (body) {
    headers["Content-Type"] = "application/json";
    corpo = JSON.stringify(body);
  }
  const resposta = await fetch(`/api/v1${caminho}`, { method, headers, body: corpo });
  const dados = lerJson(await resposta.text());
  if (!resposta.ok) {
    if (resposta.status === 401 && state.token) {
      limparSessao();
      renderAuthArea();
      toast("Sessão expirada. Entre novamente.", "erro");
    }
    throw new ApiError(resposta.status, dados);
  }
  return dados;
}

function toast(mensagem, tipo = "") {
  const aviso = h("div", { class: `toast ${tipo}` }, mensagem);
  document.getElementById("toasts").append(aviso);
  setTimeout(() => aviso.remove(), 4500);
}

function moeda(valor) {
  return Number(valor).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function imagemSegura(url) {
  return typeof url === "string" && url.startsWith("/uploads/") ? url : null;
}

function miniatura(url, nome, classe) {
  const src = imagemSegura(url);
  if (src) return h("img", { class: classe, src, alt: `Foto de ${nome}`, loading: "lazy" });
  return h("div", { class: `${classe} sem-imagem`, "aria-hidden": "true" }, (nome || "?").trim().charAt(0).toUpperCase());
}

function inputArquivo(aoEscolher) {
  return h("input", {
    type: "file",
    accept: TIPOS_IMAGEM.join(","),
    hidden: true,
    onchange: (ev) => {
      const arquivo = ev.target.files[0];
      ev.target.value = "";
      if (arquivo) aoEscolher(arquivo);
    }
  });
}

async function enviarFoto(caminho, arquivo, depois) {
  if (!TIPOS_IMAGEM.includes(arquivo.type)) return toast("Use uma imagem PNG, JPG ou WEBP.", "erro");
  if (arquivo.size > LIMITE_BYTES) return toast("A imagem deve ter no máximo 5 MB.", "erro");
  const form = new FormData();
  form.append("image", arquivo);
  try {
    toast("Enviando imagem...");
    await api(caminho, { method: "POST", form });
    toast("Foto atualizada!", "ok");
    await depois();
  } catch (erro) {
    toast(erro.message, "erro");
  }
}

function limparSessao() {
  state.token = null;
  state.perfil = null;
  sessionStorage.removeItem(CHAVE_TOKEN);
}

async function carregarPerfil() {
  if (!state.token) {
    state.perfil = null;
    return;
  }
  try {
    const resposta = await api("/auth/me");
    state.perfil = resposta.perfil;
  } catch {
    limparSessao();
  }
}

function renderAuthArea() {
  const area = document.getElementById("auth-area");
  if (state.token && state.perfil) {
    area.replaceChildren(
      miniatura(state.perfil.imageUrl, state.perfil.name, "avatar"),
      h("span", { class: "meta" }, state.perfil.name),
      h("button", { type: "button", class: "sec", onclick: sair }, "Sair")
    );
    return;
  }
  area.replaceChildren(
    h("button", { type: "button", class: "sec", onclick: () => abrirAuth("login") }, "Entrar"),
    h("button", { type: "button", onclick: () => abrirAuth("registro") }, "Criar conta")
  );
}

function sair() {
  limparSessao();
  renderAuthArea();
  toast("Você saiu.");
  rotear();
}

function abrirAuth(modo) {
  state.modoAuth = modo;
  const registro = modo === "registro";
  document.getElementById("auth-titulo").textContent = registro ? "Criar conta" : "Entrar";
  document.getElementById("auth-enviar").textContent = registro ? "Cadastrar" : "Entrar";
  document.getElementById("auth-alternar").textContent = registro ? "Já tenho conta" : "Criar uma conta";
  document.getElementById("campo-nome").hidden = !registro;
  document.getElementById("auth-dica").hidden = !registro;
  document.getElementById("auth-erro").textContent = "";
  formAuth.querySelector("[name=password]").setAttribute("autocomplete", registro ? "new-password" : "current-password");
  if (typeof dialogo.showModal === "function") dialogo.showModal();
  else dialogo.setAttribute("open", "");
}

function fecharAuth() {
  if (typeof dialogo.close === "function") dialogo.close();
  else dialogo.removeAttribute("open");
}

async function enviarAuth(ev) {
  ev.preventDefault();
  const dados = new FormData(formAuth);
  const email = String(dados.get("email") || "").trim();
  const password = String(dados.get("password") || "");
  const erro = document.getElementById("auth-erro");
  const botao = document.getElementById("auth-enviar");
  erro.textContent = "";
  botao.disabled = true;
  try {
    if (state.modoAuth === "registro") {
      await api("/auth/register", { method: "POST", body: { name: String(dados.get("name") || "").trim(), email, password } });
    }
    const login = await api("/auth/login", { method: "POST", body: { email, password } });
    state.token = login.tokens.accessToken;
    sessionStorage.setItem(CHAVE_TOKEN, state.token);
    await carregarPerfil();
    formAuth.reset();
    fecharAuth();
    renderAuthArea();
    toast(`Olá, ${state.perfil ? state.perfil.name : "bem-vindo"}!`, "ok");
    rotear();
  } catch (e) {
    erro.textContent = e.message;
  } finally {
    botao.disabled = false;
  }
}

function telaErro(erro) {
  view.replaceChildren(h("p", { class: "erro" }, erro.message), h("a", { href: "#/" }, "Voltar aos restaurantes"));
}

function formRestaurante() {
  const nome = h("input", { name: "name", required: true, maxlength: "120", placeholder: "Ex.: Cantina da Nona" });
  const categoria = h("select", { name: "category" }, CATEGORIAS.map((c) => h("option", { value: c }, c)));
  const nota = h("input", { name: "rating", type: "number", min: "0", max: "5", step: "0.1", value: "0" });
  return h(
    "form",
    {
      class: "painel",
      onsubmit: async (ev) => {
        ev.preventDefault();
        try {
          await api("/restaurants", { method: "POST", body: { name: nome.value.trim(), category: categoria.value, rating: Number(nota.value) } });
          toast("Restaurante cadastrado!", "ok");
          state.paginaRestaurantes = 1;
          telaRestaurantes();
        } catch (erro) {
          toast(erro.message, "erro");
        }
      }
    },
    h("h3", {}, "Novo restaurante"),
    h("label", {}, "Nome", nome),
    h("label", {}, "Categoria", categoria),
    h("label", {}, "Nota (0 a 5)", nota),
    h("button", { type: "submit" }, "Cadastrar restaurante")
  );
}

function cartaoRestaurante(restaurante) {
  const seletor = inputArquivo((arquivo) => enviarFoto(`/restaurants/${restaurante.id}/image`, arquivo, () => telaRestaurantes()));
  return h(
    "article",
    { class: "cartao" },
    miniatura(restaurante.imageUrl, restaurante.name, "capa"),
    h(
      "div",
      { class: "corpo" },
      h("h3", {}, restaurante.name),
      h("p", { class: "meta" }, h("span", { class: "chip" }, restaurante.category), `★ ${Number(restaurante.rating).toFixed(1)}`),
      h(
        "div",
        { class: "acoes" },
        h("a", { class: "botao", href: `#/restaurante/${restaurante.id}` }, "Ver cardápio"),
        state.token && h("button", { type: "button", class: "sec", onclick: () => seletor.click() }, "Trocar foto"),
        seletor
      )
    )
  );
}

async function telaRestaurantes() {
  view.replaceChildren(h("p", { class: "carregando" }, "Carregando restaurantes..."));
  try {
    const resposta = await api(`/restaurants?pagina=${state.paginaRestaurantes}&limite=9`);
    const { pagina, totalPaginas, total } = resposta.paginacao;
    view.replaceChildren(
      h("div", { class: "cabecalho-secao" }, h("h1", {}, "Restaurantes"), h("span", { class: "meta" }, `${total} cadastrado(s)`)),
      state.token ? formRestaurante() : h("p", { class: "aviso" }, "Entre para cadastrar restaurantes e pratos."),
      resposta.dados.length ? h("div", { class: "grade" }, resposta.dados.map(cartaoRestaurante)) : h("p", { class: "vazio" }, "Nenhum restaurante cadastrado ainda."),
      totalPaginas > 1 &&
        h(
          "div",
          { class: "paginacao" },
          h("button", { type: "button", class: "sec", disabled: !resposta.paginacao.temAnterior, onclick: () => { state.paginaRestaurantes = pagina - 1; telaRestaurantes(); } }, "Anterior"),
          h("span", { class: "meta" }, `Página ${pagina} de ${totalPaginas}`),
          h("button", { type: "button", class: "sec", disabled: !resposta.paginacao.temProxima, onclick: () => { state.paginaRestaurantes = pagina + 1; telaRestaurantes(); } }, "Próxima")
        )
    );
  } catch (erro) {
    telaErro(erro);
  }
}

function formPrato(restauranteId) {
  const nome = h("input", { name: "name", required: true, maxlength: "120", placeholder: "Ex.: Lasanha à bolonhesa" });
  const preco = h("input", { name: "price", type: "number", min: "0.01", step: "0.01", required: true, placeholder: "0,00" });
  const descricao = h("textarea", { name: "description", maxlength: "500", placeholder: "Ingredientes, porção..." });
  return h(
    "form",
    {
      class: "painel",
      onsubmit: async (ev) => {
        ev.preventDefault();
        const corpo = { name: nome.value.trim(), price: Number(preco.value) };
        if (descricao.value.trim()) corpo.description = descricao.value.trim();
        try {
          await api(`/restaurants/${restauranteId}/dishes`, { method: "POST", body: corpo });
          toast("Prato cadastrado!", "ok");
          telaCardapio(restauranteId);
        } catch (erro) {
          toast(erro.message, "erro");
        }
      }
    },
    h("h3", {}, "Novo prato"),
    h("label", {}, "Nome", nome),
    h("label", {}, "Preço (R$)", preco),
    h("label", { class: "largo" }, "Descrição (opcional)", descricao),
    h("button", { type: "submit" }, "Cadastrar prato")
  );
}

function cartaoPrato(prato, restauranteId) {
  const seletor = inputArquivo((arquivo) => enviarFoto(`/dishes/${prato.id}/image`, arquivo, () => telaCardapio(restauranteId)));
  return h(
    "article",
    { class: "cartao" },
    miniatura(prato.imageUrl, prato.name, "capa"),
    h(
      "div",
      { class: "corpo" },
      h("h3", {}, prato.name),
      h("p", { class: "preco" }, moeda(prato.price)),
      prato.description && h("p", { class: "descricao" }, prato.description),
      !prato.available && h("p", { class: "meta" }, h("span", { class: "chip alerta" }, "Indisponível")),
      state.token && h("div", { class: "acoes" }, h("button", { type: "button", class: "sec", onclick: () => seletor.click() }, prato.imageUrl ? "Trocar foto" : "Enviar foto"), seletor)
    )
  );
}

async function telaCardapio(restauranteId) {
  view.replaceChildren(h("p", { class: "carregando" }, "Carregando cardápio..."));
  try {
    const [restaurante, cardapio] = await Promise.all([api(`/restaurants/${restauranteId}`), api(`/restaurants/${restauranteId}/dishes?limite=50`)]);
    view.replaceChildren(
      h("a", { href: "#/", class: "voltar" }, "← Restaurantes"),
      h(
        "div",
        { class: "restaurante-topo" },
        miniatura(restaurante.imageUrl, restaurante.name, "capa"),
        h("div", {}, h("h1", {}, restaurante.name), h("p", { class: "meta" }, h("span", { class: "chip" }, restaurante.category), `★ ${Number(restaurante.rating).toFixed(1)}`))
      ),
      state.token ? formPrato(restauranteId) : h("p", { class: "aviso" }, "Entre para cadastrar pratos."),
      h("h2", {}, `Cardápio (${cardapio.paginacao.total})`),
      cardapio.dados.length ? h("div", { class: "grade" }, cardapio.dados.map((p) => cartaoPrato(p, restauranteId))) : h("p", { class: "vazio" }, "Nenhum prato cadastrado ainda.")
    );
  } catch (erro) {
    telaErro(erro);
  }
}

async function telaPerfil() {
  if (!state.token) {
    view.replaceChildren(h("p", { class: "aviso" }, "Entre para ver e editar o seu perfil."), h("button", { type: "button", onclick: () => abrirAuth("login") }, "Entrar"));
    return;
  }
  await carregarPerfil();
  if (!state.perfil) {
    renderAuthArea();
    view.replaceChildren(h("p", { class: "aviso" }, "Sessão expirada. Entre novamente."), h("button", { type: "button", onclick: () => abrirAuth("login") }, "Entrar"));
    return;
  }
  const perfil = state.perfil;
  const seletor = inputArquivo((arquivo) =>
    enviarFoto("/auth/me/image", arquivo, async () => {
      await carregarPerfil();
      renderAuthArea();
      telaPerfil();
    })
  );
  view.replaceChildren(
    h(
      "section",
      { class: "perfil" },
      miniatura(perfil.imageUrl, perfil.name, "avatar-grande"),
      h(
        "div",
        {},
        h("h1", {}, perfil.name),
        h("p", { class: "meta" }, perfil.email),
        h("p", { class: "meta" }, `Papel: ${perfil.role}`),
        h("div", { class: "acoes" }, h("button", { type: "button", onclick: () => seletor.click() }, "Trocar foto de perfil"), seletor)
      )
    )
  );
}

function rotear() {
  const rota = location.hash || "#/";
  document.querySelectorAll("[data-nav]").forEach((link) => {
    const ativo = (link.dataset.nav === "perfil" && rota === "#/perfil") || (link.dataset.nav === "home" && rota !== "#/perfil");
    link.classList.toggle("ativo", ativo);
  });
  const cardapio = rota.match(/^#\/restaurante\/(\d+)$/);
  if (cardapio) return telaCardapio(Number(cardapio[1]));
  if (rota === "#/perfil") return telaPerfil();
  return telaRestaurantes();
}

async function iniciar() {
  formAuth.addEventListener("submit", enviarAuth);
  document.getElementById("auth-cancelar").addEventListener("click", fecharAuth);
  document.getElementById("auth-alternar").addEventListener("click", () => abrirAuth(state.modoAuth === "login" ? "registro" : "login"));
  await carregarPerfil();
  renderAuthArea();
  window.addEventListener("hashchange", rotear);
  rotear();
}

iniciar();
