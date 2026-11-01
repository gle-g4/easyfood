const { tooManyRequests } = require("../errors/AppError");
const logger = require("../logger");

function createRateLimiter({ windowMs = 60_000, max = 5, name = "default" } = {}) {
  const hits = new Map();

  const cleanup = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of hits.entries()) {
      if (now > entry.resetAt) hits.delete(key);
    }
  }, windowMs);

  if (cleanup.unref) cleanup.unref();

  return function rateLimit(req, res, next) {
    const key = req.ip || req.socket.remoteAddress || "desconhecido";
    const now = Date.now();

    let entry = hits.get(key);

    if (!entry || now > entry.resetAt) {
      entry = { count: 0, resetAt: now + windowMs };
      hits.set(key, entry);
    }

    entry.count += 1;

    const restantes = Math.max(0, max - entry.count);
    res.setHeader("X-RateLimit-Limit", max);
    res.setHeader("X-RateLimit-Remaining", restantes);
    res.setHeader("X-RateLimit-Reset", Math.ceil(entry.resetAt / 1000));

    if (entry.count > max) {
      const esperaSegundos = Math.ceil((entry.resetAt - now) / 1000);
      res.setHeader("Retry-After", esperaSegundos);

      logger.warn("limite de requisições excedido", {
        requestId: req.id,
        limiter: name,
        ip: key,
        tentativas: entry.count
      });

      return next(
        tooManyRequests(
          `Muitas tentativas. Tente novamente em ${esperaSegundos} segundos.`
        )
      );
    }

    next();
  };
}

module.exports = createRateLimiter;
