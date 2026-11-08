const { randomUUID } = require("crypto");
const logger = require("../logger");

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
