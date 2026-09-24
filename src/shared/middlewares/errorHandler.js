const { AppError } = require("../errors/AppError");
const { isProduction } = require("../../config/env");
const logger = require("../logger");

/**
 * DIFERENCIAL: um único ponto de tratamento de erro para toda a API.
 *
 * Sem isso, cada controller repete o mesmo try/catch com
 * `res.status(500).json({ error: "Erro interno do servidor" })`.
 * Isso é duplicação e, pior, cada desenvolvedor acaba formatando o erro
 * de um jeito — o front nunca sabe o que esperar.
 *
 * Aqui todo erro vira a MESMA estrutura de resposta, sempre.
 */

// Rota inexistente: também vira erro, tratado pelo mesmo fluxo.
function notFoundHandler(req, _res, next) {
  next(
    new AppError(
      `Rota não encontrada: ${req.method} ${req.originalUrl}`,
      404,
      "ROUTE_NOT_FOUND"
    )
  );
}

// Traduz erros conhecidos do Prisma para erros de domínio.
function translatePrismaError(error) {
  if (error.code === "P2002") {
    const campo = error.meta?.target?.join(", ") || "campo único";
    return new AppError(
      `Já existe um registro com esse ${campo}.`,
      409,
      "DUPLICATE_ENTRY"
    );
  }
  if (error.code === "P2025") {
    return new AppError("Registro não encontrado.", 404, "NOT_FOUND");
  }
  if (error.code === "P2003") {
    return new AppError(
      "Referência inválida para outro registro.",
      400,
      "INVALID_REFERENCE"
    );
  }
  return null;
}

// O Express identifica o error handler pela assinatura de 4 argumentos.
// eslint-disable-next-line no-unused-vars
function errorHandler(error, req, res, _next) {
  let appError = error;

  if (!(appError instanceof AppError)) {
    const translated = translatePrismaError(error);
    appError =
      translated ||
      new AppError("Erro interno do servidor", 500, "INTERNAL_ERROR");
  }

  const logMeta = {
    requestId: req.id,
    code: appError.code,
    status: appError.statusCode,
    path: req.originalUrl
  };

  if (appError.statusCode >= 500) {
    // Erro inesperado: registra o stack completo para investigação.
    logger.error(error.message, { ...logMeta, stack: error.stack });
  } else {
    logger.warn(appError.message, logMeta);
  }

  const body = {
    error: {
      code: appError.code,
      message: appError.message,
      requestId: req.id
    }
  };

  if (appError.details) {
    body.error.details = appError.details;
  }

  // Em dev, devolve o stack para facilitar o debug. Em produção, nunca.
  if (!isProduction && appError.statusCode >= 500) {
    body.error.stack = error.stack;
  }

  res.status(appError.statusCode).json(body);
}

module.exports = { errorHandler, notFoundHandler };
