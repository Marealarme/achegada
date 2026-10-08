"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { supabaseEquipe, supabaseServico } from "@/lib/supabase";
import { ehOta } from "@/lib/hotellink";
import { CAMPOS, type Indices } from "@/lib/importacao";
import { aplicarImportacao, type ResultadoImportacao } from "@/lib/importarReservas";
export type { ResultadoImportacao };
import { cancelarReserva, checkinReserva, checkoutReserva, ErroFnrh } from "@/lib/fnrh/cliente";
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
  redirect(`/painel?r=${data.id}#r-${data.id}`);
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

/** O governo responde 400 "Situação: Cancelada" quando a ficha já foi cancelada (ex.: direto no site da FNRH). */
const jaCanceladaNoGoverno = (e: unknown) => e instanceof ErroFnrh && /situa[cç][aã]o:\s*cancelad/i.test(e.message);

/** Cancela no governo; se já estava cancelada lá, conta como sucesso. */
async function cancelarNoGoverno(pousadaId: string, fnrhReservaId: string) {
  try { await cancelarReserva(pousadaId, fnrhReservaId); }
  catch (e) { if (!jaCanceladaNoGoverno(e)) throw e; }
}

/** Confere (com as regras de segurança da equipe) que a reserva é da pousada de quem está logado. */
async function reservaDaEquipe(id: string) {
  const db = await supabaseEquipe();
  const { data } = await db.from("reservas").select("id, pousada_id, fnrh_reserva_id").eq("id", id).maybeSingle();
  return { db, reserva: data as { id: string; pousada_id: string; fnrh_reserva_id: string | null } | null };
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
    await checkinReserva(reserva.pousada_id, reserva.fnrh_reserva_id, agora);
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
    await checkoutReserva(reserva.pousada_id, reserva.fnrh_reserva_id, agora);
    await db.from("reservas").update({ checkout_em: agora.toISOString(), fnrh_erro: null }).eq("id", reserva.id);
  } catch (e) {
    await db.from("reservas").update({ fnrh_erro: e instanceof ErroFnrh ? `Check-out não registrado: ${e.message}` : "Check-out não registrado." }).eq("id", reserva.id);
  }
  revalidatePath("/painel");
}

export async function cancelarFicha(form: FormData) {
  const { db, reserva } = await reservaDaEquipe(String(form.get("id") ?? ""));
  if (!reserva?.fnrh_reserva_id) return;
  try {
    await cancelarNoGoverno(reserva.pousada_id, reserva.fnrh_reserva_id);
    await db.from("reservas").update({
      fnrh_status: "nao_enviado", fnrh_reserva_id: null, fnrh_concluida: false, fnrh_enviado_em: null,
      fnrh_erro: `Ficha cancelada no governo em ${new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}.`,
    }).eq("id", reserva.id);
    await db.from("hospedes_reserva").update({ status_fnrh: "pendente" }).eq("reserva_id", reserva.id);
  } catch (e) {
    await db.from("reservas").update({ fnrh_erro: e instanceof ErroFnrh ? `Não foi possível cancelar: ${e.message}` : "Não foi possível cancelar." }).eq("id", reserva.id);
  }
  revalidatePath("/painel");
}

/**
 * Cancela o card da reserva: se a ficha já foi ao governo, cancela lá primeiro.
 * O card some da lista; o cadastro dos hóspedes (se já fizeram o check-in) continua guardado.
 */
export async function cancelarCard(form: FormData) {
  const id = String(form.get("id") ?? "");
  const db = await supabaseEquipe();
  const { data: auth } = await db.auth.getUser();
  const { data } = await db.from("reservas").select("id, pousada_id, fnrh_reserva_id, checkin_em").eq("id", id).maybeSingle();
  const reserva = data as { id: string; pousada_id: string; fnrh_reserva_id: string | null; checkin_em: string | null } | null;
  if (!reserva || !auth.user) return;
  if (reserva.checkin_em) {
    await db.from("reservas").update({ fnrh_erro: "Este hóspede já chegou: registre a saída em vez de cancelar." }).eq("id", reserva.id);
    revalidatePath("/painel");
    return;
  }
  if (reserva.fnrh_reserva_id) {
    try {
      await cancelarNoGoverno(reserva.pousada_id, reserva.fnrh_reserva_id);
    } catch (e) {
      await db.from("reservas").update({
        fnrh_erro: `A reserva não foi cancelada porque a ficha do governo não pôde ser cancelada: ${e instanceof ErroFnrh ? e.message : "sem resposta"}. Tente de novo.`,
      }).eq("id", reserva.id);
      revalidatePath("/painel");
      return;
    }
  }
  const { error } = await db.from("reservas").update({
    cancelada_em: new Date().toISOString(), cancelada_por: auth.user.id, fnrh_erro: null,
    ...(reserva.fnrh_reserva_id ? { fnrh_status: "nao_enviado", fnrh_reserva_id: null, fnrh_concluida: false } : {}),
  }).eq("id", reserva.id);
  if (error) {
    await db.from("reservas").update({ fnrh_erro: "Para cancelar reservas, rode a migração 0007 no Supabase." }).eq("id", reserva.id);
    revalidatePath("/painel");
    return;
  }
  // pacote da ficha que ainda não foi ao governo: não precisa mais ficar guardado
  await supabaseServico().from("fnrh_envios").delete().eq("reserva_id", reserva.id).eq("pousada_id", reserva.pousada_id);
  revalidatePath("/painel");
  redirect("/painel");
}

// ---------- Importação da planilha de reservas ----------

export async function importarReservas(_: ResultadoImportacao | null, form: FormData): Promise<ResultadoImportacao> {
  const equipe = await supabaseEquipe();
  const { data: auth } = await equipe.auth.getUser();
  if (!auth.user) return { ok: false, mensagem: "Sua sessão expirou. Entre de novo." };
  const { data: perfil } = await equipe.from("perfis").select("pousada_id").eq("user_id", auth.user.id).maybeSingle();
  if (!perfil) return { ok: false, mensagem: "Seu usuário ainda não está ligado a uma pousada." };

  const arquivo = form.get("arquivo");
  if (!(arquivo instanceof File) || arquivo.size === 0) return { ok: false, mensagem: "Escolha a planilha de reservas." };
  if (arquivo.size > 3_000_000) return { ok: false, mensagem: "Arquivo grande demais. Exporte só as próximas semanas." };

  return aplicarImportacao(perfil.pousada_id as string, auth.user.id, new Uint8Array(await arquivo.arrayBuffer()), {
    manual: form.get("mapear") === "1" ? Object.fromEntries(CAMPOS.map((c) => [c.id, String(form.get(`col_${c.id}`) ?? "")]).filter(([, v]) => v !== "").map(([k, v]) => [k, Number(v)])) as Indices : undefined,
    refazer: form.get("refazer") === "1",
  });
}
