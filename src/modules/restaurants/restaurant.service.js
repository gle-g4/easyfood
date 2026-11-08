const repository = require("./restaurant.repository");
const { notFound, conflict } = require("../../shared/errors/AppError");
const logger = require("../../shared/logger");
const { env } = require("../../config/env");
const emailService = require("../shared/email.service");
const imageService = require("../shared/image.service");

async function listar(filtros) {
  const { pagina, limite } = filtros;
  const { total, itens } = await repository.listarPaginado(filtros);

  const totalPaginas = Math.ceil(total / limite) || 1;

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

async function notificarCadastro(restaurante, autor) {
  const destinoBoasVindas = env.email.testTo || autor?.email;
  const destinoComercial = env.email.commercialTo || env.email.testTo;

  const nome = emailService.escapeHtml(restaurante.name);
  const categoria = emailService.escapeHtml(restaurante.category);

  try {
    await emailService.sendEmail({
      to: destinoBoasVindas,
      toName: restaurante.name,
      subject: `Bem-vindo à EasyFood, ${restaurante.name}!`,
      header: `Olá, ${restaurante.name}!`,
      body: `
        Seu restaurante foi cadastrado com sucesso na EasyFood.<br/>
        Categoria: ${categoria}.
      `,
      footer: "Equipe EasyFood"
    });
  } catch (error) {
    logger.error("Erro ao enviar e-mail de boas-vindas", {
      restauranteId: restaurante.id,
      erro: error.message
    });
  }

  try {
    await emailService.sendEmail({
      to: destinoComercial,
      toName: "Comercial EasyFood",
      subject: `Novo restaurante cadastrado: ${restaurante.name}`,
      header: "Novo restaurante na plataforma",
      body: `
        Nome: ${nome}<br/>
        Categoria: ${categoria}<br/>
        Avaliação: ${emailService.escapeHtml(restaurante.rating)}
      `,
      footer: "Notificação automática - EasyFood"
    });
  } catch (error) {
    logger.error("Erro ao notificar o comercial", {
      restauranteId: restaurante.id,
      erro: error.message
    });
  }
}

async function criar(dados, autor) {
  const jaExiste = await repository.buscarPorNome(dados.name);

  if (jaExiste) {
    throw conflict(`Já existe um restaurante chamado "${dados.name}".`);
  }

  const criado = await repository.criar(dados);

  logger.info("restaurante criado", {
    restauranteId: criado.id,
    criadoPor: autor?.email || "anônimo"
  });

  void notificarCadastro(criado, autor);

  return criado;
}

async function atualizar(id, dados, autor) {
  await buscarPorId(id);

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

async function enviarImagem(id, arquivo) {
  const restaurante = await buscarPorId(id);
  return imageService.trocarImagem({
    buffer: arquivo.buffer,
    imagemAtual: restaurante.imageUrl,
    persistir: (url) => repository.definirImagem(id, { imageUrl: url })
  });
}

module.exports = {
  enviarImagem, listar, buscarPorId, criar, atualizar, desativar };
