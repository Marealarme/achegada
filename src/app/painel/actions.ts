"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { supabaseEquipe } from "@/lib/supabase";
import { checkinReserva, checkoutReserva, ErroFnrh } from "@/lib/fnrh/cliente";
import { processarEnvio } from "@/lib/fnrh/envio";

export async function criarReserva(_: string, form: FormData): Promise<string> {
  const db = await supabaseEquipe();
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) return "Sua sessão expirou. Entre de novo.";
  const { data: perfil } = await db.from("perfis").select("pousada_id").eq("user_id", auth.user.id).maybeSingle();
  if (!perfil) return "Seu usuário ainda não está ligado a uma pousada.";

  const titular = String(form.get("titular") ?? "").trim();
  const telefone = String(form.get("telefone") ?? "").trim();
  const unidade = String(form.get("unidade") ?? "");
  const checkIn = String(form.get("check_in") ?? "");
  const checkOut = String(form.get("check_out") ?? "");
  const adultos = Number(form.get("adultos") ?? 2);
  const criancas = Number(form.get("criancas") ?? 0);

  if (titular.length < 3) return "Informe o nome do titular.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(checkIn) || !/^\d{4}-\d{2}-\d{2}$/.test(checkOut) || checkOut <= checkIn)
    return "A data de check-out precisa ser depois do check-in.";
  if (!(adultos >= 1 && adultos <= 12) || !(criancas >= 0 && criancas <= 12)) return "Confira o número de hóspedes.";

  const { data, error } = await db
    .from("reservas")
    .insert({
      pousada_id: perfil.pousada_id,
      unidade_id: unidade || null,
      titular,
      telefone: telefone || null,
      check_in: checkIn,
      check_out: checkOut,
      adultos,
      criancas,
      token: randomBytes(12).toString("hex"),
      criado_por: auth.user.id,
    })
    .select("id")
    .single();
  if (error || !data) return "Não foi possível criar a reserva. Tente de novo.";

  revalidatePath("/painel");
  redirect(`/painel?r=${data.id}`);
}

export async function marcarFnrh(form: FormData) {
  const id = String(form.get("id") ?? "");
  const db = await supabaseEquipe();
  await db.from("reservas").update({ fnrh_concluida: true }).eq("id", id);
  await db.from("hospedes_reserva").update({ status_fnrh: "concluido" }).eq("reserva_id", id);
  revalidatePath("/painel");
}

/** Chamado quando a recepção clica em "Enviar no WhatsApp" ou "Copiar mensagem". */
export async function marcarLinkEnviado(id: string) {
  const db = await supabaseEquipe();
  const { error } = await db.from("reservas").update({ link_enviado_em: new Date().toISOString() }).eq("id", id).is("link_enviado_em", null);
  if (!error) revalidatePath("/painel");
}

// ---------- Fase 2: ficha FNRH automática ----------

/** Confere (com as regras de segurança da equipe) que a reserva é da pousada de quem está logado. */
async function reservaDaEquipe(id: string) {
  const db = await supabaseEquipe();
  const { data } = await db.from("reservas").select("id, fnrh_reserva_id").eq("id", id).maybeSingle();
  return { db, reserva: data as { id: string; fnrh_reserva_id: string | null } | null };
}

export async function reenviarFnrh(form: FormData) {
  const { reserva } = await reservaDaEquipe(String(form.get("id") ?? ""));
  if (reserva) await processarEnvio(reserva.id);
  revalidatePath("/painel");
}

export async function registrarChegada(form: FormData) {
  const { db, reserva } = await reservaDaEquipe(String(form.get("id") ?? ""));
  if (!reserva?.fnrh_reserva_id) return;
  const agora = new Date();
  try {
    await checkinReserva(reserva.fnrh_reserva_id, agora);
    await db.from("reservas").update({ checkin_em: agora.toISOString(), fnrh_erro: null }).eq("id", reserva.id);
  } catch (e) {
    await db.from("reservas").update({ fnrh_erro: e instanceof ErroFnrh ? `Check-in não registrado: ${e.message}` : "Check-in não registrado." }).eq("id", reserva.id);
  }
  revalidatePath("/painel");
}

export async function registrarSaida(form: FormData) {
  const { db, reserva } = await reservaDaEquipe(String(form.get("id") ?? ""));
  if (!reserva?.fnrh_reserva_id) return;
  const agora = new Date();
  try {
    await checkoutReserva(reserva.fnrh_reserva_id, agora);
    await db.from("reservas").update({ checkout_em: agora.toISOString(), fnrh_erro: null }).eq("id", reserva.id);
  } catch (e) {
    await db.from("reservas").update({ fnrh_erro: e instanceof ErroFnrh ? `Check-out não registrado: ${e.message}` : "Check-out não registrado." }).eq("id", reserva.id);
  }
  revalidatePath("/painel");
}
