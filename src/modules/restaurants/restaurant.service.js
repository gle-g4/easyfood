const repository = require("./restaurant.repository");
const { notFound, conflict } = require("../../shared/errors/AppError");
const logger = require("../../shared/logger");

/**
 * RESTAURANT SERVICE
 *
 * Nenhum import do Prisma aqui — só do Repository. O Service passa a
 * conter de fato REGRAS, e não montagem de query.
 */

async function listar(filtros) {
  const { pagina, limite } = filtros;
  const { total, itens } = await repository.listarPaginado(filtros);

  const totalPaginas = Math.ceil(total / limite) || 1;

  /**
   * DIFERENCIAL: resposta paginada com metadados.
   *
   * A versão da aula devolve um array cru. Isso quebra no dia em que
   * existirem 50 mil restaurantes: a API tenta serializar tudo de uma vez.
   * Aqui o cliente recebe os dados e sabe navegar entre as páginas.
   */
  return {
    dados: itens,
    paginacao: {
      pagina,
      limite,
      total,
      totalPaginas,
      temProxima: pagina < totalPaginas,
      temAnterior: pagina > 1
    }
  };
}

async function buscarPorId(id) {
  const restaurante = await repository.buscarPorId(id);

  if (!restaurante) {
    throw notFound(`Restaurante ${id} não encontrado.`);
  }

  return restaurante;
}

async function criar(dados, autor) {
  // REGRA DE NEGÓCIO: não permitir dois restaurantes com o mesmo nome.
  // Isto é decisão de produto, não detalhe de banco — por isso vive aqui.
  const jaExiste = await repository.buscarPorNome(dados.name);

  if (jaExiste) {
    throw conflict(`Já existe um restaurante chamado "${dados.name}".`);
  }

  const criado = await repository.criar(dados);

  logger.info("restaurante criado", {
    restauranteId: criado.id,
    criadoPor: autor?.email || "anônimo"
  });

  return criado;
}

async function atualizar(id, dados, autor) {
  await buscarPorId(id); // garante existência (lança 404 se não houver)

  if (dados.name) {
    const homonimo = await repository.buscarPorNome(dados.name);
    if (homonimo && homonimo.id !== id) {
      throw conflict(`Já existe outro restaurante chamado "${dados.name}".`);
    }
  }

  const atualizado = await repository.atualizar(id, dados);

  logger.info("restaurante atualizado", {
    restauranteId: id,
    alteradoPor: autor?.email
  });

  return atualizado;
}

async function desativar(id, autor) {
  await buscarPorId(id);

  const desativado = await repository.desativar(id);

  logger.warn("restaurante desativado", {
    restauranteId: id,
    desativadoPor: autor?.email
  });

  return desativado;
}

module.exports = { listar, buscarPorId, criar, atualizar, desativar };
