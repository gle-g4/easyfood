const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const prisma = require("../../../database/prisma");
const { env } = require("../../../config/env");
const {
  unauthorized,
  conflict
} = require("../../../shared/errors/AppError");
const { naoSuportado } = require("./auth.provider");

/**
 * PROVIDER: LOCAL (JWT + bcrypt)
 * ==============================
 *
 * Existe por uma razão prática, não por indecisão:
 *
 *  1. DESENVOLVIMENTO SEM AWS — qualquer pessoa clona o repositório e roda
 *     a API sem precisar de conta AWS, User Pool ou credenciais. Isso
 *     derruba a barreira de entrada do projeto a quase zero.
 *  2. TESTES AUTOMATIZADOS — testes não podem depender de um serviço externo
 *     pago e com rate limit.
 *  3. PROVA DO CONTRATO — ter duas implementações reais é o que garante que
 *     a abstração do provider é honesta. Abstração com um único caso
 *     costuma ser abstração errada.
 *
 * Em produção, AUTH_PROVIDER=cognito. Este provider é ferramenta de
 * desenvolvimento, e o config/env.js impede que o segredo padrão vá para
 * produção por descuido.
 */

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
      confirmado: true // sem verificação de e-mail no modo local
    };
  },

  async login({ email, password }) {
    const usuario = await prisma.user.findUnique({ where: { email } });

    // Mensagem idêntica para "usuário não existe" e "senha errada":
    // não entregamos a um atacante a informação de quais e-mails existem.
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

  /**
   * Assumido explicitamente como limitação. JWT local puro é stateless:
   * sem uma lista de revogação, não há como invalidar um token antes de
   * ele expirar. Essa é justamente uma das razões da escolha do Cognito
   * para produção — lá o logout global existe de verdade.
   */
  async refresh() {
    throw naoSuportado("local", "refresh");
  },

  async logout() {
    throw naoSuportado("local", "logout");
  }
};

module.exports = localProvider;
