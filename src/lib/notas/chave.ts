import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { decifrar } from "@/lib/cripto";

// Chave da API Digisan de cada pousada: fica criptografada em pousada_segredos.digisan_chave_cripto
// (a chave de criptografia CRIPTO_CHAVE só existe no servidor). Nunca vai ao navegador.
// Compatibilidade: a pousada-piloto (slug FNRH_POUSADA_PILOTO, padrão "lua") pode usar a variável DIGISAN_API_KEY
// enquanto não cadastrar a chave pela tela. Nenhuma outra pousada usa essa variável.

export type ChaveDigisan = { chave: string; origem: "pousada" | "servidor" };

export async function chaveDigisan(db: SupabaseClient, pousadaId: string): Promise<ChaveDigisan | null> {
  const { data: seg } = await db.from("pousada_segredos").select("digisan_chave_cripto").eq("pousada_id", pousadaId).maybeSingle();
  const propria = decifrar((seg as { digisan_chave_cripto?: string | null } | null)?.digisan_chave_cripto);
  if (propria) return { chave: propria, origem: "pousada" };
  if (!process.env.DIGISAN_API_KEY) return null;
  const { data: p } = await db.from("pousadas").select("slug").eq("id", pousadaId).maybeSingle();
  return p?.slug === (process.env.FNRH_POUSADA_PILOTO ?? "lua") ? { chave: process.env.DIGISAN_API_KEY, origem: "servidor" } : null;
}

/** Endereço do aviso automático (webhook) da pousada. */
export function urlWebhook(pousadaId: string) {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "https://achegada.innexperts.com.br";
  return `${base}/api/nfse/webhook?p=${pousadaId}`;
}
