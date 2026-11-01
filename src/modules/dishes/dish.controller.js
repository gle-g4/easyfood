const service = require("./dish.service");
const asyncHandler = require("../../shared/http/asyncHandler");

const list = asyncHandler(async (req, res) => res.status(200).json(await service.listar(req.validatedQuery)));

const getById = asyncHandler(async (req, res) => res.status(200).json(await service.buscarPorId(Number(req.params.id))));

const create = asyncHandler(async (req, res) => {
  const prato = await service.criar(req.body, req.user);
  res.status(201).location(`/dishes/${prato.id}`).json(prato);
});

const update = asyncHandler(async (req, res) =>
  res.status(200).json(await service.atualizar(Number(req.params.id), req.body)));

const remove = asyncHandler(async (req, res) => {
  await service.desativar(Number(req.params.id));
  res.status(204).send();
});

const uploadImage = asyncHandler(async (req, res) => {
  const atualizado = await service.enviarImagem(Number(req.params.id), req.file);
  res.status(200).json(atualizado);
});

const createForRestaurant = asyncHandler(async (req, res) => {
  const prato = await service.criar({ ...req.body, restaurantId: req.params.restaurantId }, req.user);
  res.status(201).location(`/dishes/${prato.id}`).json(prato);
});

const listForRestaurant = asyncHandler(async (req, res) =>
  res.status(200).json(await service.listarPorRestaurante(req.params.restaurantId, req.validatedQuery)));

module.exports = {
  createForRestaurant,
  listForRestaurant, list, getById, create, update, remove, uploadImage };
