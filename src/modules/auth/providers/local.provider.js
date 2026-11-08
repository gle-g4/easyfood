const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const prisma = require("../../../database/prisma");
const { env } = require("../../../config/env");
const {
  unauthorized,
  conflict
} = require("../../../shared/errors/AppError");
const { naoSuportado } = require("./auth.provider");

const ROUNDS_BCRYPT = 10;

const localProvider = {
  name: "local",

  async register({ name, email, password }) {
    const existente = await prisma.user.findUnique({ where: { email } });

    if (existente) {
      throw conflict("Este e-mail já está cadastrado.");
    }

    const senhaHash = await bcrypt.hash(password, ROUNDS_BCRYPT);

    const usuario = await prisma.user.create({
      data: {
        name,
        email,
        password: senhaHash,
        authProvider: "local"
      }
    });

    return {
      id: String(usuario.id),
      email: usuario.email,
      name: usuario.name,
      confirmado: true
    };
  },

  async login({ email, password }) {
    const usuario = await prisma.user.findUnique({ where: { email } });

    const generico = unauthorized("E-mail ou senha inválidos.");

    if (!usuario || !usuario.password) throw generico;

    const senhaConfere = await bcrypt.compare(password, usuario.password);
    if (!senhaConfere) throw generico;

    const payload = {
      sub: String(usuario.id),
      email: usuario.email,
      name: usuario.name,
      grupos: usuario.role ? [usuario.role] : []
    };

    const accessToken = jwt.sign(payload, env.auth.jwtSecret, {
      expiresIn: env.auth.jwtExpiresIn
    });

    const { exp } = jwt.decode(accessToken);

    return {
      accessToken,
      refreshToken: null,
      expiraEm: exp - Math.floor(Date.now() / 1000),
      tipo: "Bearer"
    };
  },

  async verifyToken(token) {
    try {
      const payload = jwt.verify(token, env.auth.jwtSecret);

      return {
        sub: payload.sub,
        email: payload.email,
        name: payload.name,
        grupos: payload.grupos || [],
        provider: "local"
      };
    } catch (error) {
      throw unauthorized("Token inválido ou expirado.");
    }
  },

  async refresh() {
    throw naoSuportado("local", "refresh");
  },

  async logout() {
    throw naoSuportado("local", "logout");
  }
};

module.exports = localProvider;
