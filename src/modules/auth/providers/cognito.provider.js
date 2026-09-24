const crypto = require("crypto");
const {
  CognitoIdentityProviderClient,
  SignUpCommand,
  InitiateAuthCommand,
  GlobalSignOutCommand,
  ConfirmSignUpCommand,
  ResendConfirmationCodeCommand
} = require("@aws-sdk/client-cognito-identity-provider");
const { CognitoJwtVerifier } = require("aws-jwt-verify");

const { env } = require("../../../config/env");
const {
  AppError,
  badRequest,
  unauthorized,
  conflict,
  tooManyRequests
} = require("../../../shared/errors/AppError");
const logger = require("../../../shared/logger");

/**
 * PROVIDER: AWS COGNITO
 * =====================
 *
 * Por que Cognito (ver docs/ADR-004-autenticacao.md):
 *  - A EasyFood não quer ser dona do problema "guardar senha com segurança".
 *    Hash, salt, política de senha, rotação, MFA e recuperação de conta são
 *    problemas resolvidos — e caros de errar.
 *  - Nosso banco NUNCA armazena senha. Isso reduz drasticamente o impacto
 *    de um vazamento do PostgreSQL.
 *  - MFA, login social e fluxo de "esqueci minha senha" ficam disponíveis
 *    por configuração, sem código novo.
 *
 * DIFERENCIAL TÉCNICO IMPORTANTE:
 * A validação do token é feita LOCALMENTE via JWKS (aws-jwt-verify), e não
 * chamando a AWS a cada requisição. O Cognito publica suas chaves públicas;
 * a biblioteca baixa e cacheia essas chaves e verifica a assinatura em
 * memória. Isso significa:
 *   - zero latência de rede por requisição autenticada;
 *   - a API continua validando tokens mesmo em instabilidade da AWS;
 *   - sem custo por chamada de verificação.
 */

const { region, userPoolId, clientId, clientSecret } = env.auth.cognito;

const client = new CognitoIdentityProviderClient({ region });

// O verificador é criado uma única vez e reaproveitado (cacheia o JWKS).
const verifier = CognitoJwtVerifier.create({
  userPoolId,
  clientId,
  tokenUse: "access"
});

/**
 * Quando o App Client do Cognito é criado COM secret, toda chamada precisa
 * de um SECRET_HASH = HMAC-SHA256(username + clientId, clientSecret).
 * Muita gente trava aqui; por isso está encapsulado e é opcional.
 */
function secretHash(username) {
  if (!clientSecret) return undefined;
  return crypto
    .createHmac("sha256", clientSecret)
    .update(username + clientId)
    .digest("base64");
}

function comSecret(params, username) {
  const hash = secretHash(username);
  return hash ? { ...params, SecretHash: hash } : params;
}

/**
 * Traduz os erros da AWS para os erros de domínio da EasyFood.
 * Assim o resto da aplicação nunca precisa conhecer nomes de erro da AWS.
 */
function traduzirErro(error) {
  const nome = error.name || error.__type;

  const mapa = {
    UsernameExistsException: conflict("Este e-mail já está cadastrado."),
    NotAuthorizedException: unauthorized("E-mail ou senha inválidos."),
    UserNotFoundException: unauthorized("E-mail ou senha inválidos."),
    UserNotConfirmedException: new AppError(
      "Conta ainda não confirmada. Verifique o código enviado ao seu e-mail.",
      403,
      "USER_NOT_CONFIRMED"
    ),
    CodeMismatchException: badRequest("Código de confirmação inválido."),
    ExpiredCodeException: badRequest("Código de confirmação expirado."),
    InvalidPasswordException: badRequest(
      "Senha fora da política exigida (mínimo 8 caracteres, com maiúscula, minúscula e número)."
    ),
    InvalidParameterException: badRequest("Parâmetros inválidos para o cadastro."),
    TooManyRequestsException: tooManyRequests(),
    LimitExceededException: tooManyRequests(
      "Limite de tentativas excedido. Aguarde alguns minutos."
    )
  };

  if (mapa[nome]) return mapa[nome];

  // Erro desconhecido: loga o detalhe, mas não vaza para o cliente.
  logger.error("erro não mapeado do Cognito", {
    cognitoError: nome,
    detalhe: error.message
  });

  return new AppError(
    "Falha no serviço de autenticação.",
    502,
    "AUTH_PROVIDER_ERROR"
  );
}

