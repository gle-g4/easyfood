const express = require("express");

const controller = require("./auth.controller");
const { uploadImagem } = require("../shared/upload.middleware");
const { authenticate } = require("./auth.middleware");
const validate = require("../../shared/middlewares/validate");
const createRateLimiter = require("../../shared/middlewares/rateLimit");
const {
  registerSchema,
  loginSchema,
  confirmarSchema,
  reenviarSchema,
  refreshSchema
} = require("./auth.schema");

const router = express.Router();

const { env } = require("../../config/env");

const limiteLogin = createRateLimiter({
  windowMs: env.rateLimit.janelaMs,
  max: env.rateLimit.login,
  name: "login"
});

const limiteCadastro = createRateLimiter({
  windowMs: env.rateLimit.janelaMs,
  max: env.rateLimit.register,
  name: "register"
});

const limiteCodigo = createRateLimiter({
  windowMs: env.rateLimit.janelaMs,
  max: env.rateLimit.register,
  name: "codigo"
});

router.post(
  "/register",
  limiteCadastro,
  validate(registerSchema),
  controller.register
);

router.post("/login", limiteLogin, validate(loginSchema), controller.login);

router.post(
  "/confirm",
  limiteCodigo,
  validate(confirmarSchema),
  controller.confirmar
);

router.post(
  "/resend-code",
  limiteCodigo,
  validate(reenviarSchema),
  controller.reenviarCodigo
);

router.post("/refresh", validate(refreshSchema), controller.refresh);

router.post("/logout", authenticate, controller.logout);
router.get("/me", authenticate, controller.eu);

router.post("/me/image", authenticate, uploadImagem, controller.uploadImagemPerfil);

module.exports = router;
