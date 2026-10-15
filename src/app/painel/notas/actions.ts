"use server";

import { revalidatePath } from "next/cache";
import { podeConfigurar, sessaoEquipe, temNotas } from "@/lib/sessao";
import { supabaseServico } from "@/lib/supabase";
import { cadastrarWebhook, cancelarNfse, mensagemErro, type NfseConfig } from "@/lib/notas/digisan";
import { chaveDigisan, urlWebhook } from "@/lib/notas/chave";
import { atualizarNota, emitirReserva, notasNoPeriodo, type Nota } from "@/lib/notas/emissao";
import { linhasNotas } from "@/lib/notas/linhas";

const LOTE_MAX = 25;

async function contexto() {
  const s = await sessaoEquipe({ exigirAssinatura: true });
  if (!podeConfigurar(s)) throw new Error("Só o dono ou a gerência podem emitir notas.");
  if (!temNotas(s)) throw new Error("O adicional de notas fiscais não está ativo nesta assinatura.");
  const db = supabaseServico(); // notas só são gravadas pelo servidor; tudo filtrado pela pousada da sessão
  const { data } = await db.from("pousadas").select("nfse_config").eq("id", s.pousada.id).maybeSingle();
  const cfg = (data?.nfse_config ?? null) as (NfseConfig & { liberada?: boolean; webhookId?: string }) | null;
  const chave = (await chaveDigisan(db, s.pousada.id))?.chave ?? null;
  return { s, db, cfg, chave };
}

export type ResultadoEmissao = { ok: boolean; mensagens: string[] };

/** Emite as notas das reservas escolhidas (já confirmadas na tela). */
export async function emitirNotas(reservaIds: string[]): Promise<ResultadoEmissao> {
  const { s, db, cfg, chave } = await contexto();
  if (!chave || !cfg?.prestadorCnpj || !cfg.servico) return { ok: false, mensagens: ["A emissão ainda não está configurada (chave e serviço da Digisan)."] };
  const ids = [...new Set(reservaIds)].slice(0, LOTE_MAX);
  if (!ids.length) return { ok: false, mensagens: ["Nenhuma reserva escolhida."] };

  // fase de teste: até você liberar, só UMA nota pode ser emitida
  if (!cfg.liberada) {
    const { count } = await db.from("notas_fiscais").select("id", { count: "exact", head: true }).eq("pousada_id", s.pousada.id).not("digisan_id", "is", null).neq("status", "rejeitada"); // rejeitada não gerou nota: pode tentar de novo
    if ((count ?? 0) > 0 || ids.length > 1)
      return { ok: false, mensagens: ["Fase de teste: só uma nota pode ser emitida até a primeira ser conferida e a emissão ser liberada."] };
  }

  const limite = cfg.limiteMensal ?? 160;
  const usadas = await notasNoPeriodo(db, s.pousada.id, cfg.cicloDia);
  if (usadas + ids.length > limite) return { ok: false, mensagens: [`Limite do plano: ${usadas} de ${limite} notas já emitidas neste período.`] };

  const linhas = await linhasNotas(db, s.pousada.id, null, null, ids);
  const mensagens: string[] = [];
  let ok = 0;
  for (const l of linhas) {
    const r = await emitirReserva(db, s.pousada.id, cfg, chave, l, s.userId);
    mensagens.push(r.mensagem);
    if (r.ok) ok++;
  }
  // a prefeitura costuma responder em segundos: já tenta pegar o resultado
  if (ok) {
    await new Promise((res) => setTimeout(res, 4000));
    await atualizarPendentes(db, s.pousada.id, cfg, chave);
  }
  revalidatePath("/painel/notas");
  return { ok: ok > 0, mensagens };
}

async function atualizarPendentes(db: ReturnType<typeof supabaseServico>, pousadaId: string, cfg: NfseConfig | null, chave: string | null) {
  if (!chave) return;
  const { data } = await db.from("notas_fiscais").select("id, pousada_id, reserva_id, id_externo, digisan_id, status, numero, mensagem, competencia, criada_em")
    .eq("pousada_id", pousadaId).in("status", ["enviando", "processando", "verificar", "cancelando"]).limit(40);
  for (const n of (data ?? []) as Nota[]) await atualizarNota(db, cfg, chave, n);
}

/** Botão "Atualizar status": consulta na Digisan as notas que ainda não terminaram. */
export async function atualizarStatus(): Promise<void> {
  const { s, db, cfg, chave } = await contexto();
  await atualizarPendentes(db, s.pousada.id, cfg, chave);
  revalidatePath("/painel/notas");
}

/** Cancela uma nota autorizada (com confirmação na tela). */
export async function cancelarNota(notaId: string, codigo: number, motivo: string): Promise<{ ok: boolean; mensagem: string }> {
  const { s, db, chave } = await contexto();
  if (!chave) return { ok: false, mensagem: "A chave da Digisan desta pousada não está cadastrada." };
  const { data: n } = await db.from("notas_fiscais").select("id, digisan_id, status").eq("id", notaId).eq("pousada_id", s.pousada.id).maybeSingle();
  if (!n?.digisan_id || n.status !== "autorizada") return { ok: false, mensagem: "Só é possível cancelar nota autorizada." };
  if (![1, 2, 3, 4, 5].includes(codigo) || motivo.trim().length < 15) return { ok: false, mensagem: "Escolha o motivo e descreva em pelo menos 15 letras." };
  const r = await cancelarNfse(chave, n.digisan_id, codigo, motivo.trim().slice(0, 255));
  if (!r.ok) return { ok: false, mensagem: mensagemErro(r) };
  await db.from("notas_fiscais").update({ status: "cancelando", cancelamento_motivo: motivo.trim().slice(0, 255), atualizada_em: new Date().toISOString() }).eq("id", n.id);
  revalidatePath("/painel/notas");
  return { ok: true, mensagem: "Cancelamento pedido. A prefeitura confirma em instantes." };
}

/** Cadastra na Digisan o aviso automático (webhook) de autorizada / rejeitada / cancelada. Uma vez só. */
export async function ativarAvisos(): Promise<void> {
  const { s, db, cfg, chave } = await contexto();
  if (s.perfil.papel !== "dono" || !cfg || !chave) return;
  const r = await cadastrarWebhook(chave, urlWebhook(s.pousada.id));
  if (r.ok) await db.from("pousadas").update({ nfse_config: { ...cfg, webhookId: String(r.corpo?.id ?? "ok") } }).eq("id", s.pousada.id);
  revalidatePath("/painel/notas");
}
