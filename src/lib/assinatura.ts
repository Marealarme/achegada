import "server-only";
import Stripe from "stripe";
import { supabaseServico } from "@/lib/supabase";

// Assinatura das pousadas via Stripe. O cartão fica guardado no Stripe (nunca no nosso banco).
// Variáveis da Vercel: STRIPE_SECRET_KEY (sk_live_… ou sk_test_…) e STRIPE_WEBHOOK_SECRET (whsec_…).

export const PLANOS = {
  ate10: { nome: "Essencial", descricao: "Até 10 chalés/quartos", valor: 9900, maxUnidades: 10 },
  ate25: { nome: "Pousada", descricao: "De 11 a 25 chalés/quartos", valor: 14900, maxUnidades: 25 },
  ate40: { nome: "Pousada+", descricao: "De 26 a 40 chalés/quartos", valor: 19900, maxUnidades: 40 },
} as const;
export type Plano = keyof typeof PLANOS;
export const DIAS_TESTE = 30;

export const stripeLigado = () => !!process.env.STRIPE_SECRET_KEY;
let cliente: Stripe | null = null;
export function stripe() {
  if (!process.env.STRIPE_SECRET_KEY) throw new Error("Stripe não configurado.");
  cliente ??= new Stripe(process.env.STRIPE_SECRET_KEY);
  return cliente;
}

export function planoPorUnidades(n: number | null | undefined): Plano {
  const q = Number(n) || 0;
  return q <= 10 ? "ate10" : q <= 25 ? "ate25" : "ate40";
}
export const reais = (centavos: number) => (centavos / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** Busca o preço do plano no Stripe pela "lookup key"; cria produto e preço na primeira vez. */
async function precoDoPlano(plano: Plano): Promise<string> {
  const s = stripe();
  const lookup = `achegada_${plano}_mensal`;
  const achados = await s.prices.list({ lookup_keys: [lookup], active: true, limit: 1 });
  if (achados.data[0]) return achados.data[0].id;
  const p = PLANOS[plano];
  const produto = await s.products.create({ name: `A Chegada · ${p.nome}`, description: `${p.descricao}. Check-in online e ficha FNRH automática.`, metadata: { app: "achegada", plano } });
  const preco = await s.prices.create({
    product: produto.id, currency: "brl", unit_amount: p.valor, recurring: { interval: "month" },
    lookup_key: lookup, nickname: `A Chegada ${p.nome} mensal`, metadata: { app: "achegada", plano },
  });
  return preco.id;
}

/** Abre a página de pagamento do Stripe (cartão) com 30 dias grátis na primeira assinatura. */
export async function criarCheckout(args: { pousadaId: string; nomePousada: string; email: string; plano: Plano; base: string; jaTeveTeste: boolean; customerId: string | null }) {
  const s = stripe();
  let customer = args.customerId;
  if (!customer) {
    const c = await s.customers.create({ email: args.email, name: args.nomePousada, metadata: { app: "achegada", pousada_id: args.pousadaId } });
    customer = c.id;
    await supabaseServico().from("pousadas").update({ stripe_customer_id: customer }).eq("id", args.pousadaId);
  }
  const sessao = await s.checkout.sessions.create({
    mode: "subscription",
    customer,
    client_reference_id: args.pousadaId,
    line_items: [{ price: await precoDoPlano(args.plano), quantity: 1 }],
    payment_method_collection: "always",
    subscription_data: {
      ...(args.jaTeveTeste ? {} : { trial_period_days: DIAS_TESTE }),
      metadata: { app: "achegada", pousada_id: args.pousadaId, plano: args.plano },
    },
    metadata: { app: "achegada", pousada_id: args.pousadaId },
    locale: "pt-BR",
    allow_promotion_codes: true,
    success_url: `${args.base}/painel/assinatura?ok=1`,
    cancel_url: `${args.base}/painel/assinatura`,
  });
  return sessao.url!;
}

/** Portal do Stripe: trocar cartão, ver faturas, cancelar. */
export async function portalCliente(customerId: string, base: string) {
  const p = await stripe().billingPortal.sessions.create({ customer: customerId, return_url: `${base}/painel/assinatura`, locale: "pt-BR" });
  return p.url;
}

/** Atualiza a pousada a partir de uma assinatura do Stripe (chamado pelo webhook). */
export async function sincronizarAssinatura(sub: Stripe.Subscription) {
  if (sub.metadata?.app && sub.metadata.app !== "achegada") return; // assinaturas de outros apps na mesma conta
  const db = supabaseServico();
  let pousadaId = sub.metadata?.pousada_id;
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
  if (!pousadaId) {
    const { data } = await db.from("pousadas").select("id").eq("stripe_customer_id", customerId).maybeSingle();
    pousadaId = data?.id;
  }
  if (!pousadaId) return;
  const lookup = sub.items.data[0]?.price?.lookup_key ?? "";
  const plano = (Object.keys(PLANOS) as Plano[]).find((p) => lookup === `achegada_${p}_mensal`) ?? sub.metadata?.plano ?? null;
  const { data: atual } = await db.from("pousadas").select("assinatura_status").eq("id", pousadaId).maybeSingle();
  if (atual?.assinatura_status === "isenta") return;
  await db.from("pousadas").update({
    assinatura_status: sub.status,
    stripe_subscription_id: sub.id,
    stripe_customer_id: customerId,
    teste_ate: sub.trial_end ? new Date(sub.trial_end * 1000).toISOString() : null,
    plano,
  }).eq("id", pousadaId);
}
