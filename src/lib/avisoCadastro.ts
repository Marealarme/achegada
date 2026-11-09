import "server-only";

// Aviso por e-mail ao dono do A Chegada quando uma pousada nova se cadastra.
// Variáveis (Vercel): RESEND_API_KEY (já existe), AVISO_CADASTRO_PARA (padrão contato@innexperts.com.br),
// AVISO_CADASTRO_DE (padrão "A Chegada <avisos@mail.innexperts.com.br>").
// Nunca impede o cadastro: se falhar, só registra no log.

type Dados = { pousada: string; cidade: string; uf: string; unidades: number; nome: string; email: string; whatsapp: string };

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

export async function avisarNovoCadastro(d: Dados) {
  const chave = process.env.RESEND_API_KEY;
  if (!chave) { console.warn("[aviso-cadastro] sem RESEND_API_KEY: aviso não enviado"); return; }
  const para = (process.env.AVISO_CADASTRO_PARA || "contato@innexperts.com.br").split(",").map((s) => s.trim()).filter(Boolean);
  const de = process.env.AVISO_CADASTRO_DE || "A Chegada <avisos@mail.innexperts.com.br>";
  const fone = d.whatsapp.replace(/\D/g, "");
  const wa = `https://wa.me/${fone.startsWith("55") ? fone : "55" + fone}`;
  const linhas: [string, string][] = [
    ["Pousada", d.pousada], ["Cidade", `${d.cidade}${d.uf ? " – " + d.uf : ""}`], ["Chalés/quartos", String(d.unidades)],
    ["Responsável", d.nome], ["E-mail", d.email || "(já tinha conta)"], ["WhatsApp", fone],
  ];
  const html = `<p>Nova pousada cadastrada no A Chegada (30 dias grátis começam quando ela cadastrar o cartão):</p>
<table cellpadding="4">${linhas.map(([k, v]) => `<tr><td><b>${esc(k)}</b></td><td>${esc(v)}</td></tr>`).join("")}</table>
<p><a href="${wa}">Falar no WhatsApp</a></p>`;
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${chave}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: de, to: para, subject: `Novo cadastro no A Chegada: ${d.pousada} (${d.cidade})`, html, reply_to: d.email || undefined }),
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) console.warn("[aviso-cadastro] Resend recusou:", r.status, (await r.text()).slice(0, 300));
  } catch (e) {
    console.warn("[aviso-cadastro] falhou:", e instanceof Error ? e.message : e);
  }
}
