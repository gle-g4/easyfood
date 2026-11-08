const logger = require("../logger");

const JANELA_AQUECIMENTO_MS = Number(process.env.FAAS_WARM_WINDOW_MS || 5 * 60 * 1000);
const COLD_START_MS = Number(process.env.FAAS_COLD_START_MS || 900);
const LIMITE_CONCORRENCIA_PADRAO = 5;
const TIMEOUT_PADRAO_MS = 10_000;

const funcoes = new Map();

function registrar(nome, handler, opcoes = {}) {
  funcoes.set(nome, {
    handler,
    limiteConcorrencia: opcoes.limiteConcorrencia || LIMITE_CONCORRENCIA_PADRAO,
    timeoutMs: opcoes.timeoutMs || TIMEOUT_PADRAO_MS,
    ultimaExecucaoEm: 0,
    emAndamento: 0
  });
}

const estaQuente = (fn) => Date.now() - fn.ultimaExecucaoEm < JANELA_AQUECIMENTO_MS;
const aguardar = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function invocar(nome, evento) {
  const fn = funcoes.get(nome);
  if (!fn) throw new Error(`Função serverless "${nome}" não registrada.`);

  if (fn.emAndamento >= fn.limiteConcorrencia) {
    logger.warn("throttling: limite de concorrência atingido", {
      funcao: nome,
      limite: fn.limiteConcorrencia
    });
    return { status: "THROTTLED", funcao: nome };
  }

  const frio = !estaQuente(fn);
  fn.emAndamento += 1;
  const inicio = Date.now();
  let timer;

  try {
    if (frio) await aguardar(COLD_START_MS);

    const timeout = new Promise((_, reject) => {
      timer = setTimeout(
        () => reject(new Error(`Timeout de ${fn.timeoutMs}ms excedido`)),
        fn.timeoutMs
      );
    });

    const resultado = await Promise.race([fn.handler(evento), timeout]);
    fn.ultimaExecucaoEm = Date.now();

    return {
      status: "SUCESSO",
      funcao: nome,
      tipo: frio ? "cold" : "warm",
      duracaoMs: Date.now() - inicio,
      resultado
    };
  } catch (error) {
    logger.error("função serverless falhou", { funcao: nome, erro: error.message });
    return {
      status: "ERRO",
      funcao: nome,
      tipo: frio ? "cold" : "warm",
      duracaoMs: Date.now() - inicio,
      erro: error.message
    };
  } finally {
    clearTimeout(timer);
    fn.emAndamento -= 1;
  }
}

function esfriar(nome) {
  const fn = funcoes.get(nome);
  if (fn) fn.ultimaExecucaoEm = 0;
}

module.exports = { registrar, invocar, esfriar };
