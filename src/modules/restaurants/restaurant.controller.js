const service = require("./restaurant.service");
const asyncHandler = require("../../shared/http/asyncHandler");

const list = asyncHandler(async (req, res) => {
  const resultado = await service.listar(req.validatedQuery);
  res.status(200).json(resultado);
});

const getById = asyncHandler(async (req, res) => {
  const restaurante = await service.buscarPorId(Number(req.params.id));
  res.status(200).json(restaurante);
});

const create = asyncHandler(async (req, res) => {
  const criado = await service.criar(req.body, req.user);

  res
    .status(201)
    .location(`/restaurants/${criado.id}`)
    .json(criado);
});

const update = asyncHandler(async (req, res) => {
  const atualizado = await service.atualizar(
    Number(req.params.id),
    req.body,
    req.user
  );
  res.status(200).json(atualizado);
});

const remove = asyncHandler(async (req, res) => {
  await service.desativar(Number(req.params.id), req.user);
  res.status(204).send();
});

const uploadImage = asyncHandler(async (req, res) => {
  const atualizado = await service.enviarImagem(Number(req.params.id), req.file);
  res.status(200).json(atualizado);
});

module.exports = {
  uploadImage, list, getById, create, update, remove };
