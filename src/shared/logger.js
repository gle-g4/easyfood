const isProduction = process.env.NODE_ENV === "production";

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40, silent: 100 };
const MIN_LEVEL = LEVELS[process.env.LOG_LEVEL] || LEVELS.info;

const REDACTED_KEYS = [
  "password",
  "senha",
  "token",
  "accessToken",
  "refreshToken",
  "idToken",
  "authorization",
  "secret",
  "clientSecret"
];

function redact(value) {
  if (!value || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(redact);

  const clone = {};
  for (const [key, val] of Object.entries(value)) {
    if (REDACTED_KEYS.includes(key)) {
      clone[key] = "[REDACTED]";
    } else if (val && typeof val === "object") {
      clone[key] = redact(val);
    } else {
      clone[key] = val;
    }
  }
  return clone;
}

function write(level, message, meta = {}) {
  if (LEVELS[level] < MIN_LEVEL) return;

  const entry = {
    level,
    time: new Date().toISOString(),
    message,
    ...redact(meta)
  };

  const output = isProduction
    ? JSON.stringify(entry)
    : `[${level.toUpperCase()}] ${entry.time} ${message} ${
        Object.keys(meta).length ? JSON.stringify(redact(meta)) : ""
      }`;

  if (level === "error") console.error(output);
  else if (level === "warn") console.warn(output);
  else console.log(output);
}

module.exports = {
  debug: (msg, meta) => write("debug", msg, meta),
  info: (msg, meta) => write("info", msg, meta),
  warn: (msg, meta) => write("warn", msg, meta),
  error: (msg, meta) => write("error", msg, meta)
};
