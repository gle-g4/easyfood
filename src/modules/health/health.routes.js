const express = require("express");
const prisma = require("../../database/prisma");
const { env } = require("../../config/env");
const asyncHandler = require("../../shared/http/asyncHandler");

const router = express.Router();

const iniciadoEm = Date.now();

router.get("/live", (_req, res) => {
  res.status(200).json({
    status: "ok",
    uptimeSegundos: Math.floor((Date.now() - iniciadoEm) / 1000)
  });
});

router.get(
  "/ready",
  asyncHandler(async (_req, res) => {
    const checagens = {};
    let saudavel = true;

    try {
      const inicio = Date.now();
      await prisma.$queryRaw`SELECT 1`;
      checagens.database = {
        status: "ok",
        latenciaMs: Date.now() - inicio
      };
    } catch (error) {
      saudavel = false;
      checagens.database = { status: "falha", erro: error.message };
    }

    checagens.authProvider = { status: "ok", provider: env.auth.provider };

    res.status(saudavel ? 200 : 503).json({
      status: saudavel ? "ok" : "degradado",
      ambiente: env.nodeEnv,
      checagens
    });
  })
);

module.exports = router;
