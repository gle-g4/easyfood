const { AppError } = require("../../../shared/errors/AppError");

function naoSuportado(provider, metodo) {
  return new AppError(
    `A operação "${metodo}" não é suportada pelo provider "${provider}".`,
    501,
    "NOT_SUPPORTED"
  );
}

const METODOS_OBRIGATORIOS = ["register", "login", "verifyToken"];

function assertProvider(provider) {
  if (!provider || typeof provider !== "object") {
    throw new Error("Provider de autenticação inválido.");
  }

  for (const metodo of METODOS_OBRIGATORIOS) {
    if (typeof provider[metodo] !== "function") {
      throw new Error(
        `Provider "${provider.name || "?"}" não implementa o método obrigatório "${metodo}()".`
      );
    }
  }

  return provider;
}

module.exports = { assertProvider, naoSuportado };
