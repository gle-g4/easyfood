const path = require("path");
const sharp = require("sharp");

process.env.DATABASE_URL ||= "postgresql://u:p@localhost:5432/db";
process.env.AUTH_PROVIDER ||= "local";
process.env.JWT_SECRET ||= "segredo-so-para-o-smoke-test";
process.env.STORAGE_DIR = require("fs").mkdtempSync(require("path").join(require("os").tmpdir(), "easyfood-smoke-"));
process.env.FAAS_COLD_START_MS = "30";
process.env.EMAIL_PROVIDER = "console";
process.env.EMAIL_TO_TEST = "teste@easyfood.dev";
process.env.RATE_LIMIT_REGISTER ||= "50";

const db = { restaurants: [], users: [], dishes: [], seq: { r: 0, u: 0, d: 0 } };

function filtrar(lista, where = {}) {
  return lista.filter((item) =>
    Object.entries(where).every(([campo, cond]) => {
      if (cond === undefined) return true;
      const valor = item[campo];
      if (cond && typeof cond === "object") {
        if ("equals" in cond) {
          return String(valor).toLowerCase() === String(cond.equals).toLowerCase();
        }
        if ("contains" in cond) {
          return String(valor).toLowerCase().includes(String(cond.contains).toLowerCase());
        }
        if ("gte" in cond) return valor >= cond.gte;
        return true;
      }
      return valor === cond;
    })
  );
}

const prismaFake = {
  restaurant: {
    async count({ where }) {
      return filtrar(db.restaurants, where).length;
    },
    async findMany({ where, skip = 0, take = 10 }) {
      return filtrar(db.restaurants, where)
        .sort((a, b) => b.rating - a.rating || a.name.localeCompare(b.name))
        .slice(skip, skip + take);
    },
    async findFirst({ where }) {
      return filtrar(db.restaurants, where)[0] || null;
    },
    async create({ data }) {
      const novo = {
        id: ++db.seq.r,
        active: true,
        deletedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        rating: 0,
        ...data
      };
      db.restaurants.push(novo);
      return novo;
    },
    async update({ where, data }) {
      const alvo = db.restaurants.find((r) => r.id === where.id);
      Object.assign(alvo, data, { updatedAt: new Date() });
      return alvo;
    }
  },
  dish: {
    async count({ where }) {
      return filtrar(db.dishes, where).length;
    },
    async findMany({ where, skip = 0, take = 10 }) {
      return filtrar(db.dishes, where).slice(skip, skip + take);
    },
    async findFirst({ where }) {
      return filtrar(db.dishes, where)[0] || null;
    },
    async create({ data }) {
      const novo = { id: ++db.seq.d, active: true, available: true, imageUrl: null, imageStatus: null, createdAt: new Date(), ...data };
      db.dishes.push(novo);
      return novo;
    },
    async update({ where, data }) {
      const alvo = db.dishes.find((d) => d.id === where.id);
      Object.assign(alvo, data);
      return alvo;
    }
  },
  user: {
    async update({ where, data }) {
      const alvo = db.users.find((u) => u.id === where.id);
      Object.assign(alvo, data);
      return alvo;
    },
    async findUnique({ where }) {
      return db.users.find((u) => u.email === where.email) || null;
    },
    async findFirst({ where }) {
      return db.users.find((u) => u.externalId === where.externalId) || null;
    },
    async create({ data }) {
      const novo = { id: ++db.seq.u, role: "customer", ...data };
      db.users.push(novo);
      return novo;
    },
    async upsert({ where, update, create }) {
      const existente = db.users.find((u) => u.email === where.email);
      if (existente) return Object.assign(existente, update);
      const novo = { id: ++db.seq.u, role: "customer", ...create };
      db.users.push(novo);
      return novo;
    },
    async updateMany({ where, data }) {
      const alvos = db.users.filter((u) => u.email === where.email);
      alvos.forEach((u) => Object.assign(u, data));
      return { count: alvos.length };
    }
  },
  async $transaction(promises) {
    return Promise.all(promises);
  },
  async $queryRaw() {
    return [{ "?column?": 1 }];
  },
  async $disconnect() {}
};

const caminhoPrisma = require.resolve(
  path.join(__dirname, "../src/database/prisma.js")
);
require.cache[caminhoPrisma] = {
  id: caminhoPrisma,
  filename: caminhoPrisma,
  loaded: true,
  exports: prismaFake
};

