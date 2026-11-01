const fs = require("fs/promises");
const path = require("path");
const sharp = require("sharp");

process.env.LOG_LEVEL ||= "warn";

const serverless = require("../src/shared/serverless/simulator");
const optimizeFunction = require("../src/functions/optimizeImage/handler");

const RAIZ = path.join(__dirname, "..", "storage");
const ORIGINAL = path.join(RAIZ, "original");
const OTIMIZADA = path.join(RAIZ, "optimized");

const mb = (bytes) => `${(bytes / 1024 / 1024).toFixed(2)} MB`;
const kb = (bytes) => `${(bytes / 1024).toFixed(0)} KB`;
const tamanho = (bytes) => (bytes > 1024 * 1024 ? mb(bytes) : kb(bytes));

async function gerarImagemExemplo(destino) {
  const largura = 4000;
  const altura = 3000;
  const bloco = 5;
  const colunas = Math.ceil(largura / bloco);
  const linhas = Math.ceil(altura / bloco);
  const textura = Buffer.alloc(colunas * linhas * 3);
  for (let i = 0; i < textura.length; i++) textura[i] = (Math.random() * 120) | 0;

  const pixels = Buffer.alloc(largura * altura * 3);
  for (let y = 0; y < altura; y++) {
    for (let x = 0; x < largura; x++) {
      const i = (y * largura + x) * 3;
      const t = (((y / bloco) | 0) * colunas + ((x / bloco) | 0)) * 3;
      pixels[i] = ((x / largura) * 135 + textura[t]) & 255;
      pixels[i + 1] = ((y / altura) * 120 + textura[t + 1]) & 255;
      pixels[i + 2] = (((x + y) / (largura + altura)) * 135 + textura[t + 2]) & 255;
    }
  }
  await sharp(pixels, { raw: { width: largura, height: altura, channels: 3 } })
    .jpeg({ quality: 95 })
    .toFile(destino);
}

async function main() {
  await fs.mkdir(ORIGINAL, { recursive: true });
  await fs.mkdir(OTIMIZADA, { recursive: true });

  let entrada = process.argv[2];

  if (!entrada) {
    entrada = path.join(ORIGINAL, "foto-exemplo.jpg");
    console.log("Gerando imagem de exemplo 4000x3000 (pode levar alguns segundos)...");
    await gerarImagemExemplo(entrada);
  } else {
    const copia = path.join(ORIGINAL, path.basename(entrada));
    await fs.copyFile(entrada, copia);
    entrada = copia;
  }

  const info = await sharp(entrada).metadata();
  const tamanhoOriginal = (await fs.stat(entrada)).size;

  console.log("\nEVENTO: nova imagem no armazenamento");
  console.log(`  ${path.relative(process.cwd(), entrada)}  ${tamanho(tamanhoOriginal)}  ${info.width}x${info.height}px`);

  serverless.registrar("optimizeImage", optimizeFunction.handler, { timeoutMs: 20_000 });

  const evento = { inputPath: entrada, outputDir: OTIMIZADA };

  console.log("\nTRIGGER -> EXECUÇÃO #1 (ambiente frio)");
  const primeira = await serverless.invocar("optimizeImage", evento);

  console.log("TRIGGER -> EXECUÇÃO #2 (ambiente reaproveitado)");
  const segunda = await serverless.invocar("optimizeImage", evento);

  for (const [n, r] of [[1, primeira], [2, segunda]]) {
    if (r.status !== "SUCESSO") {
      console.log(`\n#${n}: ${r.status} ${r.erro || ""}`);
      process.exitCode = 1;
      return;
    }
  }

  const saida = await sharp(primeira.resultado.outputPath).metadata();

  console.log("\nRESULTADO");
  console.log(`  antes : ${tamanho(primeira.resultado.bytesAntes)}  ${info.width}x${info.height}px`);
  console.log(`  depois: ${tamanho(primeira.resultado.bytesDepois)}  ${saida.width}x${saida.height}px  (${saida.format})`);
  console.log(`  redução: ${primeira.resultado.reducaoPercentual}%`);
  console.log(`  arquivo: ${path.relative(process.cwd(), primeira.resultado.outputPath)}`);

  console.log("\nCOLD START x WARM START");
  console.log(`  execução #1 (${primeira.tipo}): ${primeira.duracaoMs} ms`);
  console.log(`  execução #2 (${segunda.tipo}): ${segunda.duracaoMs} ms`);
  console.log(`  custo extra do cold start: ~${primeira.duracaoMs - segunda.duracaoMs} ms\n`);
}

main().catch((erro) => {
  console.error("Falha:", erro.message);
  process.exit(1);
});
