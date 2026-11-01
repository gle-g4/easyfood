const { z } = require("zod");

const CATEGORIAS = [
  "Italiana",
  "Japonesa",
  "Brasileira",
  "Mexicana",
  "Árabe",
  "Vegetariana",
  "Fast Food",
  "Cafeteria",
  "Outra"
];

const criarRestauranteSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Nome deve ter ao menos 2 caracteres")
    .max(120, "Nome muito longo"),
  category: z.enum(CATEGORIAS, {
    errorMap: () => ({
      message: `Categoria inválida. Use uma de: ${CATEGORIAS.join(", ")}`
    })
  }),
  rating: z
    .number()
    .min(0, "Nota mínima é 0")
    .max(5, "Nota máxima é 5")
    .default(0)
});

const atualizarRestauranteSchema = criarRestauranteSchema
  .partial()
  .refine((dados) => Object.keys(dados).length > 0, {
    message: "Envie ao menos um campo para atualizar"
  });

const listarQuerySchema = z.object({
  pagina: z.coerce.number().int().min(1).default(1),
  limite: z.coerce.number().int().min(1).max(100).default(10),
  categoria: z.string().trim().optional(),
  busca: z.string().trim().min(1).max(120).optional(),
  notaMinima: z.coerce.number().min(0).max(5).optional()
});

const idParamSchema = z.object({
  id: z.coerce.number().int().positive("ID inválido")
});

module.exports = {
  CATEGORIAS,
  criarRestauranteSchema,
  atualizarRestauranteSchema,
  listarQuerySchema,
  idParamSchema
};
