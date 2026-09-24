require("dotenv").config();

/**
 * Configuração centralizada.
 *
 * DIFERENCIAL: em vez de espalhar `process.env.X` por todo o código,
 * as variáveis são lidas e VALIDADAS em um único ponto, na subida da
 * aplicação. Se faltar algo essencial, o processo falha imediatamente
 * (fail-fast) em vez de quebrar só quando alguém chamar o endpoint.
 */

function required(key) {
  const value = process.env[key];
  if (!value || value.trim() === "") {
    throw new Error(
      `Variável de ambiente obrigatória ausente: ${key}. ` +
        `Confira seu arquivo .env (use .env.example como base).`
    );
  }
  return value.trim();
}

function optional(key, fallback) {
  const value = process.env[key];
  return value && value.trim() !== "" ? value.trim() : fallback;
}

const AUTH_PROVIDER = optional("AUTH_PROVIDER", "local").toLowerCase();

if (!["cognito", "local"].includes(AUTH_PROVIDER)) {
  throw new Error(
    `AUTH_PROVIDER inválido: "${AUTH_PROVIDER}". Use "cognito" ou "local".`
  );
}

const env = {
  nodeEnv: optional("NODE_ENV", "development"),
  port: Number(optional("PORT", "3000")),
  databaseUrl: required("DATABASE_URL"),

  // Lista de origens liberadas no CORS, separadas por vírgula.
  // Vazio = libera todas (aceitável só em desenvolvimento).
  corsOrigins: optional("CORS_ORIGINS", "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean),

  // Limites de requisição, ajustáveis sem tocar no código.
  rateLimit: {
    janelaMs: Number(optional("RATE_LIMIT_WINDOW_MS", "60000")),
    login: Number(optional("RATE_LIMIT_LOGIN", "5")),
    register: Number(optional("RATE_LIMIT_REGISTER", "10"))
  },

  auth: {
    provider: AUTH_PROVIDER,

    // Usado apenas quando AUTH_PROVIDER=local
    jwtSecret: optional("JWT_SECRET", "dev-secret-trocar-em-producao"),
    jwtExpiresIn: optional("JWT_EXPIRES_IN", "1d"),

    // Usado apenas quando AUTH_PROVIDER=cognito
    cognito: {
      region: optional("COGNITO_REGION", "us-east-1"),
      userPoolId: optional("COGNITO_USER_POOL_ID", null),
      clientId: optional("COGNITO_CLIENT_ID", null),
      clientSecret: optional("COGNITO_CLIENT_SECRET", null)
    }
  }
};

// Validação condicional: só exige credenciais do Cognito se ele for o provider ativo.
if (env.auth.provider === "cognito") {
  if (!env.auth.cognito.userPoolId || !env.auth.cognito.clientId) {
    throw new Error(
      "AUTH_PROVIDER=cognito exige COGNITO_USER_POOL_ID e COGNITO_CLIENT_ID no .env"
    );
  }
}

const isProduction = env.nodeEnv === "production";

if (isProduction && env.auth.provider === "local") {
  if (env.auth.jwtSecret === "dev-secret-trocar-em-producao") {
    throw new Error(
      "JWT_SECRET padrão detectado em produção. Defina um segredo forte."
    );
  }
}

module.exports = { env, isProduction };
