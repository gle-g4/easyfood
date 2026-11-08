const fs = require("fs/promises");
const path = require("path");
const { randomUUID } = require("crypto");

const { optimizeImage, ImagemInvalidaError } = require("../../functions/optimizeImage/handler");
const { badRequest } = require("../../shared/errors/AppError");
const logger = require("../../shared/logger");

const STORAGE_DIR = process.env.STORAGE_DIR || path.join(__dirname, "../../../storage");
const OTIMIZADAS = path.join(STORAGE_DIR, "optimized");
const NOME_VALIDO = /^[0-9a-f-]{36}\.webp$/;

async function salvar(buffer) {
  let otimizada;
  try {
    otimizada = await optimizeImage(buffer);
  } catch (erro) {
    if (erro instanceof ImagemInvalidaError) throw badRequest(erro.message);
    throw erro;
  }

  const nome = `${randomUUID()}.webp`;
  await fs.mkdir(OTIMIZADAS, { recursive: true });
  await fs.writeFile(path.join(OTIMIZADAS, nome), otimizada);
  return `/uploads/${nome}`;
}

async function remover(url) {
  if (!url) return;
  const nome = path.basename(url);
  if (!NOME_VALIDO.test(nome)) return;
  try {
    await fs.unlink(path.join(OTIMIZADAS, nome));
  } catch (erro) {
    if (erro.code !== "ENOENT") logger.warn("não foi possível remover imagem antiga", { nome, erro: erro.message });
  }
}

async function trocarImagem({ buffer, imagemAtual, persistir }) {
  const url = await salvar(buffer);
  let resultado;
  try {
    resultado = await persistir(url);
  } catch (erro) {
    await remover(url);
    throw erro;
  }
  await remover(imagemAtual);
  return resultado;
}

module.exports = { salvar, remover, trocarImagem, OTIMIZADAS };
