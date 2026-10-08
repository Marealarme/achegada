import "server-only";
import { randomBytes } from "node:crypto";
import { supabaseServico } from "@/lib/supabase";

/** Domínio que recebe as planilhas por e-mail (registro MX apontando para o Resend). */
export const DOMINIO_IMPORTACAO = process.env.EMAIL_IMPORTACAO_DOMINIO || "reservas.innexperts.com.br";

export type UltimaImportacaoEmail = { em: string; ok: boolean; mensagem: string; arquivo?: string; de?: string };

const base = (slug: string) => slug.replace(/[^a-z0-9]/g, "").slice(0, 20) || "pousada";

/**
 * Endereço de importação da pousada; cria na primeira vez.
 * Retorna null se o banco ainda não tem a coluna (migração 0010).
 */
export async function enderecoImportacao(pousadaId: string): Promise<{ email: string; ultima: UltimaImportacaoEmail | null } | null> {
  const db = supabaseServico();
  const { data, error } = await db.from("pousadas").select("slug, email_importacao, ultima_importacao_email").eq("id", pousadaId).maybeSingle();
  if (error || !data) return null;
  let codigo = data.email_importacao as string | null;
  for (let i = 0; !codigo && i < 5; i++) {
    const tentativa = `${base(data.slug as string)}-${randomBytes(3).toString("hex").slice(0, 4)}`;
    await db.from("pousadas").update({ email_importacao: tentativa }).eq("id", pousadaId).is("email_importacao", null);
    const { data: agora } = await db.from("pousadas").select("email_importacao").eq("id", pousadaId).maybeSingle();
    codigo = (agora?.email_importacao as string | null) ?? null;
  }
  if (!codigo) return null;
  return { email: `${codigo}@${DOMINIO_IMPORTACAO}`, ultima: (data.ultima_importacao_email as UltimaImportacaoEmail | null) ?? null };
}
