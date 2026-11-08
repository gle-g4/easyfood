process.env.LOG_LEVEL = "silent";

const sharp = require("sharp");
const fs = require("fs/promises");
const os = require("os");
const path = require("path");

const {
  optimizeImage,
  handler,
  ImagemInvalidaError,
  LARGURA_MAXIMA,
  TAMANHO_MAXIMO_BYTES
} = require("../src/functions/optimizeImage/handler");
const serverless = require("../src/shared/serverless/simulator");

let passou = 0;
let falhou = 0;

function checar(descricao, condicao, extra = "") {
  if (condicao) {
    passou++;
    console.log(`  \x1b[32m✓\x1b[0m ${descricao}`);
  } else {
    falhou++;
    console.log(`  \x1b[31m✗\x1b[0m ${descricao} ${extra}`);
  }
}

async function rejeita(promessa) {
  try {
    await promessa;
    return null;
  } catch (erro) {
    return erro;
  }
}

function criarImagem(largura, altura, formato = "jpeg", extra = {}) {
  const canais = 3;
  const pixels = Buffer.alloc(largura * altura * canais);
  for (let i = 0; i < pixels.length; i++) pixels[i] = (i * 7 + ((i / 3) | 0) * 13) & 255;
  return sharp(pixels, { raw: { width: largura, height: altura, channels: canais } })
    [formato](extra)
    .toBuffer();
}

async function main() {
  console.log("\n\x1b[1mEasyFood — função optimizeImage\x1b[0m\n");

  console.log("Otimização");
  const grande = await criarImagem(3200, 2400, "jpeg", { quality: 95 });
  const otimizada = await optimizeImage(grande);
  const meta = await sharp(otimizada).metadata();
  checar("reduz a largura para o máximo (800px)", meta.width === LARGURA_MAXIMA, `(deu ${meta.width})`);
  checar("mantém a proporção (800x600 a partir de 3200x2400)", meta.height === 600, `(deu ${meta.height})`);
  checar("converte para WebP", meta.format === "webp");
  checar("arquivo final é menor que o original", otimizada.length < grande.length);

  const pequena = await criarImagem(400, 300, "png");
  const metaPequena = await sharp(await optimizeImage(pequena)).metadata();
  checar("não amplia imagem pequena (withoutEnlargement)", metaPequena.width === 400, `(deu ${metaPequena.width})`);

  const png = await criarImagem(1600, 1200, "png");
  checar("aceita PNG", (await sharp(await optimizeImage(png)).metadata()).format === "webp");

  console.log("\nSegurança e validação");
  let erro = await rejeita(optimizeImage(Buffer.from("isto nao e uma imagem")));
  checar("recusa arquivo que não é imagem (valida o conteúdo)", erro instanceof ImagemInvalidaError);

  erro = await rejeita(optimizeImage(Buffer.alloc(0)));
  checar("recusa entrada vazia", erro instanceof ImagemInvalidaError);

  erro = await rejeita(optimizeImage(Buffer.alloc(TAMANHO_MAXIMO_BYTES + 1)));
  checar("recusa arquivo acima do teto de segurança", erro instanceof ImagemInvalidaError);

  const gif = await sharp(await criarImagem(50, 50), {}).gif().toBuffer();
  erro = await rejeita(optimizeImage(gif));
  checar("recusa formato fora de PNG/JPG/WEBP (GIF)", erro instanceof ImagemInvalidaError);

  const comExif = await sharp(await criarImagem(300, 200))
    .withMetadata({ exif: { IFD0: { Copyright: "dado-privado" } } })
    .jpeg()
    .toBuffer();
  const semExif = await sharp(await optimizeImage(comExif)).metadata();
  checar("remove metadados EXIF da imagem de saída", !semExif.exif);

  console.log("\nHandler no formato FaaS (evento -> arquivo)");
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "easyfood-img-"));
  const entrada = path.join(tmp, "logo.jpg");
  await fs.writeFile(entrada, grande);
  const resultado = await handler({ inputPath: entrada, outputDir: path.join(tmp, "out") });
  checar("grava <nome>.webp no diretório de saída", resultado.outputPath.endsWith("logo.webp"));
  checar("informa o percentual de redução", resultado.reducaoPercentual > 0);
  checar("o arquivo de saída existe e é menor", (await fs.stat(resultado.outputPath)).size === resultado.bytesDepois);
  erro = await rejeita(handler({}));
  checar("evento sem inputPath/outputDir é rejeitado", erro instanceof ImagemInvalidaError);
  await fs.rm(tmp, { recursive: true, force: true });

  console.log("\nSimulador FaaS (cold start, concorrência, timeout)");
  process.env.FAAS_COLD_START_MS = "200";
}

async function simulador() {
  delete require.cache[require.resolve("../src/shared/serverless/simulator")];
  process.env.FAAS_COLD_START_MS = "200";
  const sim = require("../src/shared/serverless/simulator");

  sim.registrar("rapida", async () => "ok");
  const fria = await sim.invocar("rapida", {});
  const quente = await sim.invocar("rapida", {});
  checar("1ª chamada é cold start", fria.tipo === "cold" && fria.duracaoMs >= 190, `(${fria.tipo} ${fria.duracaoMs}ms)`);
  checar("2ª chamada é warm start e mais rápida", quente.tipo === "warm" && quente.duracaoMs < fria.duracaoMs);
  sim.esfriar("rapida");
  checar("depois de esfriar, volta a ser cold start", (await sim.invocar("rapida", {})).tipo === "cold");

  sim.registrar("lenta", () => new Promise((r) => setTimeout(r, 300)), { limiteConcorrencia: 2 });
  await sim.invocar("lenta", {});
  const rajada = await Promise.all([1, 2, 3, 4].map(() => sim.invocar("lenta", {})));
  const throttled = rajada.filter((r) => r.status === "THROTTLED").length;
  checar("acima do limite de concorrência há throttling", throttled === 2, `(throttled: ${throttled})`);

  sim.registrar("travada", () => new Promise(() => {}), { timeoutMs: 150 });
  const estourou = await sim.invocar("travada", {});
  checar("função que passa do timeout é interrompida", estourou.status === "ERRO" && /Timeout/.test(estourou.erro));

  sim.registrar("quebrada", async () => {
    throw new Error("boom");
  });
  const quebrou = await sim.invocar("quebrada", {});
  checar("erro dentro da função não derruba quem invocou", quebrou.status === "ERRO");
}

main()
  .then(simulador)
  .then(() => {
    console.log(
      `\n\x1b[1mResultado:\x1b[0m \x1b[32m${passou} passaram\x1b[0m` +
        (falhou ? `, \x1b[31m${falhou} falharam\x1b[0m` : "") +
        "\n"
    );
    process.exit(falhou ? 1 : 0);
  })
  .catch((erro) => {
    console.error("Falha no teste:", erro);
    process.exit(1);
  });
