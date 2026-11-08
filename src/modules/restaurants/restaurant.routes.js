const express = require("express");

const controller = require("./restaurant.controller");
const validate = require("../../shared/middlewares/validate");
const { uploadImagem } = require("../shared/upload.middleware");
const { nested: dishesDoRestaurante } = require("../dishes/dish.routes");
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

router.delete(
  "/:id",
  authenticate,
  authorize("admin", "owner"),
  validate(idParamSchema, "params"),
  controller.remove
);

router.use("/:restaurantId/dishes", dishesDoRestaurante);

router.post("/:id/image", authenticate, validate(idParamSchema, "params"), uploadImagem, controller.uploadImage);

module.exports = router;
