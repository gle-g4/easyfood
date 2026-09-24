const service = require("./restaurant.service");
const asyncHandler = require("../../shared/http/asyncHandler");

const list = asyncHandler(async (req, res) => {
  // `validatedQuery` é preenchido pelo middleware validate.
  const resultado = await service.listar(req.validatedQuery);
  res.status(200).json(resultado);
});

const getById = asyncHandler(async (req, res) => {
  const restaurante = await service.buscarPorId(Number(req.params.id));
  res.status(200).json(restaurante);
});

const create = asyncHandler(async (req, res) => {
  const criado = await service.criar(req.body, req.user);

  // DIFERENCIAL: header Location apontando para o recurso criado.
  // É o que a especificação HTTP manda em um 201 — muita API ignora.
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
  res.status(204).send(); // 204: sucesso sem corpo de resposta
});

module.exports = { list, getById, create, update, remove };
