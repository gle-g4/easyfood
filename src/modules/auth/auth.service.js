const authProvider = require("./providers");
const prisma = require("../../database/prisma");
const logger = require("../../shared/logger");
const imageService = require("../shared/image.service");
const { notFound } = require("../../shared/errors/AppError");

async function sincronizarUsuarioLocal({ externalId, email, name, provider }) {
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
      imageUrl: true,
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
      imageUrl: true,
      createdAt: true,
      lastLoginAt: true
    }
  });
}

async function atualizarImagemPerfil(externalId, arquivo) {
  const usuario = await prisma.user.findFirst({ where: { externalId } });
  if (!usuario) throw notFound("Usuário não encontrado.");
  return imageService.trocarImagem({
    buffer: arquivo.buffer,
    imagemAtual: usuario.imageUrl,
    persistir: (url) =>
      prisma.user.update({
        where: { id: usuario.id },
        data: { imageUrl: url },
        select: { id: true, email: true, name: true, role: true, imageUrl: true }
      })
  });
}

module.exports = {
  atualizarImagemPerfil,
  register,
  login,
  confirmarCadastro,
  reenviarCodigo,
  refresh,
  logout,
  perfil,
  providerAtivo: authProvider.name
};
