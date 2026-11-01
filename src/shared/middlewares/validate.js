const { badRequest } = require("../errors/AppError");

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

    if (source === "query") {
      req.validatedQuery = result.data;
    } else {
      req[source] = result.data;
    }

    next();
  };
}

module.exports = validate;
