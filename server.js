const app = require("./src/app");
const prisma = require("./src/database/prisma");
const { env } = require("./src/config/env");
const logger = require("./src/shared/logger");

const server = app.listen(env.port, () => {
  logger.info("EasyFood no ar", {
    porta: env.port,
    ambiente: env.nodeEnv,
    authProvider: env.auth.provider,
    url: `http://localhost:${env.port}`
  });
});

const TIMEOUT_SHUTDOWN_MS = 10_000;

let encerrando = false;

async function shutdown(sinal) {
  if (encerrando) return;
  encerrando = true;

  logger.info("encerrando aplicação", { sinal });

  const forcar = setTimeout(() => {
    logger.error("shutdown demorou demais, forçando saída");
    process.exit(1);
  }, TIMEOUT_SHUTDOWN_MS);

  forcar.unref();

  server.close(async (erro) => {
    if (erro) {
      logger.error("falha ao fechar servidor HTTP", { erro: erro.message });
      process.exit(1);
    }

    try {
      await prisma.$disconnect();
      logger.info("conexões encerradas com sucesso");
      process.exit(0);
    } catch (e) {
      logger.error("falha ao desconectar do banco", { erro: e.message });
      process.exit(1);
    }
  });
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

process.on("unhandledRejection", (motivo) => {
  logger.error("promise rejeitada sem tratamento", {
    motivo: motivo instanceof Error ? motivo.message : String(motivo),
    stack: motivo instanceof Error ? motivo.stack : undefined
  });
  shutdown("unhandledRejection");
});

process.on("uncaughtException", (erro) => {
  logger.error("exceção não capturada", {
    erro: erro.message,
    stack: erro.stack
  });
  shutdown("uncaughtException");
});

module.exports = server;