const emailService = require("../src/modules/shared/email.service");
const { env } = require("../src/config/env");
const emailsEnviados = [];
const sendEmailOriginal = emailService.sendEmail;
emailService.sendEmail = async (dados) => {
  const resultado = await sendEmailOriginal(dados);
  emailsEnviados.push(dados);
  return resultado;
};

const app = require("../src/app");

let servidor;
let base;
let passou = 0;
let falhou = 0;

async function req(metodo, caminho, { body, token } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;

  const resposta = await fetch(base + caminho, {
    method: metodo,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });

  const texto = await resposta.text();
  let json = null;
  try {
    json = texto ? JSON.parse(texto) : null;
  } catch {
    json = texto;
  }

  return { status: resposta.status, body: json, headers: resposta.headers };
}

async function enviarArquivo(caminho, buffer, { token, nome = "foto.png", tipo = "image/png" } = {}) {
  const form = new FormData();
  form.append("image", new Blob([buffer], { type: tipo }), nome);
  const resposta = await fetch(base + caminho, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form
  });
  const texto = await resposta.text();
  let json = null;
  try { json = texto ? JSON.parse(texto) : null; } catch { json = texto; }
  return { status: resposta.status, body: json };
}

function checar(descricao, condicao, extra = "") {
  if (condicao) {
    passou++;
    console.log(`  \x1b[32m✓\x1b[0m ${descricao}`);
  } else {
    falhou++;
    console.log(`  \x1b[31m✗\x1b[0m ${descricao} ${extra}`);
  }
}

