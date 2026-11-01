const prisma = require("../../database/prisma");

const CAMPOS_PUBLICOS = {
  id: true,
  name: true,
  category: true,
  rating: true,
  active: true,
  imageUrl: true,
  createdAt: true,
  updatedAt: true
};

async function listarPaginado({ pagina, limite, categoria, busca, notaMinima }) {
  const where = {
    active: true,
    ...(categoria && {
      category: { equals: categoria, mode: "insensitive" }
    }),
    ...(busca && {
      name: { contains: busca, mode: "insensitive" }
    }),
    ...(notaMinima !== undefined && { rating: { gte: notaMinima } })
  };

  const [total, itens] = await prisma.$transaction([
    prisma.restaurant.count({ where }),
    prisma.restaurant.findMany({
      where,
      select: CAMPOS_PUBLICOS,
      orderBy: [{ rating: "desc" }, { name: "asc" }],
      skip: (pagina - 1) * limite,
      take: limite
    })
  ]);

  return { total, itens };
}

async function buscarPorId(id) {
  return prisma.restaurant.findFirst({
    where: { id, active: true },
    select: CAMPOS_PUBLICOS
  });
}

async function buscarPorNome(name) {
  return prisma.restaurant.findFirst({
    where: {
      name: { equals: name, mode: "insensitive" },
      active: true
    },
    select: CAMPOS_PUBLICOS
  });
}

async function criar(dados) {
  return prisma.restaurant.create({
    data: dados,
    select: CAMPOS_PUBLICOS
  });
}

async function atualizar(id, dados) {
  return prisma.restaurant.update({
    where: { id },
    data: dados,
    select: CAMPOS_PUBLICOS
  });
}

async function desativar(id) {
  return prisma.restaurant.update({
    where: { id },
    data: { active: false, deletedAt: new Date() },
    select: CAMPOS_PUBLICOS
  });
}

async function definirImagem(id, dados) {
  return prisma.restaurant.update({ where: { id }, data: dados, select: CAMPOS_PUBLICOS });
}

module.exports = {
  definirImagem,
  listarPaginado,
  buscarPorId,
  buscarPorNome,
  criar,
  atualizar,
  desativar
};
