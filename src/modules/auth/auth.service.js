const authProvider = require("./providers");
const prisma = require("../../database/prisma");
const logger = require("../../shared/logger");

/**
 * AUTH SERVICE
 * ============
 *
 * Repare no que este arquivo NÃO tem: nenhum `jwt.sign`, nenhum SDK da AWS,
 * nenhum `req`/`res`. Ele orquestra regras de negócio e delega a
 * autenticação ao provider configurado.
 *
 * DIFERENCIAL: ESPELHO LOCAL DO USUÁRIO (shadow user)
 * ---------------------------------------------------
 * Mesmo usando Cognito, guardamos um registro local mínimo do usuário
 * (id externo, e-mail, nome, papel). Motivos:
 *
 *  1. RELACIONAMENTO — um Pedido precisa de uma foreign key para um usuário
 *     que existe no NOSSO banco. Não dá para criar FK para um ID que só
 *     existe na AWS.
 *  2. CONSULTA BARATA — listar "pedidos com nome do cliente" não pode
 *     depender de N chamadas à API da AWS.
 *  3. PORTABILIDADE — se um dia trocarmos de provedor, a base de usuários
 *     e seus vínculos continuam nossos.
 *
 * O que NÃO fica no espelho: senha. Nunca. Com Cognito, a coluna `password`
 * fica nula — a credencial vive só no provedor de identidade.
 */

async function sincronizarUsuarioLocal({ externalId, email, name, provider }) {
  // upsert: cria se for o primeiro acesso, atualiza se já existir.
  return prisma.user.upsert({
    where: { email },
    update: {
      externalId,
      name,
      authProvider: provider,
      lastLoginAt: new Date()
    },
    create: {
      externalId,
      email,
      name,
      authProvider: provider,
      lastLoginAt: new Date()
    },
    select: {
      id: true,
      externalId: true,
      email: true,
      name: true,
      role: true,
      createdAt: true
    }
  });
}

async function register({ name, email, password }) {
  const identidade = await authProvider.register({ name, email, password });

  const usuarioLocal = await sincronizarUsuarioLocal({
    externalId: identidade.id,
    email: identidade.email,
    name: identidade.name,
    provider: authProvider.name
  });

  logger.info("usuário registrado", {
    userId: usuarioLocal.id,
    provider: authProvider.name,
    confirmado: identidade.confirmado
  });

  return {
    usuario: usuarioLocal,
    confirmacaoPendente: !identidade.confirmado,
    mensagem: identidade.confirmado
      ? "Cadastro concluído. Você já pode fazer login."
      : "Cadastro criado. Confirme o código enviado ao seu e-mail para ativar a conta."
  };
}

async function login({ email, password }) {
  const tokens = await authProvider.login({ email, password });

  // Lê a identidade a partir do próprio token emitido — funciona igual
  // para Cognito e local, sem o Service precisar saber a diferença.
  const identidade = await authProvider.verifyToken(tokens.accessToken);

  const usuario = await sincronizarUsuarioLocal({
    externalId: identidade.sub,
    email: identidade.email || email,
    name: identidade.name,
    provider: authProvider.name
  });

  logger.info("login efetuado", {
    userId: usuario.id,
    provider: authProvider.name
  });

  return {
    tokens: {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      tipo: tokens.tipo,
      expiraEm: tokens.expiraEm
    },
    usuario
  };
}

async function confirmarCadastro({ email, codigo }) {
  if (typeof authProvider.confirmarCadastro !== "function") {
    return {
      confirmado: true,
      mensagem: "Este provider não exige confirmação de conta."
    };
  }

  await authProvider.confirmarCadastro({ email, codigo });

  await prisma.user.updateMany({
    where: { email },
    data: { emailVerified: true }
  });

  return { confirmado: true, mensagem: "Conta confirmada com sucesso." };
}

async function reenviarCodigo({ email }) {
  if (typeof authProvider.reenviarCodigo !== "function") {
    return { enviado: false, mensagem: "Provider não suporta reenvio." };
  }
  await authProvider.reenviarCodigo({ email });
  return { enviado: true, mensagem: "Novo código enviado." };
}

async function refresh(refreshToken) {
  return authProvider.refresh(refreshToken);
}

async function logout({ accessToken }) {
  await authProvider.logout({ accessToken });
  return { mensagem: "Sessão encerrada." };
}

async function perfil(externalId) {
  return prisma.user.findFirst({
    where: { externalId },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      emailVerified: true,
      createdAt: true,
      lastLoginAt: true
    }
  });
}

module.exports = {
  register,
  login,
  confirmarCadastro,
  reenviarCodigo,
  refresh,
  logout,
  perfil,
  providerAtivo: authProvider.name
};
