const { env } = require("../../../config/env");
const { assertProvider } = require("./auth.provider");
const logger = require("../../../shared/logger");

/**
 * FACTORY DO PROVIDER
 *
 * Este é o ÚNICO lugar do projeto que sabe quais implementações existem.
 * Todo o resto da aplicação importa daqui e recebe "um provider", sem
 * saber qual. Adicionar um provider novo (Auth0, Firebase, Keycloak)
 * significa criar um arquivo e acrescentar uma linha aqui — nada mais.
 *
 * O require é feito dentro do switch de propósito: assim o SDK da AWS só
 * é carregado quando o Cognito é realmente o provider ativo, o que deixa
 * a subida em modo local mais rápida e leve.
 */
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

// Instância única para toda a aplicação.
const authProvider = criarAuthProvider();

module.exports = authProvider;
