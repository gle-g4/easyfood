const express = require("express");
const controller = require("./dish.controller");
const validate = require("../../shared/middlewares/validate");
const { authenticate, authorize, optionalAuth } = require("../auth/auth.middleware");
const { uploadImagem } = require("../shared/upload.middleware");
const {
  criarPratoSchema,
  criarPratoNoRestauranteSchema,
  restaurantIdParamSchema,
  atualizarPratoSchema,
  listarPratosQuerySchema,
  idParamSchema
} = require("./dish.schema");

const router = express.Router();

router.get("/", optionalAuth, validate(listarPratosQuerySchema, "query"), controller.list);
router.get("/:id", optionalAuth, validate(idParamSchema, "params"), controller.getById);
router.post("/", authenticate, validate(criarPratoSchema), controller.create);
router.patch("/:id", authenticate, validate(idParamSchema, "params"), validate(atualizarPratoSchema), controller.update);
router.delete("/:id", authenticate, authorize("admin", "owner"), validate(idParamSchema, "params"), controller.remove);
router.post("/:id/image", authenticate, validate(idParamSchema, "params"), uploadImagem, controller.uploadImage);

const nested = express.Router({ mergeParams: true });

nested.get(
  "/",
  optionalAuth,
  validate(restaurantIdParamSchema, "params"),
  validate(listarPratosQuerySchema, "query"),
  controller.listForRestaurant
);
nested.post(
  "/",
  authenticate,
  validate(restaurantIdParamSchema, "params"),
  validate(criarPratoNoRestauranteSchema),
  controller.createForRestaurant
);

module.exports = router;
module.exports.nested = nested;
