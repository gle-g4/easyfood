const { z } = require("zod");

const senhaForte = z
  .string()
  .min(8, "A senha deve ter ao menos 8 caracteres")
  .max(99, "Senha muito longa")
  .regex(/[a-z]/, "A senha deve conter ao menos uma letra minúscula")
  .regex(/[A-Z]/, "A senha deve conter ao menos uma letra maiúscula")
  .regex(/[0-9]/, "A senha deve conter ao menos um número");

const registerSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Nome deve ter ao menos 2 caracteres")
    .max(120, "Nome muito longo"),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email("E-mail inválido"),
  password: senhaForte
});

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("E-mail inválido"),
  password: z.string().min(1, "Senha é obrigatória")
});

const confirmarSchema = z.object({
  email: z.string().trim().toLowerCase().email("E-mail inválido"),
  codigo: z
    .string()
    .trim()
    .regex(/^\d{6}$/, "O código deve ter 6 dígitos")
});

const reenviarSchema = z.object({
  email: z.string().trim().toLowerCase().email("E-mail inválido")
});

const refreshSchema = z.object({
  refreshToken: z.string().min(10, "Refresh token inválido")
});

module.exports = {
  registerSchema,
  loginSchema,
  confirmarSchema,
  reenviarSchema,
  refreshSchema
};
