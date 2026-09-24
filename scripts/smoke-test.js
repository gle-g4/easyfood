/**
 * Teste de fumaça (smoke test) — valida o fluxo principal da API sem
 * precisar de um PostgreSQL real.
 *
 * DIFERENCIAL: repare que só foi possível escrever este teste porque a
 * camada Database está isolada. Substituímos o Prisma por um fake em
 * memória e NENHUMA outra linha do projeto precisou mudar. É exatamente
 * o benefício que a arquitetura em camadas promete.
 *
 * Uso:  npm run smoke
 */

const path = require("path");

// ---- Banco fake em memória, injetado no lugar do Prisma ----
const db = { restaurants: [], users: [], seq: { r: 0, u: 0 } };

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
  user: {
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

// Injeta o fake ANTES de a aplicação carregar o módulo real.
const caminhoPrisma = require.resolve(
  path.join(__dirname, "../src/database/prisma.js")
);
require.cache[caminhoPrisma] = {
  id: caminhoPrisma,
  filename: caminhoPrisma,
  loaded: true,
  exports: prismaFake
};

const app = require("../src/app");

// ---- Mini utilitário de teste ----
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

  console.log("\nListagem paginada e filtros");
  r = await req("GET", "/api/v1/restaurants");
  checar("GET público retorna 200 sem token", r.status === 200, `(deu ${r.status})`);
  checar("resposta traz metadados de paginação", r.body?.paginacao?.total === 2);
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
