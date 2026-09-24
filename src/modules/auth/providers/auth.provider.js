/**
 * CONTRATO DO PROVIDER DE AUTENTICAÇÃO  (Strategy Pattern)
 * ========================================================
 *
 * DIFERENCIAL CENTRAL DO PROJETO.
 *
 * A maioria das implementações amarra a autenticação direto no Service:
 * o Service chama `jwt.sign()` ou chama o Cognito diretamente. O problema
 * é que trocar de provedor depois vira uma cirurgia no código de negócio.
 *
 * Aqui invertemos: o Service depende deste CONTRATO, não de uma
 * implementação. Quem decide se a autenticação é Cognito ou JWT local é
 * uma variável de ambiente (AUTH_PROVIDER), resolvida no factory.
 *
 * Isso é o Princípio da Inversão de Dependência (o "D" de SOLID) aplicado
 * de forma concreta e pequena o bastante para caber em um projeto de aula.
 *
 * Ganhos práticos:
 *  - Desenvolvimento local não exige conta AWS (usa o provider "local").
 *  - Trocar de provedor = mudar 1 linha do .env, zero mudança de negócio.
 *  - Testar o Service fica trivial: injeta-se um provider falso.
 *
 * ---------------------------------------------------------------
 * Toda implementação deve expor os métodos abaixo:
 *
 *   name: string
 *     Identificador do provider ("cognito" | "local").
 *
 *   async register({ name, email, password }) -> { id, email, name, confirmado }
 *     Cria a identidade no provedor de identidade.
 *
 *   async login({ email, password }) -> { accessToken, refreshToken?, expiraEm, usuario }
 *     Autentica e devolve tokens.
 *
 *   async verifyToken(token) -> { sub, email, name?, grupos: string[] }
 *     Valida o token e devolve a identidade. Deve LANÇAR se inválido.
 *
 *   async refresh(refreshToken) -> { accessToken, expiraEm }
 *     Renova o acesso. Pode lançar NOT_SUPPORTED se o provider não suportar.
 *
 *   async logout({ accessToken })
 *     Invalida a sessão, quando o provedor permitir.
 * ---------------------------------------------------------------
 */

const { AppError } = require("../../../shared/errors/AppError");

/**
 * Helper para métodos opcionais não implementados por um provider.
 */
function naoSuportado(provider, metodo) {
  return new AppError(
    `A operação "${metodo}" não é suportada pelo provider "${provider}".`,
    501,
    "NOT_SUPPORTED"
  );
}

/**
 * Valida em tempo de inicialização que a implementação cumpre o contrato.
 * Falha cedo e com mensagem clara, em vez de estourar "undefined is not a
 * function" no meio de uma requisição em produção.
 */
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