const cognitoProvider = {
  name: "cognito",

  async register({ name, email, password }) {
    try {
      const command = new SignUpCommand(
        comSecret(
          {
            ClientId: clientId,
            Username: email,
            Password: password,
            UserAttributes: [
              { Name: "email", Value: email },
              { Name: "name", Value: name }
            ]
          },
          email
        )
      );

      const resposta = await client.send(command);

      return {
        id: resposta.UserSub,
        email,
        name,
        // Se o pool exige verificação de e-mail, vem false e o usuário
        // precisa confirmar com o código antes de conseguir logar.
        confirmado: Boolean(resposta.UserConfirmed)
      };
    } catch (error) {
      throw traduzirErro(error);
    }
  },

  /**
   * Fluxo extra que o provider local não tem: confirmação de conta por
   * código enviado ao e-mail. Mostra que providers podem ter capacidades
   * próprias além do contrato mínimo.
   */
  async confirmarCadastro({ email, codigo }) {
    try {
      await client.send(
        new ConfirmSignUpCommand(
          comSecret(
            {
              ClientId: clientId,
              Username: email,
              ConfirmationCode: codigo
            },
            email
          )
        )
      );
      return { confirmado: true };
    } catch (error) {
      throw traduzirErro(error);
    }
  },

  async reenviarCodigo({ email }) {
    try {
      await client.send(
        new ResendConfirmationCodeCommand(
          comSecret({ ClientId: clientId, Username: email }, email)
        )
      );
      return { enviado: true };
    } catch (error) {
      throw traduzirErro(error);
    }
  },

  async login({ email, password }) {
    try {
      const resposta = await client.send(
        new InitiateAuthCommand({
          AuthFlow: "USER_PASSWORD_AUTH",
          ClientId: clientId,
          AuthParameters: comSecret(
            { USERNAME: email, PASSWORD: password },
            email
          )
        })
      );

      const r = resposta.AuthenticationResult;

      if (!r) {
        // Acontece quando o Cognito exige um desafio (MFA, troca de senha).
        throw new AppError(
          `Autenticação exige etapa adicional: ${resposta.ChallengeName}`,
          403,
          "AUTH_CHALLENGE_REQUIRED"
        );
      }

      return {
        accessToken: r.AccessToken,
        refreshToken: r.RefreshToken,
        idToken: r.IdToken,
        expiraEm: r.ExpiresIn,
        tipo: r.TokenType || "Bearer"
      };
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw traduzirErro(error);
    }
  },

  /**
   * Verificação 100% local via JWKS — sem chamada de rede por requisição.
   */
  async verifyToken(token) {
    try {
      const payload = await verifier.verify(token);

      return {
        sub: payload.sub,
        email: payload.email || payload.username,
        name: payload.name,
        // Grupos do Cognito viram os papéis (roles) da aplicação.
        grupos: payload["cognito:groups"] || [],
        provider: "cognito"
      };
    } catch (error) {
      logger.warn("token do Cognito rejeitado", { motivo: error.message });
      throw unauthorized("Token inválido ou expirado.");
    }
  },

  async refresh(refreshToken) {
    try {
      const resposta = await client.send(
        new InitiateAuthCommand({
          AuthFlow: "REFRESH_TOKEN_AUTH",
          ClientId: clientId,
          AuthParameters: { REFRESH_TOKEN: refreshToken }
        })
      );

      const r = resposta.AuthenticationResult;

      return {
        accessToken: r.AccessToken,
        expiraEm: r.ExpiresIn,
        tipo: r.TokenType || "Bearer"
      };
    } catch (error) {
      throw traduzirErro(error);
    }
  },

  /**
   * Revogação real de sessão — algo que JWT local puro não consegue fazer.
   */
  async logout({ accessToken }) {
    try {
      await client.send(
        new GlobalSignOutCommand({ AccessToken: accessToken })
      );
      return { encerrado: true };
    } catch (error) {
      throw traduzirErro(error);
    }
  }
};

module.exports = cognitoProvider;
