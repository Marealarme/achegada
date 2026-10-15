import { sessaoEquipe } from "@/lib/sessao";
import { supabaseServico } from "@/lib/supabase";
import { consultarNfse, listarNfse } from "@/lib/notas/digisan";

export const dynamic = "force-dynamic";

// /painel/notas/conferir-servico?numero=272 — SÓ LEITURA. Mostra como a Digisan registrou o serviço de uma nota
// já autorizada (código NBS, IBS/CBS…), para copiar a mesma configuração. Dados do hóspede não são exibidos.
export async function GET(req: Request) {
  const s = await sessaoEquipe({ exigirAssinatura: true });
  if (s.perfil.papel !== "dono") return new Response("Só o dono.", { status: 403 });
  const u = new URL(req.url).searchParams;
  const numero = u.get("numero") ?? "272";
  const de = /^\d{4}-\d{2}-\d{2}$/.test(u.get("de") ?? "") ? u.get("de")! : "2026-10-01";
  const ate = /^\d{4}-\d{2}-\d{2}$/.test(u.get("ate") ?? "") ? u.get("ate")! : "2026-10-15";
  const { data: p } = await supabaseServico().from("pousadas").select("nfse_config").eq("id", s.pousada.id).maybeSingle();
  const cnpj = String((p?.nfse_config as { prestadorCnpj?: string } | null)?.prestadorCnpj ?? "").replace(/\D/g, "");
  const achadas: unknown[] = [];
  let cursor = "";
  for (let pag = 0; pag < 10; pag++) {
    const q = pag === 0 ? `cnpj=${cnpj}&dataReferencia=EMISSAO&dataInicio=${de}&dataFim=${ate}&limit=100` : `cursor=${encodeURIComponent(cursor)}`;
    const r = await listarNfse(q);
    if (!r.ok || !r.corpo) return Response.json({ erro: r.status, corpo: r.corpo, msg: r.erro });
    const c = r.corpo as Record<string, unknown>;
    const lista = (Array.isArray(c) ? c : (c.itens ?? c.dados ?? c.data ?? c.items ?? c.notas ?? [])) as Record<string, unknown>[];
    for (const n of lista) if (String(n.numero ?? "") === numero || String(n.numero ?? "").replace(/^0+/, "") === numero) achadas.push(n);
    if (pag === 0 && !lista.length) return Response.json({ semNotas: true, corpo: c });
    if (pag === 0) achadas.length || console.log(lista.map((n) => n.numero));
    cursor = String(c.cursor ?? c.proximoCursor ?? "");
    if (achadas.length || !cursor) break;
  }
  const detalhe = [];
  for (const n of achadas as Record<string, unknown>[]) {
    const r = n.id ? await consultarNfse(String(n.id)) : null;
    const d = (r?.corpo ?? n) as Record<string, unknown>;
    detalhe.push({ id: d.id, numero: d.numero, status: d.status, competencia: d.competencia, padraoNacional: d.padraoNacional, servico: d.servico ?? (d as { servicos?: unknown }).servicos, chaves: Object.keys(d) });
  }
  return Response.json({ numero, encontradas: detalhe.length, detalhe });
}
