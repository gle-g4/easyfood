const { badRequest } = require("../errors/AppError");

/**
 * DIFERENCIAL: validação declarativa com Zod, aplicada como middleware.
 *
 * Na versão da aula, a validação vive dentro do Controller como `if (!name ...)`.
 * Isso funciona, mas mistura duas responsabilidades e não escala: com 10 campos,
 * o controller vira uma parede de ifs.
 *
 * Aqui o schema descreve o contrato de entrada em um só lugar, e o middleware
 * valida ANTES de o controller rodar. O controller passa a receber dados já
 * limpos, tipados e com valores padrão aplicados.
 *
 * Bônus: o dado validado substitui req.body/query, então é impossível o
 * controller usar por engano um campo não validado (proteção contra
 * mass assignment).
 */
function validate(schema, source = "body") {
  return (req, _res, next) => {
    const result = schema.safeParse(req[source]);

    if (!result.success) {
      const details = result.error.issues.map((issue) => ({
        campo: issue.path.join(".") || "(raiz)",
        erro: issue.message
      }));

      return next(
        badRequest("Dados de entrada inválidos", details)
      );
    }

    // `query` é getter-only no Express 5; usamos um campo próprio nesse caso.
    if (source === "query") {
      req.validatedQuery = result.data;
    } else {
      req[source] = result.data;
    }

    next();
  };
}

module.exports = validate;
