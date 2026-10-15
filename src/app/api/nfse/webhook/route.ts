import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { supabaseServico } from "@/lib/supabase";
import { segredoWebhook } from "@/lib/notas/digisan";
import { aplicarRetorno } from "@/lib/notas/emissao";

// Avisos da Digisan sobre NFS-e: AUTORIZADA, FALHA_EMISSAO, CANCELADA, FALHA_CANCELAMENTO.
// A Digisan manda o header "Authorization: Bearer <segredo>" que o A Chegada cadastrou (derivado da chave da API).
export const runtime = "nodejs";

function autorizado(req: Request) {
  if (!process.env.DIGISAN_API_KEY) return false;
  const recebido = Buffer.from(req.headers.get("authorization") ?? "");
  const esperado = Buffer.from(`Bearer ${segredoWebhook()}`);
  return recebido.length === esperado.length && timingSafeEqual(recebido, esperado);
}

export async function POST(req: Request) {
  if (!autorizado(req)) return NextResponse.json({ erro: "não autorizado" }, { status: 401 });
  let dto: Record<string, unknown>;
  try { dto = await req.json(); } catch { return NextResponse.json({ ok: true, ignorado: "corpo inválido" }); }
  if (String(dto.documento ?? "nfse").toLowerCase() !== "nfse") return NextResponse.json({ ok: true, ignorado: "não é NFS-e" });

  const db = supabaseServico();
  const digisanId = dto.id ? String(dto.id) : "";
  let { data: nota } = digisanId
    ? await db.from("notas_fiscais").select("id").eq("digisan_id", digisanId).maybeSingle()
    : { data: null };
  if (!nota && dto.idExterno) {
    // a resposta da emissão se perdeu: acha pela reserva, só entre as notas que ainda esperam retorno
    const { data } = await db.from("notas_fiscais").select("id").eq("id_externo", String(dto.idExterno))
      .in("status", ["enviando", "verificar", "processando"]).order("criada_em", { ascending: false }).limit(1);
    nota = data?.[0] ?? null;
  }
  if (!nota) return NextResponse.json({ ok: true, ignorado: "nota desconhecida" });
  await aplicarRetorno(db, nota.id, dto);
  return NextResponse.json({ ok: true });
}
