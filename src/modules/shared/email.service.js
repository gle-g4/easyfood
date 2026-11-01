const { env } = require("../../config/env");
const logger = require("../../shared/logger");

function escapeHtml(valor) {
  return String(valor ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildHtml({ header, body, footer }) {
  return `
<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
  <h2>${escapeHtml(header)}</h2>
  <div>${body}</div>
  <hr />
  <p style="color: #888; font-size: 12px;">
    ${escapeHtml(footer)}
  </p>
</div>
`;
}

function buildText({ header, body, footer }) {
  const semTags = String(body ?? "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+\n/g, "\n")
    .trim();
  return `${header}\n\n${semTags}\n\n${footer}`;
}

async function transportar({ to, toName, subject, html, text }) {
  if (env.email.provider === "console") {
    logger.info("e-mail simulado (EMAIL_PROVIDER=console)", {
      para: to,
      assunto: subject
    });
    return { id: `simulado-${Date.now()}`, provedor: "console" };
  }

  const resposta = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.email.apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from: `${env.email.fromName} <${env.email.from}>`,
      to: [toName ? `${toName.replace(/[<>",]/g, "")} <${to}>` : to],
      subject,
      html,
      text
    }),
    signal: AbortSignal.timeout(8000)
  });

  if (!resposta.ok) {
    const detalhe = await resposta.text().catch(() => "");
    throw new Error(`API de e-mail respondeu ${resposta.status}: ${detalhe}`);
  }

  const dados = await resposta.json();
  return { id: dados.id, provedor: "resend" };
}

async function sendEmail({ to, toName, subject, header, body, footer }) {
  if (env.email.simulateFailure) {
    throw new Error("Falha simulada no envio de e-mail");
  }

  if (!to) {
    throw new Error("sendEmail: destinatário (to) é obrigatório");
  }

  const html = buildHtml({ header, body, footer });
  const text = buildText({ header, body, footer });

  const resultado = await transportar({ to, toName, subject, html, text });

  logger.info(`[EMAIL] Enviado para ${to} - "${subject}"`, {
    provedor: resultado.provedor,
    id: resultado.id
  });

  return resultado;
}

module.exports = { sendEmail, escapeHtml };
