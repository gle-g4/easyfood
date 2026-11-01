const repository = require("./dish.repository");
const restaurantService = require("../restaurants/restaurant.service");
const imageService = require("../shared/image.service");
const { notFound, conflict } = require("../../shared/errors/AppError");
const logger = require("../../shared/logger");

async function listar(filtros) {
  const { pagina, limite } = filtros;
  const { total, itens } = await repository.listarPaginado(filtros);
  const totalPaginas = Math.ceil(total / limite) || 1;
  return {
    dados: itens,
    paginacao: { pagina, limite, total, totalPaginas, temProxima: pagina < totalPaginas, temAnterior: pagina > 1 }
  };
}

async function listarPorRestaurante(restaurantId, filtros) {
  await restaurantService.buscarPorId(restaurantId);
  return listar({ ...filtros, restaurantId });
}

async function buscarPorId(id) {
  const prato = await repository.buscarPorId(id);
  if (!prato) throw notFound(`Prato ${id} não encontrado.`);
  return prato;
}

async function criar(dados, autor) {
  await restaurantService.buscarPorId(dados.restaurantId);

  if (await repository.buscarPorNomeNoRestaurante(dados.restaurantId, dados.name)) {
    throw conflict(`Este restaurante já tem um prato chamado "${dados.name}".`);
  }

  const prato = await repository.criar(dados);
  logger.info("prato criado", { pratoId: prato.id, restaurantId: prato.restaurantId, criadoPor: autor?.email });
  return prato;
}

async function atualizar(id, dados) {
  const atual = await buscarPorId(id);
  if (dados.name) {
    const homonimo = await repository.buscarPorNomeNoRestaurante(atual.restaurantId, dados.name);
    if (homonimo && homonimo.id !== id) throw conflict(`Este restaurante já tem um prato chamado "${dados.name}".`);
  }
  return repository.atualizar(id, dados);
}

async function desativar(id) {
  await buscarPorId(id);
  await repository.desativar(id);
}

async function enviarImagem(id, arquivo) {
  const prato = await buscarPorId(id);
  return imageService.trocarImagem({
    buffer: arquivo.buffer,
    imagemAtual: prato.imageUrl,
    persistir: (url) => repository.definirImagem(id, { imageUrl: url })
  });
}

module.exports = { listar, listarPorRestaurante, buscarPorId, criar, atualizar, desativar, enviarImagem };
