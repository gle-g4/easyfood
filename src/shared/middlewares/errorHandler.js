const { AppError } = require("../errors/AppError");
const { isProduction } = require("../../config/env");
const logger = require("../logger");

function notFoundHandler(req, _res, next) {
  next(
    new AppError(
      `Rota não encontrada: ${req.method} ${req.originalUrl}`,
      404,
      "ROUTE_NOT_FOUND"
    )
  );
}

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

  if (!isProduction && appError.statusCode >= 500) {
    body.error.stack = error.stack;
  }

  res.status(appError.statusCode).json(body);
}

module.exports = { errorHandler, notFoundHandler };
