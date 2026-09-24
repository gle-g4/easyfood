const prisma = require("../../database/prisma");

/**
 * DIFERENCIAL: CAMADA REPOSITORY (uma a mais que a arquitetura da aula)
 * =====================================================================
 *
 * Na versão da aula o Service chama o Prisma diretamente. Funciona, mas
 * significa que o Service — onde vivem as REGRAS DE NEGÓCIO — conhece
 * detalhes do ORM: `findMany`, `where`, `skip`, `take`.
 *
 * Com o Repository:
 *  - o Service fala a linguagem do domínio ("buscarPorId", "listarPaginado");
 *  - trocar Prisma por outro ORM, SQL puro ou até um cache afeta um arquivo só;
 *  - testar o Service não exige banco: basta substituir o repository.
 *
 * TRADE-OFF ASSUMIDO: é mais um arquivo e mais uma indireção. Para um CRUD
 * minúsculo pode parecer exagero. A aposta é que a EasyFood vai crescer
 * (pedidos, pagamentos, avaliações) e o custo se paga rápido.
 *
 * Esta camada é a ÚNICA do projeto autorizada a importar o Prisma.
 */

// Campos expostos pela API. Declarar explicitamente evita vazar colunas
// internas sem querer quando o schema crescer.
const CAMPOS_PUBLICOS = {
  id: true,
  name: true,
  category: true,
  rating: true,
  active: true,
  createdAt: true,
  updatedAt: true
};

async function listarPaginado({ pagina, limite, categoria, busca, notaMinima }) {
  const where = {
    // Soft delete: registros inativos não aparecem nas listagens.
    active: true,
    ...(categoria && {
      category: { equals: categoria, mode: "insensitive" }
    }),
    ...(busca && {
      name: { contains: busca, mode: "insensitive" }
    }),
    ...(notaMinima !== undefined && { rating: { gte: notaMinima } })
  };

  // Transação: contagem e página vêm do mesmo instante do banco,
  // evitando um total inconsistente com os itens retornados.
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

/**
 * DIFERENCIAL: soft delete.
 * O registro não é apagado, só marcado como inativo. Histórico de pedidos
 * que apontam para esse restaurante continua íntegro, e a exclusão é
 * reversível — algo que um DELETE físico não permite.
 */
async function desativar(id) {
  return prisma.restaurant.update({
    where: { id },
    data: { active: false, deletedAt: new Date() },
    select: CAMPOS_PUBLICOS
  });
}

module.exports = {
  listarPaginado,
  buscarPorId,
  buscarPorNome,
  criar,
  atualizar,
  desativar
};
