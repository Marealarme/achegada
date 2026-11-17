import { NextResponse } from "next/server";
import { sessaoEquipe, ehAdmin } from "@/lib/sessao";

export const dynamic = "force-dynamic";

/**
 * Diagnóstico (só administradores): mostra em qual conta Stripe a STRIPE_SECRET_KEY do servidor está ligada.
 * Nunca devolve a chave: só o id da conta, se é real ou teste e se pode receber pagamentos.
 */
export async function GET() {
  const s = await sessaoEquipe();
  if (!ehAdmin(s.email)) return NextResponse.json({ erro: "só administradores" }, { status: 403 });
  const chave = process.env.STRIPE_SECRET_KEY ?? "";
  if (!chave) return NextResponse.json({ erro: "STRIPE_SECRET_KEY não configurada" });
  const r = await fetch("https://api.stripe.com/v1/account", { headers: { Authorization: `Bearer ${chave}` }, cache: "no-store" });
  const c = (await r.json()) as Record<string, unknown>;
  const req = c.requirements as { disabled_reason?: string | null; currently_due?: string[] } | undefined;
  return NextResponse.json({
    conta: c.id ?? null,
    nome: (c.settings as { dashboard?: { display_name?: string } } | undefined)?.dashboard?.display_name ?? (c.business_profile as { name?: string } | undefined)?.name ?? null,
    modo: chave.startsWith("sk_live_") || chave.startsWith("rk_live_") ? "REAL" : "TESTE / ÁREA RESTRITA",
    pais: c.country ?? null,
    pode_receber_pagamentos: c.charges_enabled ?? null,
    pode_receber_repasses: c.payouts_enabled ?? null,
    motivo_bloqueio: req?.disabled_reason ?? null,
    pendencias: req?.currently_due ?? [],
    erro_stripe: r.ok ? null : (c.error as { message?: string } | undefined)?.message ?? `HTTP ${r.status}`,
  });
}
