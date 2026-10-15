import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { supabaseServico } from "@/lib/supabase";
import { segredoWebhook } from "@/lib/notas/digisan";
import { chaveDigisan } from "@/lib/notas/chave";
import { aplicarRetorno } from "@/lib/notas/emissao";

// Avisos da Digisan sobre NFS-e: AUTORIZADA, FALHA_EMISSAO, CANCELADA, FALHA_CANCELAMENTO.
// A Digisan manda o header "Authorization: Bearer <segredo>" que o A Chegada cadastrou (derivado da chave da pousada).
// URL: /api/nfse/webhook?p=<id da pousada>. Sem "p" = aviso antigo da pousada-piloto (chave do servidor).
export const runtime = "nodejs";

function confere(req: Request, chave: string) {
  const recebido = Buffer.from(req.headers.get("authorization") ?? "");
  const esperado = Buffer.from(`Bearer ${segredoWebhook(chave)}`);
  return recebido.length === esperado.length && timingSafeEqual(recebido, esperado);
}

export async function POST(req: Request) {
  const db = supabaseServico();
  let pousadaId = new URL(req.url).searchParams.get("p") ?? "";
  if (pousadaId && !/^[0-9a-f-]{36}$/i.test(pousadaId)) return NextResponse.json({ erro: "não autorizado" }, { status: 401 });
  if (!pousadaId) {
    const { data: piloto } = await db.from("pousadas").select("id").eq("slug", process.env.FNRH_POUSADA_PILOTO ?? "lua").maybeSingle();
    pousadaId = piloto?.id ?? "";
  }
  const chave = pousadaId ? await chaveDigisan(db, pousadaId) : null;
  // aviso antigo (sem "p") só vale com a chave do servidor; com "p", vale a chave da própria pousada
  const valido = chave && confere(req, chave.chave) || (!new URL(req.url).searchParams.get("p") && process.env.DIGISAN_API_KEY && confere(req, process.env.DIGISAN_API_KEY));
  if (!valido) return NextResponse.json({ erro: "não autorizado" }, { status: 401 });
  let dto: Record<string, unknown>;
  try { dto = await req.json(); } catch { return NextResponse.json({ ok: true, ignorado: "corpo inválido" }); }
  if (String(dto.documento ?? "nfse").toLowerCase() !== "nfse") return NextResponse.json({ ok: true, ignorado: "não é NFS-e" });

  const digisanId = dto.id ? String(dto.id) : "";
  let { data: nota } = digisanId
    ? await db.from("notas_fiscais").select("id").eq("pousada_id", pousadaId).eq("digisan_id", digisanId).maybeSingle()
    : { data: null };
  if (!nota && dto.idExterno) {
    // a resposta da emissão se perdeu: acha pela reserva, só entre as notas que ainda esperam retorno
    const { data } = await db.from("notas_fiscais").select("id").eq("pousada_id", pousadaId).eq("id_externo", String(dto.idExterno))
      .in("status", ["enviando", "verificar", "processando"]).order("criada_em", { ascending: false }).limit(1);
    nota = data?.[0] ?? null;
  }
  if (!nota) return NextResponse.json({ ok: true, ignorado: "nota desconhecida" });
  await aplicarRetorno(db, nota.id, dto);
  return NextResponse.json({ ok: true });
}
