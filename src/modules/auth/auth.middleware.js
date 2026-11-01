const authProvider = require("./providers");
const asyncHandler = require("../../shared/http/asyncHandler");
const { unauthorized, forbidden } = require("../../shared/errors/AppError");

const authenticate = asyncHandler(async (req, _res, next) => {
  const header = req.headers.authorization;

  if (!header || !header.startsWith("Bearer ")) {
    throw unauthorized("Token não informado. Use o header: Authorization: Bearer <token>");
  }

  const token = header.slice(7).trim();

  if (!token) throw unauthorized("Token vazio.");

  req.user = await authProvider.verifyToken(token);

  next();
});

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

const optionalAuth = asyncHandler(async (req, _res, next) => {
  const header = req.headers.authorization;

  if (!header || !header.startsWith("Bearer ")) {
    req.user = null;
    return next();
  }

  try {
    req.user = await authProvider.verifyToken(header.slice(7).trim());
  } catch {
    req.user = null;
  }

  next();
});

module.exports = { authenticate, authorize, optionalAuth };
