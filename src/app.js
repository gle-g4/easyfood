const express = require("express");
const cors = require("cors");
const path = require("path");

const { env } = require("./config/env");
const requestContext = require("./shared/middlewares/requestContext");
const {
  errorHandler,
  notFoundHandler
} = require("./shared/middlewares/errorHandler");

const restaurantRoutes = require("./modules/restaurants/restaurant.routes");
const authRoutes = require("./modules/auth/auth.routes");
const healthRoutes = require("./modules/health/health.routes");

const app = express();

/**
 * A ORDEM DOS MIDDLEWARES IMPORTA — e está comentada de propósito,
 * porque é uma das principais fontes de bug silencioso em Express.
 */

// 1. Confia no proxy (Render, Railway, ALB) para que req.ip seja o IP real
//    do cliente, e não o do balanceador. Sem isso, o rate limiter trataria
//    TODOS os usuários como um único IP.
app.set("trust proxy", 1);

// 2. Remove o header que anuncia "estou rodando Express" — não entregar
//    a pilha de tecnologia de graça é higiene básica de segurança.
app.disable("x-powered-by");

// 3. Contexto da requisição (id + métricas) primeiro, para que TODO log
//    posterior, inclusive de erro, já tenha o requestId.
app.use(requestContext);

// 4. CORS restrito por configuração, em vez de liberar para o mundo.
app.use(
  cors({
    origin: env.corsOrigins.length ? env.corsOrigins : true,
    credentials: true,
    exposedHeaders: ["x-request-id", "Location"]
  })
);

// 5. Limite explícito de payload: protege contra requisições gigantes
//    usadas para esgotar memória.
app.use(express.json({ limit: "100kb" }));

app.use(express.static(path.join(__dirname, "../public")));

// ROTAS
app.use("/health", healthRoutes);

/**
 * DIFERENCIAL: API VERSIONADA (/api/v1).
 *
 * Um dia a EasyFood vai precisar mudar um contrato de forma incompatível.
 * Com versão no caminho, /v1 continua servindo os clientes antigos
 * enquanto /v2 evolui. Sem versão, toda mudança vira quebra.
 *
 * Os caminhos antigos seguem montados para não quebrar nada que já existe
 * (compatibilidade retroativa consciente).
 */
const v1 = express.Router();
v1.use("/auth", authRoutes);
v1.use("/restaurants", restaurantRoutes);

app.use("/api/v1", v1);

// Compatibilidade com os caminhos usados nas aulas anteriores.
app.use("/restaurants", restaurantRoutes);
app.use("/auth", authRoutes);

// 6. 404 e tratamento de erro SEMPRE por último — se viessem antes,
//    capturariam rotas válidas.
app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