async function main() {
  await new Promise((resolve) => {
    servidor = app.listen(0, resolve);
  });
  base = `http://127.0.0.1:${servidor.address().port}`;

  console.log("\n\x1b[1mEasyFood — teste de fumaça\x1b[0m\n");

  console.log("Health checks");
  let r = await req("GET", "/health/live");
  checar("GET /health/live responde 200", r.status === 200, `(deu ${r.status})`);
  r = await req("GET", "/health/ready");
  checar("GET /health/ready acusa banco OK", r.body?.checagens?.database?.status === "ok");

  console.log("\nValidação de entrada (Zod)");
  r = await req("POST", "/api/v1/auth/register", {
    body: { name: "A", email: "nao-e-email", password: "123" }
  });
  checar("rejeita cadastro inválido com 400", r.status === 400, `(deu ${r.status})`);
  checar("retorna detalhes por campo", Array.isArray(r.body?.error?.details));
  checar("inclui requestId no erro", Boolean(r.body?.error?.requestId));

  r = await req("POST", "/api/v1/auth/register", {
    body: { name: "Gleice", email: "gleice@easyfood.dev", password: "senhafraca" }
  });
  checar("exige senha com maiúscula e número", r.status === 400);

  console.log("\nCadastro e login (provider local)");
  r = await req("POST", "/api/v1/auth/register", {
    body: { name: "Gleice", email: "gleice@easyfood.dev", password: "SenhaForte1" }
  });
  checar("cadastro válido retorna 201", r.status === 201, `(deu ${r.status})`);
  checar("não devolve a senha na resposta", !JSON.stringify(r.body).includes("SenhaForte1"));

  r = await req("POST", "/api/v1/auth/register", {
    body: { name: "Outra", email: "gleice@easyfood.dev", password: "SenhaForte1" }
  });
  checar("e-mail duplicado retorna 409", r.status === 409, `(deu ${r.status})`);

  r = await req("POST", "/api/v1/auth/login", {
    body: { email: "gleice@easyfood.dev", password: "SenhaErrada1" }
  });
  checar("senha errada retorna 401", r.status === 401, `(deu ${r.status})`);

  r = await req("POST", "/api/v1/auth/login", {
    body: { email: "gleice@easyfood.dev", password: "SenhaForte1" }
  });
  checar("login correto retorna 200", r.status === 200, `(deu ${r.status})`);
  const token = r.body?.tokens?.accessToken;
  checar("devolve accessToken", Boolean(token));

  r = await req("GET", "/api/v1/auth/me", { token });
  checar("GET /auth/me com token retorna 200", r.status === 200, `(deu ${r.status})`);
  r = await req("GET", "/api/v1/auth/me");
  checar("GET /auth/me sem token retorna 401", r.status === 401, `(deu ${r.status})`);

  console.log("\nRestaurantes — proteção e regras");
  r = await req("POST", "/api/v1/restaurants", {
    body: { name: "Cantina Roma", category: "Italiana", rating: 4.5 }
  });
  checar("criar sem token retorna 401", r.status === 401, `(deu ${r.status})`);

  r = await req("POST", "/api/v1/restaurants", {
    token,
    body: { name: "Cantina Roma", category: "Inexistente", rating: 4.5 }
  });
  checar("categoria fora da lista retorna 400", r.status === 400, `(deu ${r.status})`);

  r = await req("POST", "/api/v1/restaurants", {
    token,
    body: { name: "Cantina Roma", category: "Italiana", rating: 4.5 }
  });
  checar("criar com token retorna 201", r.status === 201, `(deu ${r.status})`);
  checar("envia header Location", Boolean(r.headers.get("location")));

  r = await req("POST", "/api/v1/restaurants", {
    token,
    body: { name: "cantina roma", category: "Italiana", rating: 3 }
  });
  checar("nome duplicado (case-insensitive) retorna 409", r.status === 409, `(deu ${r.status})`);

  r = await req("POST", "/api/v1/restaurants", {
    token,
    body: { name: "Sushi Zen", category: "Japonesa", rating: 4.9 }
  });
  checar("segundo restaurante criado", r.status === 201);

  console.log("\nE-mail (ação secundária)");
  await new Promise((resolve) => setTimeout(resolve, 100));
  checar("cadastro disparou 2 e-mails (boas-vindas + comercial)", emailsEnviados.length === 4, `(enviados: ${emailsEnviados.length})`);
  checar("a mesma sendEmail() enviou conteúdos diferentes", new Set(emailsEnviados.map((e) => e.subject)).size >= 2);

  const antes = emailsEnviados.length;
  env.email.simulateFailure = true;
  r = await req("POST", "/api/v1/restaurants", {
    token,
    body: { name: "Pizzaria Falha", category: "Italiana", rating: 4 }
  });
  env.email.simulateFailure = false;
  await new Promise((resolve) => setTimeout(resolve, 100));
  checar("e-mail falhando NÃO impede o cadastro (201)", r.status === 201, `(deu ${r.status})`);
  checar("nenhum e-mail saiu durante a falha", emailsEnviados.length === antes);
  r = await req("GET", "/api/v1/restaurants?busca=Pizzaria");
  checar("restaurante continua salvo após a falha do e-mail", r.body?.paginacao?.total === 1);

  r = await req("POST", "/api/v1/restaurants", {
    token,
    body: { name: "<b>Hack</b>", category: "Outra", rating: 1 }
  });
  await new Promise((resolve) => setTimeout(resolve, 100));
  const comercial = emailsEnviados.filter((e) => e.toName === "Comercial EasyFood").pop();
  checar("HTML de usuário é escapado no corpo do e-mail", comercial && !comercial.body.includes("<b>Hack</b>") && comercial.body.includes("&lt;b&gt;"));

  console.log("\nListagem paginada e filtros");
  r = await req("GET", "/api/v1/restaurants");
  checar("GET público retorna 200 sem token", r.status === 200, `(deu ${r.status})`);
  checar("resposta traz metadados de paginação", r.body?.paginacao?.total === 4);
  checar("ordena por nota (Sushi Zen primeiro)", r.body?.dados?.[0]?.name === "Sushi Zen");

  r = await req("GET", "/api/v1/restaurants?categoria=Japonesa");
  checar("filtra por categoria", r.body?.paginacao?.total === 1);

  r = await req("GET", "/api/v1/restaurants?busca=cantina");
  checar("busca parcial por nome funciona", r.body?.paginacao?.total === 1);

  r = await req("GET", "/api/v1/restaurants?limite=1&pagina=2");
  checar("paginação respeita limite/página", r.body?.dados?.length === 1 && r.body?.paginacao?.temAnterior === true);

  r = await req("GET", "/api/v1/restaurants?limite=99999");
  checar("limite acima do teto é rejeitado", r.status === 400, `(deu ${r.status})`);

  console.log("\nAutorização por papel (RBAC)");
  r = await req("DELETE", "/api/v1/restaurants/1", { token });
  checar("usuário comum não pode excluir (403)", r.status === 403, `(deu ${r.status})`);

  console.log("\nPratos (criação corrigida)");
  r = await req("GET", "/api/v1/restaurants?busca=Sushi");
  const restauranteId = r.body.dados[0].id;

  r = await req("POST", "/api/v1/dishes", { body: { restaurantId: restauranteId, name: "Combinado", price: 59.9 } });
  checar("criar prato sem login retorna 401", r.status === 401, `(deu ${r.status})`);

  r = await req("POST", "/api/v1/dishes", { token, body: { restaurantId: 99999, name: "Fantasma", price: 10 } });
  checar("restaurante inexistente retorna 404 (antes estourava a FK)", r.status === 404, `(deu ${r.status})`);

  r = await req("POST", "/api/v1/dishes", { token, body: { restaurantId: restauranteId, name: "Combinado", price: -5 } });
  checar("preço negativo retorna 400", r.status === 400, `(deu ${r.status})`);

  r = await req("POST", "/api/v1/dishes", { token, body: { restaurantId: restauranteId, name: "Combinado", price: "abc" } });
  checar("preço não numérico retorna 400", r.status === 400, `(deu ${r.status})`);

  r = await req("POST", "/api/v1/dishes", { token, body: { restaurantId: restauranteId, name: "Combinado", price: "59.909", description: "20 peças" } });
  checar("criar prato válido retorna 201", r.status === 201, `(deu ${r.status})`);
  checar("preço é número com 2 casas (59.91)", r.body?.price === 59.91, `(deu ${JSON.stringify(r.body?.price)})`);
  const pratoId = r.body?.id;

  r = await req("POST", "/api/v1/dishes", { token, body: { restaurantId: restauranteId, name: "combinado", price: 10 } });
  checar("nome duplicado no mesmo restaurante retorna 409", r.status === 409, `(deu ${r.status})`);

  r = await req("GET", `/api/v1/dishes?restaurantId=${restauranteId}`);
  checar("lista os pratos do restaurante (público)", r.status === 200 && r.body?.paginacao?.total === 1);

  r = await req("PATCH", `/api/v1/dishes/${pratoId}`, { token, body: { price: 64 } });
  checar("atualiza o preço do prato", r.status === 200 && r.body?.price === 64);

  console.log("\nPratos aninhados no restaurante");
  r = await req("POST", `/api/v1/restaurants/${restauranteId}/dishes`, { body: { name: "Sashimi", price: 42 } });
  checar("POST /restaurants/:id/dishes sem login retorna 401", r.status === 401, `(deu ${r.status})`);
  r = await req("POST", "/api/v1/restaurants/99999/dishes", { token, body: { name: "Sashimi", price: 42 } });
  checar("POST em restaurante inexistente retorna 404", r.status === 404, `(deu ${r.status})`);
  r = await req("POST", `/api/v1/restaurants/${restauranteId}/dishes`, { token, body: { name: "Sashimi", price: 42 } });
  checar("POST /restaurants/:id/dishes retorna 201 e associa ao restaurante", r.status === 201 && r.body?.restaurantId === restauranteId, `(deu ${r.status})`);
  const pratoAninhadoId = r.body?.id;
  r = await req("GET", `/api/v1/restaurants/${restauranteId}/dishes`);
  checar("GET /restaurants/:id/dishes lista o cardápio", r.status === 200 && r.body?.paginacao?.total === 2, `(deu ${r.status})`);
  r = await req("GET", "/api/v1/restaurants/99999/dishes");
  checar("cardápio de restaurante inexistente retorna 404", r.status === 404, `(deu ${r.status})`);

  console.log("\nImagens (image.service compartilhado)");
  const foto = await sharp({ create: { width: 1600, height: 1200, channels: 3, background: "#c33" } }).png().toBuffer();
  const grande = Buffer.alloc(5 * 1024 * 1024 + 10);
  const naoImagem = Buffer.from("nao sou imagem");

  async function conferirArquivo(url) {
    const img = await fetch(base + url);
    const bytes = Buffer.from(await img.arrayBuffer());
    const meta = img.status === 200 ? await sharp(bytes).metadata() : {};
    return { status: img.status, formato: meta.format, largura: meta.width };
  }

  r = await enviarArquivo("/api/v1/auth/me/image", foto);
  checar("foto de perfil sem JWT retorna 401", r.status === 401, `(deu ${r.status})`);
  r = await enviarArquivo("/api/v1/auth/me/image", naoImagem, { token });
  checar("perfil: arquivo que não é imagem retorna 400", r.status === 400, `(deu ${r.status})`);
  r = await enviarArquivo("/api/v1/auth/me/image", grande, { token });
  checar("perfil: arquivo acima de 5 MB retorna 413", r.status === 413, `(deu ${r.status})`);
  r = await enviarArquivo("/api/v1/auth/me/image", foto, { token });
  const urlPerfil = r.body?.perfil?.imageUrl;
  checar("foto de perfil do usuário autenticado retorna 200 com imageUrl", r.status === 200 && Boolean(urlPerfil?.endsWith(".webp")), `(deu ${r.status})`);
  r = await req("GET", "/api/v1/auth/me", { token });
  checar("GET /auth/me devolve o caminho da imagem", r.body?.perfil?.imageUrl === urlPerfil);
  let arq = await conferirArquivo(urlPerfil);
  checar("URL da imagem de perfil exibe WebP otimizado (800px)", arq.status === 200 && arq.formato === "webp" && arq.largura === 800, `(${arq.status} ${arq.formato} ${arq.largura})`);
  r = await enviarArquivo("/api/v1/auth/me/image", foto, { token });
  const urlPerfilNova = r.body?.perfil?.imageUrl;
  arq = await conferirArquivo(urlPerfil);
  checar("trocar a foto remove o arquivo antigo do disco", urlPerfilNova !== urlPerfil && arq.status === 404, `(${arq.status})`);

  r = await enviarArquivo(`/api/v1/dishes/${pratoId}/image`, foto);
  checar("foto de prato sem JWT retorna 401", r.status === 401, `(deu ${r.status})`);
  r = await enviarArquivo("/api/v1/dishes/99999/image", foto, { token });
  checar("foto para prato inexistente retorna 404", r.status === 404, `(deu ${r.status})`);
  r = await enviarArquivo(`/api/v1/dishes/${pratoId}/image`, naoImagem, { token });
  checar("prato: arquivo inválido retorna 400", r.status === 400, `(deu ${r.status})`);
  r = await enviarArquivo(`/api/v1/dishes/${pratoId}/image`, foto, { token });
  checar("foto do prato retorna 200 com imageUrl", r.status === 200 && Boolean(r.body?.imageUrl?.endsWith(".webp")), `(deu ${r.status})`);
  r = await req("GET", `/api/v1/restaurants/${restauranteId}/dishes`);
  checar("cardápio retorna a imagem associada ao prato", r.body?.dados?.some((d) => d.id === pratoId && d.imageUrl));
  checar("prato sem foto continua com imageUrl vazio", r.body?.dados?.find((d) => d.id === pratoAninhadoId)?.imageUrl == null);

  r = await enviarArquivo(`/api/v1/restaurants/${restauranteId}/image`, foto);
  checar("foto de restaurante sem JWT retorna 401", r.status === 401, `(deu ${r.status})`);
  r = await enviarArquivo(`/api/v1/restaurants/${restauranteId}/image`, foto, { token });
  checar("foto do restaurante retorna 200 com imageUrl (mesmo image.service)", r.status === 200 && Boolean(r.body?.imageUrl?.endsWith(".webp")), `(deu ${r.status})`);

  console.log("\nRotas e compatibilidade");
  r = await req("GET", "/restaurants");
  checar("caminho antigo /restaurants ainda funciona", r.status === 200);
  r = await req("GET", "/rota-que-nao-existe");
  checar("rota inexistente retorna 404 padronizado", r.status === 404 && r.body?.error?.code === "ROUTE_NOT_FOUND");
  checar("header x-request-id presente", Boolean(r.headers.get("x-request-id")));

  console.log("\nRate limiting");
  let bloqueado = false;
  for (let i = 0; i < 8; i++) {
    const t = await req("POST", "/api/v1/auth/login", {
      body: { email: "gleice@easyfood.dev", password: "SenhaErrada1" }
    });
    if (t.status === 429) bloqueado = true;
  }
  checar("bloqueia após tentativas excessivas (429)", bloqueado);

  console.log(
    `\n\x1b[1mResultado:\x1b[0m \x1b[32m${passou} passaram\x1b[0m` +
      (falhou ? `, \x1b[31m${falhou} falharam\x1b[0m` : "") +
      "\n"
  );

  servidor.close();
  process.exit(falhou ? 1 : 0);
}

main().catch((erro) => {
  console.error("Falha no teste:", erro);
  if (servidor) servidor.close();
  process.exit(1);
});
