# ADR-005 — Serviço de e-mail compartilhado, como ação secundária

- **Status:** ACEITO
- **Data:** 25/10/2026
- **Responsável:** Equipe EasyFood
- **Relacionado a:** ADR-003 (monólito modular), ADR-004 (autenticação)

---

## Contexto

Quando um restaurante é cadastrado, a EasyFood precisa avisar por e-mail:
(1) boas-vindas ao restaurante e (2) uma notificação interna para o comercial.
Daqui para frente, outros módulos (autenticação, pedidos) também vão precisar
enviar e-mail.

O ponto de atenção é onde essa responsabilidade mora. O módulo de restaurantes
**cria restaurantes**; enviar e-mail é outro assunto, e depende de um serviço
externo que pode ficar lento ou indisponível.

## Decisão

1. Criar `src/modules/shared/email.service.js`, exposto ao resto do sistema
   por **uma única função**: `sendEmail({ to, toName, subject, header, body, footer })`.
2. Usar o **Resend** como provedor, chamado por HTTP com `fetch` nativo
   (sem SDK). Toda a conversa com a API fica na função `transportar()`.
3. Tratar o e-mail como **ação secundária**: o restaurante é gravado primeiro
   e a falha do e-mail nunca desfaz nem impede o cadastro.
4. Configuração só por `.env` (`EMAIL_API_KEY`, `EMAIL_FROM`, `EMAIL_FROM_NAME`).

## Alternativas consideradas

| Alternativa | Por que não |
|---|---|
| Chamar a API do provedor direto no `restaurant.service.js` | Restaurantes passaria a conhecer o provedor; cada novo módulo repetiria o código |
| SDK oficial (ex.: `mailersend`) | Funciona, mas adiciona dependência para uma única chamada POST |
| SMTP próprio (nodemailer) | Exige servidor/credenciais SMTP e cuidado com reputação de IP e SPF/DKIM |
| Outros provedores (SendGrid, Brevo, MailerSend) | Equivalentes; a troca custa uma função, justamente pelo isolamento |

## Detalhes que valem registrar

- **O e-mail não bloqueia a resposta.** `criar()` não usa `await` na
  notificação: a API devolve `201` sem esperar o provedor. A função
  `notificarCadastro` captura os próprios erros, então a promessa solta nunca
  vira `unhandledRejection`.
- **Cada envio tem seu `try/catch`.** Se o e-mail de boas-vindas falhar, o do
  comercial ainda é tentado.
- **Dados de usuário são escapados.** O nome do restaurante vem do usuário; se
  fosse colado direto no HTML, alguém poderia cadastrar um restaurante chamado
  `<a href="http://golpe">` e a EasyFood enviaria esse HTML com a própria marca
  (HTML injection). `escapeHtml()` é aplicado a todo dado de usuário e a
  `header`/`footer`. O `body` é HTML escrito por nós (aceita `<br/>`).
- **Timeout de 8 s** na chamada externa: um provedor lento não prende a aplicação.
- **Falha simulada por variável de ambiente** (`EMAIL_SIMULATE_FAILURE=true`),
  em vez de editar o código com um `throw` temporário e correr o risco de
  esquecê-lo lá (a Parte 12 da atividade pede esse teste).
- **Sem credenciais, a API sobe.** Sem `EMAIL_API_KEY`, o provider cai em
  `console` (só registra no log). Com `EMAIL_PROVIDER=resend` e sem chave, o
  `env.js` falha na subida, apontando a variável que falta.

## Consequências

**Positivas**
- Trocar de provedor mexe em um arquivo; nenhum módulo de negócio muda.
- Um provedor fora do ar não derruba o cadastro.
- O mesmo `sendEmail()` envia conteúdos diferentes (boas-vindas e comercial).

**Negativas (assumidas)**
- Sem fila nem retentativa: se o provedor falhar, o e-mail é **perdido** (só
  fica registrado em log). Aceitável para e-mail de boas-vindas; para algo
  crítico (ex.: confirmação de pedido) seria preciso uma fila.
- Por não esperar o envio, a API não informa ao cliente se o e-mail saiu.
- No plano gratuito do Resend, sem domínio verificado, a entrega só funciona
  para o e-mail do dono da conta. Por isso existe `EMAIL_TO_TEST`.

## Quando revisitar

- Quando um e-mail for crítico para o negócio: introduzir fila + retentativa
  (e aí a Aula 8 ajuda: uma função serverless acionada por mensagem em fila).
- Quando o volume de e-mails ou o custo do provedor mudar de patamar.
