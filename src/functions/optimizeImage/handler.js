const fs = require("fs/promises");
const path = require("path");
const sharp = require("sharp");

const LARGURA_MAXIMA = 800;
const QUALIDADE_WEBP = 80;

const TAMANHO_MAXIMO_BYTES = 20 * 1024 * 1024;
const FORMATOS_ACEITOS = ["png", "jpeg", "webp"];
const PIXELS_MAXIMOS = 50_000_000;

class ImagemInvalidaError extends Error {
  constructor(message) {
    super(message);
    this.name = "ImagemInvalidaError";
  }
}

async function validarImagem(inputBuffer) {
  if (!Buffer.isBuffer(inputBuffer) || inputBuffer.length === 0) {
    throw new ImagemInvalidaError("Nenhuma imagem recebida.");
  }

  if (inputBuffer.length > TAMANHO_MAXIMO_BYTES) {
    throw new ImagemInvalidaError(
      `Imagem maior que o limite de ${TAMANHO_MAXIMO_BYTES / 1024 / 1024} MB.`
    );
  }

  let metadata;
  try {
    metadata = await sharp(inputBuffer, { limitInputPixels: PIXELS_MAXIMOS }).metadata();
  } catch {
    throw new ImagemInvalidaError("O arquivo não é uma imagem válida.");
  }

  if (!FORMATOS_ACEITOS.includes(metadata.format)) {
    throw new ImagemInvalidaError(
      `Formato "${metadata.format}" não aceito. Use PNG, JPG ou WEBP.`
    );
  }

  return metadata;
}

async function optimizeImage(inputBuffer) {
  await validarImagem(inputBuffer);

  return sharp(inputBuffer, { limitInputPixels: PIXELS_MAXIMOS })
    .rotate()
    .resize({ width: LARGURA_MAXIMA, withoutEnlargement: true })
    .webp({ quality: QUALIDADE_WEBP })
    .toBuffer();
}

async function handler(event) {
  const { inputPath, outputDir } = event;

  if (!inputPath || !outputDir) {
    throw new ImagemInvalidaError("Evento inválido: informe inputPath e outputDir.");
  }

  const original = await fs.readFile(inputPath);
  const otimizada = await optimizeImage(original);

  await fs.mkdir(outputDir, { recursive: true });
  const nomeBase = path.basename(inputPath, path.extname(inputPath));
  const outputPath = path.join(outputDir, `${nomeBase}.webp`);
  await fs.writeFile(outputPath, otimizada);

  return {
    outputPath,
    bytesAntes: original.length,
    bytesDepois: otimizada.length,
    reducaoPercentual: Number(
      (100 - (otimizada.length / original.length) * 100).toFixed(1)
    )
  };
}

module.exports = {
  optimizeImage,
  validarImagem,
  handler,
  ImagemInvalidaError,
  LARGURA_MAXIMA,
  QUALIDADE_WEBP,
  TAMANHO_MAXIMO_BYTES
};
