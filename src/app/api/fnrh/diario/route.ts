import { supabaseServico } from "@/lib/supabase";
import { processarEnvio } from "@/lib/fnrh/envio";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Envio automático das 23h30 (cron da Vercel, ver vercel.json): fichas que ainda estão guardadas e cuja chegada
// é hoje ou já passou vão ao governo para não ficarem sem registro. Sem a chegada marcada, vão como pré-check-in
// pendente (o governo não aceita motivo/transporte nessa situação); com a chegada marcada, vão completas.
export async function GET(req: Request) {
  const segredo = process.env.CRON_SECRET;
  if (!segredo || req.headers.get("authorization") !== `Bearer ${segredo}`) return new Response("não autorizado", { status: 401 });
  const db = supabaseServico();
  const hoje = new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
  const { data: fila } = await db.from("fnrh_envios").select("reserva_id").not("payload", "is", null);
  const ids = (fila ?? []).map((f) => f.reserva_id as string);
  if (!ids.length) return Response.json({ enviados: 0 });
  const { data: reservas } = await db.from("reservas").select("id, checkin_em")
    .in("id", ids).is("fnrh_reserva_id", null).is("cancelada_em", null).is("descartada_em", null).lte("check_in", hoje).neq("fnrh_status", "erro");
  let ok = 0, falhas = 0;
  for (const r of (reservas ?? []) as { id: string; checkin_em: string | null }[]) {
    const res = await processarEnvio(r.id, r.checkin_em ? new Date(r.checkin_em) : undefined);
    if (res.ok) ok++; else falhas++;
  }
  return Response.json({ enviados: ok, falhas });
}
