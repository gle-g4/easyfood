require("dotenv").config();

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

  corsOrigins: optional("CORS_ORIGINS", "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean),

  email: {
    provider: optional(
      "EMAIL_PROVIDER",
      optional("EMAIL_API_KEY", null) ? "resend" : "console"
    ).toLowerCase(),
    apiKey: optional("EMAIL_API_KEY", null),
    from: optional("EMAIL_FROM", "onboarding@resend.dev"),
    fromName: optional("EMAIL_FROM_NAME", "EasyFood"),
    testTo: optional("EMAIL_TO_TEST", null),
    commercialTo: optional("EMAIL_TO_COMMERCIAL", null),
    simulateFailure: optional("EMAIL_SIMULATE_FAILURE", "false") === "true"
  },

  rateLimit: {
    janelaMs: Number(optional("RATE_LIMIT_WINDOW_MS", "60000")),
    login: Number(optional("RATE_LIMIT_LOGIN", "5")),
    register: Number(optional("RATE_LIMIT_REGISTER", "10"))
  },

  auth: {
    provider: AUTH_PROVIDER,

    jwtSecret: optional("JWT_SECRET", "dev-secret-trocar-em-producao"),
    jwtExpiresIn: optional("JWT_EXPIRES_IN", "1d"),

    cognito: {
      region: optional("COGNITO_REGION", "us-east-1"),
      userPoolId: optional("COGNITO_USER_POOL_ID", null),
      clientId: optional("COGNITO_CLIENT_ID", null),
      clientSecret: optional("COGNITO_CLIENT_SECRET", null)
    }
  }
};

if (env.auth.provider === "cognito") {
  if (!env.auth.cognito.userPoolId || !env.auth.cognito.clientId) {
    throw new Error(
      "AUTH_PROVIDER=cognito exige COGNITO_USER_POOL_ID e COGNITO_CLIENT_ID no .env"
    );
  }
}

if (!["resend", "console"].includes(env.email.provider)) {
  throw new Error(
    `EMAIL_PROVIDER inválido: "${env.email.provider}". Use "resend" ou "console".`
  );
}

if (env.email.provider === "resend" && !env.email.apiKey) {
  throw new Error("EMAIL_PROVIDER=resend exige EMAIL_API_KEY no .env");
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
