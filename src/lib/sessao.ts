import "server-only";
import { redirect } from "next/navigation";
import { supabaseEquipe } from "@/lib/supabase";
import { stripeLigado } from "@/lib/assinatura";

export type PousadaSessao = {
  id: string; nome: string; slug: string; cidade: string | null; logo_url: string | null; whatsapp: string | null;
  assinatura_status: string; teste_ate: string | null; plano: string | null; qtd_unidades: number | null;
};
export type Sessao = {
  db: Awaited<ReturnType<typeof supabaseEquipe>>;
  userId: string;
  email: string;
  perfil: { nome: string; papel: "dono" | "gerente" | "recepcao"; pousada_id: string };
  pousada: PousadaSessao;
};

const ATIVAS = ["isenta", "trialing", "active", "past_due"];

/** Exige login e pousada vinculada. Com `exigirAssinatura`, manda para /painel/assinatura quando o acesso venceu. */
export async function sessaoEquipe(opcoes: { exigirAssinatura?: boolean } = {}): Promise<Sessao> {
  const db = await supabaseEquipe();
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) redirect("/entrar");

  const { data: perfil } = await db.from("perfis").select("nome, papel, pousada_id").eq("user_id", auth.user.id).maybeSingle();
  if (!perfil) redirect("/cadastrar?etapa=pousada");

  let { data: pousada } = await db.from("pousadas")
    .select("id, nome, slug, cidade, logo_url, whatsapp, assinatura_status, teste_ate, plano, qtd_unidades")
    .eq("id", perfil.pousada_id).maybeSingle();
  if (!pousada) {
    // antes da migração 0006
    const { data } = await db.from("pousadas").select("id, nome, slug, whatsapp").eq("id", perfil.pousada_id).maybeSingle();
    pousada = data ? { ...data, cidade: null, logo_url: null, assinatura_status: "isenta", teste_ate: null, plano: null, qtd_unidades: null } : null;
  }
  if (!pousada) redirect("/entrar");

  if (opcoes.exigirAssinatura && stripeLigado() && !ATIVAS.includes(pousada.assinatura_status)) redirect("/painel/assinatura");

  return { db, userId: auth.user.id, email: auth.user.email ?? "", perfil: perfil as Sessao["perfil"], pousada: pousada as PousadaSessao };
}

export const podeConfigurar = (s: Sessao) => s.perfil.papel === "dono" || s.perfil.papel === "gerente";
