const { env } = require("../../../config/env");
const { assertProvider } = require("./auth.provider");
const logger = require("../../../shared/logger");

function criarAuthProvider() {
  let provider;

  switch (env.auth.provider) {
    case "cognito":
      provider = require("./cognito.provider");
      break;

    case "local":
      provider = require("./local.provider");
      break;

    default:
      throw new Error(
        `Provider de autenticação desconhecido: ${env.auth.provider}`
      );
  }

  assertProvider(provider);

  logger.info("provider de autenticação carregado", {
    provider: provider.name
  });

  return provider;
}

const authProvider = criarAuthProvider();

module.exports = authProvider;
