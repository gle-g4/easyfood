const { z } = require("zod");

const preco = z.coerce
  .number({ invalid_type_error: "Preço deve ser um número" })
  .positive("Preço deve ser maior que zero")
  .max(99999.99, "Preço acima do limite")
  .transform((v) => Math.round(v * 100) / 100);

const criarPratoSchema = z.object({
  restaurantId: z.coerce.number().int().positive("restaurantId inválido"),
  name: z.string().trim().min(2, "Nome deve ter ao menos 2 caracteres").max(120),
  description: z.string().trim().max(500, "Descrição muito longa").optional(),
  price: preco,
  available: z.boolean().default(true)
});

const atualizarPratoSchema = criarPratoSchema
  .omit({ restaurantId: true })
  .partial()
  .refine((d) => Object.keys(d).length > 0, { message: "Envie ao menos um campo para atualizar" });

const listarPratosQuerySchema = z.object({
  restaurantId: z.coerce.number().int().positive().optional(),
  pagina: z.coerce.number().int().min(1).default(1),
  limite: z.coerce.number().int().min(1).max(100).default(10),
  busca: z.string().trim().min(1).max(120).optional()
});

const criarPratoNoRestauranteSchema = criarPratoSchema.omit({ restaurantId: true });

const restaurantIdParamSchema = z.object({ restaurantId: z.coerce.number().int().positive("restaurantId inválido") });

const idParamSchema = z.object({ id: z.coerce.number().int().positive("ID inválido") });

module.exports = { criarPratoNoRestauranteSchema, restaurantIdParamSchema, criarPratoSchema, atualizarPratoSchema, listarPratosQuerySchema, idParamSchema };
