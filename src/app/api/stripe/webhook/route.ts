import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { stripe, sincronizarAssinatura } from "@/lib/assinatura";
import { supabaseServico } from "@/lib/supabase";

// Avisos automáticos do Stripe (pagamento feito, teste acabando, cartão recusado, cancelamento…).
// Cadastre no Stripe: Developers → Webhooks → endpoint https://achegada.innexperts.com.br/api/stripe/webhook
export async function POST(req: Request) {
  const segredo = process.env.STRIPE_WEBHOOK_SECRET;
  if (!segredo || !process.env.STRIPE_SECRET_KEY) return NextResponse.json({ erro: "não configurado" }, { status: 503 });

  const corpo = await req.text();
  let evento: Stripe.Event;
  try {
    evento = stripe().webhooks.constructEvent(corpo, req.headers.get("stripe-signature") ?? "", segredo);
  } catch {
    return NextResponse.json({ erro: "assinatura inválida" }, { status: 400 });
  }

  try {
    switch (evento.type) {
      case "checkout.session.completed": {
        const s = evento.data.object as Stripe.Checkout.Session;
        if (s.metadata?.app !== "achegada" || !s.client_reference_id) break;
        const customer = typeof s.customer === "string" ? s.customer : s.customer?.id;
        if (customer) await supabaseServico().from("pousadas").update({ stripe_customer_id: customer }).eq("id", s.client_reference_id);
        if (s.subscription) {
          const id = typeof s.subscription === "string" ? s.subscription : s.subscription.id;
          await sincronizarAssinatura(await stripe().subscriptions.retrieve(id));
        }
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
      case "customer.subscription.paused":
      case "customer.subscription.resumed":
        await sincronizarAssinatura(evento.data.object as Stripe.Subscription);
        break;
    }
  } catch (e) {
    console.error("[stripe] erro ao processar", evento.type, e instanceof Error ? e.message : e);
    return NextResponse.json({ erro: "falha ao processar" }, { status: 500 });
  }
  return NextResponse.json({ recebido: true });
}
