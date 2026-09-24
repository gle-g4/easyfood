const app = require("./src/app");
const prisma = require("./src/database/prisma");
const { env } = require("./src/config/env");
const logger = require("./src/shared/logger");

/**
 * DIFERENCIAL: GRACEFUL SHUTDOWN
 * ==============================
 *
 * O `server.js` da aula tem uma linha: `app.listen(3000)`. Isso basta para
 * desenvolvimento, mas em produção causa um problema real.
 *
 * Quando o orquestrador (Docker, Kubernetes, Render) faz um deploy, ele
 * envia SIGTERM ao processo. Sem tratamento, o Node morre na hora e:
 *   - requisições em andamento são cortadas no meio (usuário vê erro);
 *   - conexões com o PostgreSQL ficam penduradas até dar timeout.
 *
 * Aqui o processo: para de aceitar conexões novas, espera as atuais
 * terminarem, fecha o Prisma e só então sai. Deploy sem erro para o usuário.
 */

const server = app.listen(env.port, () => {
  logger.info("EasyFood no ar", {
    porta: env.port,
    ambiente: env.nodeEnv,
    authProvider: env.auth.provider,
    url: `http://localhost:${env.port}`
  });
});

// Se o shutdown travar, força a saída para não ficar pendurado eternamente.
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

process.on("SIGTERM", () => shutdown("SIGTERM")); // deploy/orquestrador
process.on("SIGINT", () => shutdown("SIGINT"));   // Ctrl+C no terminal

/**
 * Rede de segurança: um erro não tratado deixa o processo em estado
 * indefinido. O correto é logar e sair — deixando o orquestrador subir
 * uma instância limpa — e não fingir que está tudo bem.
 */
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
