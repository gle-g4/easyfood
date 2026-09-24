const authService = require("./auth.service");
const asyncHandler = require("../../shared/http/asyncHandler");
const { unauthorized } = require("../../shared/errors/AppError");

/**
 * AUTH CONTROLLER
 *
 * Compare com a versão da aula: sem try/catch, sem `if (!campo)`.
 * A validação já aconteceu no middleware `validate`, e os erros são
 * capturados pelo `asyncHandler` + `errorHandler`.
 *
 * Sobra só o essencial: traduzir HTTP → Service → HTTP.
 */

const register = asyncHandler(async (req, res) => {
  const resultado = await authService.register(req.body);

  // 201 quando a conta já está ativa; 202 quando ainda falta confirmar
  // o código de e-mail — o pedido foi aceito mas não está completo.
  const status = resultado.confirmacaoPendente ? 202 : 201;

  res.status(status).json(resultado);
});

const login = asyncHandler(async (req, res) => {
  const resultado = await authService.login(req.body);
  res.status(200).json(resultado);
});

const confirmar = asyncHandler(async (req, res) => {
  const resultado = await authService.confirmarCadastro(req.body);
  res.status(200).json(resultado);
});

const reenviarCodigo = asyncHandler(async (req, res) => {
  const resultado = await authService.reenviarCodigo(req.body);
  res.status(200).json(resultado);
});

const refresh = asyncHandler(async (req, res) => {
  const resultado = await authService.refresh(req.body.refreshToken);
  res.status(200).json(resultado);
});

const logout = asyncHandler(async (req, res) => {
  const header = req.headers.authorization || "";
  const accessToken = header.startsWith("Bearer ") ? header.slice(7) : null;

  if (!accessToken) throw unauthorized("Token não informado.");

  const resultado = await authService.logout({ accessToken });
  res.status(200).json(resultado);
});

/**
 * Rota protegida: devolve o perfil de quem está autenticado.
 * `req.user` foi preenchido pelo middleware authenticate.
 */
const eu = asyncHandler(async (req, res) => {
  const perfil = await authService.perfil(req.user.sub);

  res.status(200).json({
    perfil,
    sessao: {
      provider: req.user.provider,
      grupos: req.user.grupos
    }
  });
});

module.exports = {
  register,
  login,
  confirmar,
  reenviarCodigo,
  refresh,
  logout,
  eu
};
