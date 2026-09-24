/**
 * DIFERENCIAL: erros de negócio como objetos de primeira classe.
 *
 * Sem isso, cada controller precisa de try/catch com `res.status(...)`
 * espalhado. Com AppError, o Service apenas *lança* o erro descrevendo o
 * que aconteceu, e um único middleware (errorHandler) decide como aquilo
 * vira resposta HTTP. O Service continua sem conhecer HTTP.
 */
class AppError extends Error {
  /**
   * @param {string} message  mensagem segura para exibir ao cliente
   * @param {number} statusCode  status HTTP
   * @param {string} code  código semântico estável (para o front tratar)
   * @param {object} [details]  informações extras (ex.: campos inválidos)
   */
  constructor(message, statusCode = 400, code = "BAD_REQUEST", details = null) {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = true; // erro esperado, não é bug
    Error.captureStackTrace(this, this.constructor);
  }
}

// Atalhos para os casos mais comuns — deixam o Service muito mais legível.
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
