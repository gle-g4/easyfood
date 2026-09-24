const authProvider = require("./providers");
const asyncHandler = require("../../shared/http/asyncHandler");
const { unauthorized, forbidden } = require("../../shared/errors/AppError");

/**
 * AUTENTICAÇÃO E AUTORIZAÇÃO
 *
 * Duas coisas diferentes, separadas de propósito:
 *  - authenticate: "quem é você?"  (identidade)
 *  - authorize:    "você pode isso?" (permissão)
 *
 * Misturar as duas em um middleware só é um erro comum, e complica quando
 * surge a primeira rota que precisa de login mas não de papel específico.
 */

const authenticate = asyncHandler(async (req, _res, next) => {
  const header = req.headers.authorization;

  if (!header || !header.startsWith("Bearer ")) {
    throw unauthorized("Token não informado. Use o header: Authorization: Bearer <token>");
  }

  const token = header.slice(7).trim();

  if (!token) throw unauthorized("Token vazio.");

  // Delegado ao provider ativo: nem este middleware sabe se é Cognito ou JWT local.
  req.user = await authProvider.verifyToken(token);

  next();
});

/**
 * DIFERENCIAL: RBAC alimentado pelos GRUPOS DO COGNITO.
 *
 * No Cognito, você cria grupos (ex.: "admin", "owner") no console e
 * associa usuários. O token já vem com `cognito:groups`. A API só precisa
 * conferir — não gerencia papéis por conta própria.
 *
 * Uso:  router.post("/", authenticate, authorize("admin", "owner"), ctrl.create)
 */
function authorize(...gruposPermitidos) {
  return (req, _res, next) => {
    if (!req.user) {
      return next(unauthorized("Autenticação necessária."));
    }

    if (gruposPermitidos.length === 0) return next();

    const grupos = req.user.grupos || [];
    const autorizado = grupos.some((g) => gruposPermitidos.includes(g));

    if (!autorizado) {
      return next(
        forbidden(
          `Acesso restrito. Papel necessário: ${gruposPermitidos.join(" ou ")}.`
        )
      );
    }

    next();
  };
}

/**
 * Autenticação OPCIONAL: se houver token válido, identifica o usuário;
 * se não houver, segue como anônimo em vez de bloquear.
 *
 * Útil em rotas públicas que se comportam melhor quando sabem quem está
 * olhando (ex.: marcar os restaurantes favoritados pelo usuário logado)
 * mas que continuam funcionando sem login.
 */
const optionalAuth = asyncHandler(async (req, _res, next) => {
  const header = req.headers.authorization;

  if (!header || !header.startsWith("Bearer ")) {
    req.user = null;
    return next();
  }

  try {
    req.user = await authProvider.verifyToken(header.slice(7).trim());
  } catch {
    req.user = null; // token ruim não derruba rota pública
  }

  next();
});

module.exports = { authenticate, authorize, optionalAuth };
