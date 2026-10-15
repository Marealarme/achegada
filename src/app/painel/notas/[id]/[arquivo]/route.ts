import { podeConfigurar, sessaoEquipe } from "@/lib/sessao";
import { supabaseServico } from "@/lib/supabase";
import { baixarArquivo } from "@/lib/notas/digisan";
import { chaveDigisan } from "@/lib/notas/chave";

export const dynamic = "force-dynamic";

// /painel/notas/{id}/pdf e /painel/notas/{id}/xml — baixa da Digisan pelo servidor (a chave nunca vai ao navegador).
export async function GET(_: Request, { params }: { params: Promise<{ id: string; arquivo: string }> }) {
  const { id, arquivo } = await params;
  if (arquivo !== "pdf" && arquivo !== "xml") return new Response("Arquivo inválido.", { status: 404 });
  const s = await sessaoEquipe({ exigirAssinatura: true });
  if (!podeConfigurar(s)) return new Response("Só o dono ou a gerência.", { status: 403 });
  const { data: n } = await s.db.from("notas_fiscais").select("digisan_id, numero, id_externo, status").eq("id", id).maybeSingle();
  if (!n?.digisan_id || !["autorizada", "cancelada", "cancelando"].includes(n.status))
    return new Response("Arquivo disponível só para nota autorizada ou cancelada.", { status: 404 });
  const chave = (await chaveDigisan(supabaseServico(), s.pousada.id))?.chave ?? null;
  const r = await baixarArquivo(chave, n.digisan_id, arquivo);
  if (!r) return new Response("A Digisan não devolveu o arquivo agora. Tente de novo em instantes.", { status: 502 });
  const nome = `nfse-${n.numero ?? n.id_externo}.${arquivo}`;
  return new Response(r.body, {
    headers: {
      "Content-Type": arquivo === "pdf" ? "application/pdf" : "application/xml; charset=utf-8",
      "Content-Disposition": `${arquivo === "pdf" ? "inline" : "attachment"}; filename="${nome}"`,
      "Cache-Control": "private, max-age=300",
    },
  });
}
