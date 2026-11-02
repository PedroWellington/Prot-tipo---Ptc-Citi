const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// Tabelas e estilos inline: é o que clientes de e-mail renderizam de forma confiável
export function renderEmail(title: string, text: string, actions: { label: string; url: string }[] = []) {
  const paragraphs = text.split("\n").filter(Boolean)
    .map((p) => `<p style="margin:0 0 14px;color:#1d2f27;font-size:16px;line-height:1.6">${esc(p)}</p>`).join("");
  const buttons = actions.map((a, i) =>
    `<a href="${esc(a.url)}" style="display:inline-block;margin:0 8px 8px 0;padding:12px 20px;border-radius:999px;font-size:15px;font-weight:600;text-decoration:none;${
      i === 0 ? "background:#07422c;color:#ffffff" : "background:#ecf5f0;color:#07422c"
    }">${esc(a.label)}</a>`).join("");
  return `<!doctype html><html lang="pt-BR"><body style="margin:0;background:#eef3f0;padding:32px 12px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">
<table role="presentation" width="100%" style="max-width:520px;margin:0 auto;background:#fff;border-radius:18px;overflow:hidden"><tr><td style="background:#052e1f;padding:24px 32px">
<span style="color:#6ee7a8;font-family:Georgia,serif;font-size:22px;letter-spacing:.3px">Movimento</span></td></tr>
<tr><td style="height:2px;background:linear-gradient(90deg,#1fa86a,#3b82f6,#8b5cf6)"></td></tr>
<tr><td style="padding:32px"><h1 style="margin:0 0 16px;color:#052e1f;font-family:Georgia,serif;font-size:24px;font-weight:400">${esc(title)}</h1>
${paragraphs}${buttons ? `<div style="margin-top:20px">${buttons}</div>` : ""}</td></tr>
<tr><td style="padding:0 32px 28px;color:#6b7f75;font-size:13px">Clínica Movimento · Boa Viagem e Casa Forte, Recife</td></tr></table></body></html>`;
}
