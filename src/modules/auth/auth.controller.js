const authService = require("./auth.service");
const asyncHandler = require("../../shared/http/asyncHandler");
const { unauthorized } = require("../../shared/errors/AppError");

const register = asyncHandler(async (req, res) => {
  const resultado = await authService.register(req.body);

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

const uploadImagemPerfil = asyncHandler(async (req, res) => {
  const perfil = await authService.atualizarImagemPerfil(req.user.sub, req.file);
  res.status(200).json({ perfil });
});

module.exports = {
  uploadImagemPerfil,
  register,
  login,
  confirmar,
  reenviarCodigo,
  refresh,
  logout,
  eu
};
