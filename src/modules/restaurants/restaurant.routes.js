const express = require("express");

const controller = require("./restaurant.controller");
const validate = require("../../shared/middlewares/validate");
const {
  authenticate,
  authorize,
  optionalAuth
} = require("../auth/auth.middleware");
const {
  criarRestauranteSchema,
  atualizarRestauranteSchema,
  listarQuerySchema,
  idParamSchema
} = require("./restaurant.schema");

const router = express.Router();

/**
 * POLÍTICA DE ACESSO DESTE MÓDULO
 *
 * Leitura é pública: qualquer visitante pode ver os restaurantes — é o
 * produto da EasyFood. Escrita exige login, e as operações destrutivas
 * exigem papel administrativo (grupo no Cognito).
 *
 * Deixar isso explícito na rota é melhor do que esconder no controller:
 * lendo este arquivo você sabe, em 10 segundos, quem pode fazer o quê.
 */

// LEITURA — pública (optionalAuth só enriquece o contexto, não bloqueia)
router.get(
  "/",
  optionalAuth,
  validate(listarQuerySchema, "query"),
  controller.list
);

router.get(
  "/:id",
  optionalAuth,
  validate(idParamSchema, "params"),
  controller.getById
);

// ESCRITA — exige autenticação
router.post(
  "/",
  authenticate,
  validate(criarRestauranteSchema),
  controller.create
);

router.patch(
  "/:id",
  authenticate,
  validate(idParamSchema, "params"),
  validate(atualizarRestauranteSchema),
  controller.update
);

// EXCLUSÃO — exige papel administrativo
router.delete(
  "/:id",
  authenticate,
  authorize("admin", "owner"),
  validate(idParamSchema, "params"),
  controller.remove
);

module.exports = router;
