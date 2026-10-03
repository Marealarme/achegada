"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { supabaseEquipe, supabaseServico } from "@/lib/supabase";
import { ehOta } from "@/lib/hotellink";
import { CAMPOS, lerPlanilhaReservas, type Indices, type MapaSalvo, type PedidoMapeamento } from "@/lib/importacao";
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
export type ResultadoImportacao = { ok: boolean; mensagem: string; detalhes?: string[]; mapear?: PedidoMapeamento; ligacaoSalva?: boolean };

export async function importarReservas(_: ResultadoImportacao | null, form: FormData): Promise<ResultadoImportacao> {
  const equipe = await supabaseEquipe();
  const { data: auth } = await equipe.auth.getUser();
  if (!auth.user) return { ok: false, mensagem: "Sua sessão expirou. Entre de novo." };
  const { data: perfil } = await equipe.from("perfis").select("pousada_id").eq("user_id", auth.user.id).maybeSingle();
  if (!perfil) return { ok: false, mensagem: "Seu usuário ainda não está ligado a uma pousada." };

  const arquivo = form.get("arquivo");
  if (!(arquivo instanceof File) || arquivo.size === 0) return { ok: false, mensagem: "Escolha a planilha de reservas." };
  if (arquivo.size > 3_000_000) return { ok: false, mensagem: "Arquivo grande demais. Exporte só as próximas semanas." };

  const db = supabaseServico(); // só após confirmar a pousada de quem está logado
  const pousadaId = perfil.pousada_id as string;

  // ligações de colunas já salvas desta pousada (migração 0008; sem ela, a ligação vale só para este envio)
  const { data: pousadaMapas, error: semMapas } = await db.from("pousadas").select("mapas_planilha").eq("id", pousadaId).maybeSingle();
  const mapas = (semMapas ? [] : (pousadaMapas?.mapas_planilha as MapaSalvo[] | null) ?? []);
  let manual: Indices | undefined;
  if (form.get("mapear") === "1") {
    manual = {};
    for (const c of CAMPOS) { const v = String(form.get(`col_${c.id}`) ?? ""); if (v !== "") manual[c.id] = Number(v); }
  }
  const leitura = lerPlanilhaReservas(new Uint8Array(await arquivo.arrayBuffer()), { mapas, manual, refazer: form.get("refazer") === "1" });
  if (leitura.mapear)
    return { ok: false, mensagem: leitura.erro ?? "Primeira vez com esta planilha: diga em qual coluna está cada informação. Na próxima vez, o A Chegada já reconhece sozinho.", mapear: leitura.mapear };
  if (leitura.erro) return { ok: false, mensagem: leitura.erro };
  const { reservas, avisos } = leitura;
  if (leitura.mapaNovo && !semMapas) {
    const outros = mapas.filter((m) => m.assinatura !== leitura.mapaNovo!.assinatura);
    await db.from("pousadas").update({ mapas_planilha: [leitura.mapaNovo, ...outros].slice(0, 10) }).eq("id", pousadaId);
  }
  const usouLigacao = leitura.fonte === "ligacao";
  const hoje = new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);

  // chalés: casa pelo nome; cria os que ainda não existem (nomes como vieram na planilha)
  const { data: unidadesAtuais } = await db.from("unidades").select("id, nome").eq("pousada_id", pousadaId);
  const chave = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
  const unidades = new Map((unidadesAtuais ?? []).map((u) => [chave(u.nome), u.id as string]));
  async function idUnidade(nome: string) {
    if (!nome) return null;
    const k = chave(nome);
    if (unidades.has(k)) return unidades.get(k)!;
    const categoria = /^su[ií]te/i.test(nome) ? "Suíte" : /^villa/i.test(nome) ? "Villa" : /^mezanino/i.test(nome) ? "Mezanino" : null;
    const { data } = await db.from("unidades").insert({ pousada_id: pousadaId, nome, categoria, ordem: 100 + unidades.size }).select("id").single();
    if (data) unidades.set(k, data.id);
    return data?.id ?? null;
  }

  const refs = reservas.map((r) => r.referencia);
  const { data: existentes, error: errExist } = await db.from("reservas")
    .select("id, referencia_externa, cancelada_em, checkin_em, fnrh_reserva_id, pre_chegadas(id)").eq("pousada_id", pousadaId).in("referencia_externa", refs.length ? refs : ["-"]);
  if (errExist) return { ok: false, mensagem: "O banco ainda não está pronto para a importação. Rode as migrações 0005 e 0007 no Supabase." };
  type Existente = { id: string; pre_chegadas: unknown; cancelada_em: string | null; checkin_em: string | null; fnrh_reserva_id: string | null };
  const porRef = new Map((existentes ?? []).map((r) => [r.referencia_externa as string, r as unknown as Existente]));

  let criadas = 0, atualizadas = 0, canceladas = 0;
  const ignoradas: string[] = [...(avisos ?? [])];
  for (const r of reservas) {
    const quem = r.titular || r.referencia;
    const atualCard = porRef.get(r.referencia);
    if (atualCard?.cancelada_em) { ignoradas.push(`${quem}: card cancelado no painel (mantido cancelado)`); continue; }
    if (/cancel/i.test(r.status) && atualCard && !atualCard.checkin_em) {
      // cancelada na planilha: cancela o card (e a ficha no governo, se já tinha ido)
      if (atualCard.fnrh_reserva_id) {
        try { await cancelarNoGoverno(pousadaId, atualCard.fnrh_reserva_id); }
        catch { ignoradas.push(`${quem}: cancelada na planilha, mas a ficha do governo não pôde ser cancelada (cancele pelo card)`); continue; }
      }
      const { error } = await db.from("reservas").update({
        cancelada_em: new Date().toISOString(), cancelada_por: auth.user.id,
        ...(atualCard.fnrh_reserva_id ? { fnrh_status: "nao_enviado", fnrh_reserva_id: null, fnrh_concluida: false } : {}),
      }).eq("id", atualCard.id);
      if (!error) { canceladas++; await db.from("fnrh_envios").delete().eq("reserva_id", atualCard.id); }
      continue;
    }
    if (!/confirm/i.test(r.status)) { ignoradas.push(`${quem}: status "${r.status || "sem status"}"`); continue; }
    if (r.checkOut < hoje) { ignoradas.push(`${quem}: estadia já terminou`); continue; }
    if (r.checkOut <= r.checkIn) { ignoradas.push(`${quem}: datas inválidas`); continue; }
    const dados = {
      titular: r.titular || "Hóspede",
      telefone: r.telefone.replace(/\D/g, "") || null,
      check_in: r.checkIn,
      check_out: r.checkOut,
      adultos: Math.min(12, Math.max(1, r.adultos)),
      criancas: Math.min(12, Math.max(0, r.criancas)),
      unidade_id: await idUnidade(r.quarto),
      origem: r.origem || null,
      ota_referencia: ehOta(r.origem) ? r.otaReferencia || r.referencia : null,
    };
    const atual = porRef.get(r.referencia);
    if (atual) {
      const jaFez = Array.isArray(atual.pre_chegadas) ? atual.pre_chegadas.length > 0 : !!atual.pre_chegadas;
      if (jaFez) { ignoradas.push(`${quem}: já fez o check-in online (mantida como está)`); continue; }
      const { error } = await db.from("reservas").update(dados).eq("id", atual.id);
      if (error) ignoradas.push(`${quem}: não foi possível atualizar`); else atualizadas++;
    } else {
      const { error } = await db.from("reservas").insert({
        ...dados, pousada_id: pousadaId, referencia_externa: r.referencia, token: randomBytes(12).toString("hex"), criado_por: auth.user.id,
      });
      if (error) ignoradas.push(`${quem}: não foi possível criar`); else criadas++;
    }
  }

  revalidatePath("/painel");
  const partes = [`${criadas} nova(s)`, `${atualizadas} atualizada(s)`];
  if (canceladas) partes.push(`${canceladas} cancelada(s) na planilha`);
  if (ignoradas.length) partes.push(`${ignoradas.length} ignorada(s)`);
  const aviso = leitura.mapaNovo && semMapas ? " (ligação de colunas não ficou salva: rode a migração 0008 no Supabase)" : "";
  return { ok: true, mensagem: `Importação concluída: ${partes.join(", ")}.${aviso}`, detalhes: ignoradas, ligacaoSalva: usouLigacao };
}
