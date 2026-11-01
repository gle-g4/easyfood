const multer = require("multer");
const { AppError, badRequest } = require("../../shared/errors/AppError");

const LIMITE_UPLOAD_BYTES = 5 * 1024 * 1024;

const multerUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: LIMITE_UPLOAD_BYTES, files: 1 }
}).single("image");

function uploadImagem(req, res, next) {
  multerUpload(req, res, (erro) => {
    if (erro instanceof multer.MulterError) {
      if (erro.code === "LIMIT_FILE_SIZE") {
        return next(new AppError("Imagem maior que 5 MB.", 413, "PAYLOAD_TOO_LARGE"));
      }
      return next(badRequest('Envie um único arquivo no campo "image".'));
    }
    if (erro) return next(erro);
    if (!req.file) {
      return next(badRequest('Nenhuma imagem enviada. Use multipart/form-data com o campo "image".'));
    }
    next();
  });
}

module.exports = { uploadImagem, LIMITE_UPLOAD_BYTES };
