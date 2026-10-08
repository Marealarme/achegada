import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { supabaseServico } from "@/lib/supabase";
import { aplicarImportacao } from "@/lib/importarReservas";
import { DOMINIO_IMPORTACAO, type UltimaImportacaoEmail } from "@/lib/emailImportacao";

// Importação de reservas por e-mail.
// O pousadeiro manda a planilha do sistema de reservas para o endereço da pousada
// (ex.: luachales-k7p2@reservas.innexperts.com.br). O Resend recebe o e-mail e avisa aqui.
// Variáveis da Vercel: RESEND_API_KEY (ler os anexos) e RESEND_WEBHOOK_SECRET (whsec_…).
// Cadastre no Resend: Webhooks → evento email.received → https://achegada.innexperts.com.br/api/email/entrada

export const runtime = "nodejs";
export const maxDuration = 60;

/** Confere a assinatura do aviso (padrão Svix, usado pelo Resend). */
function assinaturaValida(corpo: string, h: Headers, segredo: string) {
  const id = h.get("svix-id"), ts = h.get("svix-timestamp"), assinaturas = h.get("svix-signature");
  if (!id || !ts || !assinaturas) return false;
  if (Math.abs(Date.now() / 1000 - Number(ts)) > 5 * 60) return false;
  const chave = Buffer.from(segredo.replace(/^whsec_/, ""), "base64");
  const esperado = createHmac("sha256", chave).update(`${id}.${ts}.${corpo}`).digest();
  return assinaturas.split(" ").some((parte) => {
    const [, valor] = parte.split(",");
    if (!valor) return false;
    const recebido = Buffer.from(valor, "base64");
    return recebido.length === esperado.length && timingSafeEqual(recebido, esperado);
  });
}

const enderecoDe = (s: string) => (s.match(/<([^>]+)>/)?.[1] ?? s).trim().toLowerCase();
const ehPlanilha = (nome: string, tipo: string) =>
  /\.(xlsx?|csv|xml)$/i.test(nome) || /spreadsheet|excel|csv|ms-excel|xml/i.test(tipo);

export async function POST(req: Request) {
  const segredo = process.env.RESEND_WEBHOOK_SECRET;
  const chaveApi = process.env.RESEND_API_KEY;
  if (!segredo || !chaveApi) return NextResponse.json({ erro: "não configurado" }, { status: 503 });

  const corpo = await req.text();
  if (!assinaturaValida(corpo, req.headers, segredo)) return NextResponse.json({ erro: "assinatura inválida" }, { status: 400 });

  const evento = JSON.parse(corpo) as {
    type?: string;
    data?: { email_id?: string; from?: string; to?: string[]; cc?: string[]; attachments?: { id: string; filename?: string; content_type?: string }[] };
  };
  if (evento.type !== "email.received" || !evento.data?.email_id) return NextResponse.json({ ok: true });
  const d = evento.data;

  // de qual pousada é: o endereço tem o código da pousada antes do @
  const codigos = [...(d.to ?? []), ...(d.cc ?? [])].map(enderecoDe)
    .filter((e) => e.endsWith(`@${DOMINIO_IMPORTACAO}`)).map((e) => e.split("@")[0]);
  if (!codigos.length) return NextResponse.json({ ok: true, ignorado: "sem endereço de pousada" });
  const db = supabaseServico();
  const { data: pousada } = await db.from("pousadas").select("id").in("email_importacao", codigos).limit(1).maybeSingle();
  if (!pousada) return NextResponse.json({ ok: true, ignorado: "endereço desconhecido" });
  const pousadaId = pousada.id as string;
  const de = d.from ? enderecoDe(d.from) : undefined;

  async function registrar(r: Omit<UltimaImportacaoEmail, "em" | "de">) {
    const ultima: UltimaImportacaoEmail = { em: new Date().toISOString(), de, ...r };
    await db.from("pousadas").update({ ultima_importacao_email: ultima }).eq("id", pousadaId);
    return NextResponse.json({ ok: true, resultado: ultima });
  }

  // anexos: o Resend dá um link temporário para baixar cada um
  const resp = await fetch(`https://api.resend.com/emails/receiving/${d.email_id}/attachments`, {
    headers: { Authorization: `Bearer ${chaveApi}` },
  });
  if (!resp.ok) return registrar({ ok: false, mensagem: "O e-mail chegou, mas não foi possível ler o anexo. Tente mandar de novo." });
  const lista = ((await resp.json()) as { data?: { filename?: string; content_type?: string; download_url?: string; size?: number }[] }).data ?? [];
  const planilha = lista.find((a) => a.download_url && ehPlanilha(a.filename ?? "", a.content_type ?? ""));
  if (!planilha) return registrar({ ok: false, mensagem: "O e-mail chegou sem planilha anexada. Anexe o arquivo de reservas (.xls, .xlsx ou .csv)." });
  if ((planilha.size ?? 0) > 3_000_000)
    return registrar({ ok: false, arquivo: planilha.filename, mensagem: "Planilha grande demais. Exporte só as próximas semanas." });

  const arquivo = await fetch(planilha.download_url!);
  if (!arquivo.ok) return registrar({ ok: false, arquivo: planilha.filename, mensagem: "Não foi possível baixar o anexo. Tente mandar de novo." });
  const bytes = new Uint8Array(await arquivo.arrayBuffer());

  try {
    const r = await aplicarImportacao(pousadaId, null, bytes);
    if (r.mapear)
      return registrar({ ok: false, arquivo: planilha.filename, mensagem: "Planilha de um formato novo. Importe esta planilha uma vez pela tela “Importar reservas” para dizer qual coluna é qual. Depois, o e-mail funciona sozinho." });
    return registrar({ ok: r.ok, arquivo: planilha.filename, mensagem: r.mensagem });
  } catch {
    return registrar({ ok: false, arquivo: planilha.filename, mensagem: "Não foi possível importar esta planilha. Tente pela tela “Importar reservas”." });
  }
}
