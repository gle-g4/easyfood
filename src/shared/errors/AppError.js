class AppError extends Error {
  constructor(message, statusCode = 400, code = "BAD_REQUEST", details = null) {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

const badRequest = (msg, details) =>
  new AppError(msg, 400, "BAD_REQUEST", details);

const unauthorized = (msg = "Não autenticado") =>
  new AppError(msg, 401, "UNAUTHORIZED");

const forbidden = (msg = "Acesso negado") =>
  new AppError(msg, 403, "FORBIDDEN");

const notFound = (msg = "Recurso não encontrado") =>
  new AppError(msg, 404, "NOT_FOUND");

const conflict = (msg = "Conflito de estado") =>
  new AppError(msg, 409, "CONFLICT");

const tooManyRequests = (msg = "Muitas tentativas. Tente novamente em instantes.") =>
  new AppError(msg, 429, "TOO_MANY_REQUESTS");

const internal = (msg = "Erro interno do servidor") =>
  new AppError(msg, 500, "INTERNAL_ERROR");

module.exports = {
  AppError,
  badRequest,
  unauthorized,
  forbidden,
  notFound,
  conflict,
  tooManyRequests,
  internal
};
