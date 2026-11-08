const prisma = require("../../database/prisma");

const CAMPOS = {
  id: true, name: true, description: true, price: true, available: true,
  imageUrl: true, restaurantId: true, createdAt: true, updatedAt: true
};

const serializar = (p) => (p ? { ...p, price: Number(p.price) } : p);

async function listarPaginado({ pagina, limite, restaurantId, busca }) {
  const where = {
    active: true,
    ...(restaurantId && { restaurantId }),
    ...(busca && { name: { contains: busca, mode: "insensitive" } })
  };
  const [total, itens] = await prisma.$transaction([
    prisma.dish.count({ where }),
    prisma.dish.findMany({
      where, select: CAMPOS, orderBy: [{ name: "asc" }],
      skip: (pagina - 1) * limite, take: limite
    })
  ]);
  return { total, itens: itens.map(serializar) };
}

async function buscarPorId(id) {
  return serializar(await prisma.dish.findFirst({ where: { id, active: true }, select: CAMPOS }));
}

async function buscarPorNomeNoRestaurante(restaurantId, name) {
  return prisma.dish.findFirst({
    where: { restaurantId, name: { equals: name, mode: "insensitive" }, active: true },
    select: { id: true }
  });
}

async function criar(dados) {
  return serializar(await prisma.dish.create({ data: dados, select: CAMPOS }));
}

async function atualizar(id, dados) {
  return serializar(await prisma.dish.update({ where: { id }, data: dados, select: CAMPOS }));
}

async function definirImagem(id, dados) {
  return serializar(await prisma.dish.update({ where: { id }, data: dados, select: CAMPOS }));
}

async function desativar(id) {
  return prisma.dish.update({ where: { id }, data: { active: false, deletedAt: new Date() }, select: { id: true } });
}

module.exports = {
  listarPaginado, buscarPorId, buscarPorNomeNoRestaurante, criar, atualizar, definirImagem, desativar
};
