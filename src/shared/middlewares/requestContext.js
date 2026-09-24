const { randomUUID } = require("crypto");
const logger = require("../logger");

/**
 * DIFERENCIAL: correlation id (request id) por requisição.
 *
 * Cada requisição ganha um identificador único que aparece em todos os
 * logs dela e volta no header `x-request-id`. Quando um usuário relata
 * "deu erro às 14h32", você pede o id e acha a trilha inteira no log —
 * em vez de caçar entre milhares de linhas.
 *
 * Também mede a duração da requisição, o que dá visibilidade de
 * performance de graça.
 */
function requestContext(req, res, next) {
  const incoming = req.headers["x-request-id"];
  req.id = typeof incoming === "string" && incoming.length <= 100
    ? incoming
    : randomUUID();

  res.setHeader("x-request-id", req.id);

  const startedAt = process.hrtime.bigint();

  res.on("finish", () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;

    const level = res.statusCode >= 500 ? "error"
      : res.statusCode >= 400 ? "warn"
      : "info";

    logger[level]("requisição finalizada", {
      requestId: req.id,
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      durationMs: Number(durationMs.toFixed(2))
    });
  });

  next();
}

module.exports = requestContext;
