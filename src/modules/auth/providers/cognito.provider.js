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

const { region, userPoolId, clientId, clientSecret } = env.auth.cognito;

const client = new CognitoIdentityProviderClient({ region });

const verifier = CognitoJwtVerifier.create({
  userPoolId,
  clientId,
  tokenUse: "access"
});

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
        confirmado: Boolean(resposta.UserConfirmed)
      };
    } catch (error) {
      throw traduzirErro(error);
    }
  },

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

  async verifyToken(token) {
    try {
      const payload = await verifier.verify(token);

      return {
        sub: payload.sub,
        email: payload.email || payload.username,
        name: payload.name,
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
