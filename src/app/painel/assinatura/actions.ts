"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { sessaoEquipe } from "@/lib/sessao";
import { supabaseServico } from "@/lib/supabase";
import { criarCheckout, PLANOS, portalCliente, stripeLigado, type Plano } from "@/lib/assinatura";

async function base() {
  const h = await headers();
  return process.env.NEXT_PUBLIC_SITE_URL ?? `https://${h.get("host")}`;
}

export async function assinar(form: FormData) {
  const s = await sessaoEquipe();
  if (s.perfil.papel !== "dono" || !stripeLigado()) redirect("/painel/assinatura");
  const plano = String(form.get("plano") ?? "") as Plano;
  if (!(plano in PLANOS)) redirect("/painel/assinatura");
  const { data: p } = await supabaseServico().from("pousadas").select("stripe_customer_id, stripe_subscription_id, teste_ate").eq("id", s.pousada.id).single();
  let url: string;
  try {
    url = await criarCheckout({
      pousadaId: s.pousada.id, nomePousada: s.pousada.nome, email: s.email, plano, base: await base(),
      jaTeveTeste: !!(p?.stripe_subscription_id || p?.teste_ate), customerId: p?.stripe_customer_id ?? null,
    });
  } catch (e) {
    // mostra o motivo na tela em vez da página de erro genérica
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[Stripe] checkout", msg);
    redirect(`/painel/assinatura?erro=${encodeURIComponent(msg.slice(0, 300))}`);
  }
  redirect(url);
}

export async function gerenciar() {
  const s = await sessaoEquipe();
  if (s.perfil.papel !== "dono" || !stripeLigado()) redirect("/painel/assinatura");
  const { data: p } = await supabaseServico().from("pousadas").select("stripe_customer_id").eq("id", s.pousada.id).single();
  if (!p?.stripe_customer_id) redirect("/painel/assinatura");
  let url: string;
  try { url = await portalCliente(p.stripe_customer_id, await base()); }
  catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[Stripe] portal", msg);
    redirect(`/painel/assinatura?erro=${encodeURIComponent(msg.slice(0, 300))}`);
  }
  redirect(url);
}
