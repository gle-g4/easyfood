/**
 * DIFERENCIAL: elimina o try/catch repetido em todo controller async.
 *
 * O Express 4 não captura rejeições de Promise automaticamente — se um
 * controller async lança, a requisição trava sem resposta. A solução comum
 * é envolver TODO controller em try/catch (foi o que fizemos na aula).
 *
 * Este wrapper captura a rejeição e encaminha para o errorHandler central.
 * Resultado: o controller fica com só o caminho feliz, muito mais legível.
 *
 *   antes:  async function list(req,res){ try{...}catch(e){res.status(500)...} }
 *   depois: const list = asyncHandler(async (req,res) => { ... });
 */
function asyncHandler(fn) {
  return function wrapped(req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

module.exports = asyncHandler;
