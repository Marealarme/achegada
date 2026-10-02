"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { supabaseEquipe } from "@/lib/supabase";

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
