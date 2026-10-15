import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { consultarNfse, emitirNfse, mensagemErro, montarNfse, procurarPorIdExterno, statusDoApp, type NfseConfig } from "./digisan";
import type { LinhaNota } from "./linhas";

export type Nota = {
  id: string; pousada_id: string; reserva_id: string; id_externo: string; digisan_id: string | null; status: string;
  numero: string | null; mensagem: string | null; competencia: string | null; criada_em: string;
};

/** Período do plano da Digisan: do dia `cicloDia` de um mês ao mesmo dia do mês seguinte (sem ciclo = mês corrente). */
export function periodoPlano(cicloDia?: number): { ini: string; fim: string; rotulo: string } {
  const hoje = new Date(Date.now() - 3 * 3600e3);
  const a = hoje.getUTCFullYear(), m = hoje.getUTCMonth(), d = hoje.getUTCDate();
  const dia = cicloDia && cicloDia >= 1 && cicloDia <= 28 ? cicloDia : 1;
  const iniMes = d >= dia ? m : m - 1;
  const ini = new Date(Date.UTC(a, iniMes, dia)), fim = new Date(Date.UTC(a, iniMes + 1, dia));
  const br = (x: Date) => `${String(x.getUTCDate()).padStart(2, "0")}/${String(x.getUTCMonth() + 1).padStart(2, "0")}`;
  return { ini: ini.toISOString().slice(0, 10), fim: fim.toISOString().slice(0, 10), rotulo: `${br(ini)} a ${br(fim)}` };
}

/** Quantas notas a pousada já mandou para a Digisan no período do plano (rejeitadas não contam: a Digisan não cobra). */
export async function notasNoPeriodo(db: SupabaseClient, pousadaId: string, cicloDia?: number): Promise<number> {
  const p = periodoPlano(cicloDia);
  const { count } = await db.from("notas_fiscais").select("id", { count: "exact", head: true })
    .eq("pousada_id", pousadaId).not("digisan_id", "is", null).neq("status", "rejeitada").gte("criada_em", `${p.ini}T03:00:00Z`).lt("criada_em", `${p.fim}T03:00:00Z`);
  return count ?? 0;
}

/** Grava no A Chegada o que a Digisan informou sobre a nota (consulta, aviso ou listagem). */
export async function aplicarRetorno(db: SupabaseClient, notaId: string, dto: Record<string, unknown>) {
  const { status, cancelamentoRecusado } = statusDoApp(dto.status as string | undefined);
  const canc = (dto.cancelamento ?? {}) as Record<string, unknown>;
  const agora = new Date().toISOString();
  const msg = cancelamentoRecusado
    ? `Cancelamento recusado: ${String(canc.mensagemRejeicao ?? dto.mensagem ?? "sem motivo informado")}`
    : status === "rejeitada" ? String(dto.mensagemRejeicao ?? dto.mensagem ?? "Rejeitada pela prefeitura")
    : status === "processando" && dto.status ? `Situação na Digisan: ${String(dto.status)}`
    : null;
  await db.from("notas_fiscais").update({
    status,
    ...(dto.id ? { digisan_id: String(dto.id) } : {}),
    ...(dto.numero != null && String(dto.numero) !== "0" ? { numero: String(dto.numero) } : {}),
    ...(dto.serie != null ? { serie: String(dto.serie) } : {}),
    ...(dto.codigoVerificacao ? { codigo_verificacao: String(dto.codigoVerificacao) } : {}),
    mensagem: msg,
    ...(status === "autorizada" && !cancelamentoRecusado ? { autorizada_em: String(dto.dataAutorizacao ?? agora) } : {}),
    ...(status === "cancelada" ? { cancelada_em: agora } : {}),
    atualizada_em: agora,
  }).eq("id", notaId);
}

/**
 * Emite a nota de UMA reserva. Regras de segurança:
 *  - só reserva sem pendência e com nº;
 *  - antes de chamar a Digisan, grava a nota como "enviando" — o índice único do banco impede uma 2ª nota ativa da mesma reserva;
 *  - se a resposta se perder (rede/timeout), a nota fica "verificar" e NUNCA é reenviada às cegas: o app procura na Digisan pelo idExterno.
 */
export async function emitirReserva(db: SupabaseClient, pousadaId: string, cfg: NfseConfig, l: LinhaNota, autorId: string | null): Promise<{ ok: boolean; mensagem: string }> {
  if (l.pendencias.length || !l.numeroReserva || !l.total) return { ok: false, mensagem: `${l.titular}: tem pendência (${l.pendencias.join(", ") || "sem valor"})` };

  const { data: nota, error } = await db.from("notas_fiscais").insert({
    pousada_id: pousadaId, reserva_id: l.reservaId, id_externo: l.numeroReserva, status: "enviando",
    valor: l.total, competencia: l.checkOut, criada_por: autorId,
  }).select("id").single();
  if (error || !nota) {
    return { ok: false, mensagem: error?.code === "23505" ? `${l.titular}: esta reserva já tem nota emitida ou em processamento` : `${l.titular}: não foi possível registrar a nota` };
  }

  const r = await emitirNfse(montarNfse(l, cfg));
  if (r.ok && r.corpo?.id) {
    await db.from("notas_fiscais").update({ digisan_id: String(r.corpo.id), status: "processando", atualizada_em: new Date().toISOString() }).eq("id", nota.id);
    if (r.corpo.status) await aplicarRetorno(db, nota.id, r.corpo);
    return { ok: true, mensagem: `${l.titular}: enviada` };
  }
  if (r.status >= 400 && r.status < 500 && r.status !== 408 && r.status !== 429) {
    // recusada na validação: nenhuma nota foi criada na Digisan; libera para tentar de novo depois de corrigir
    await db.from("notas_fiscais").update({ status: "rejeitada", mensagem: mensagemErro(r), atualizada_em: new Date().toISOString() }).eq("id", nota.id);
    return { ok: false, mensagem: `${l.titular}: ${mensagemErro(r)}` };
  }
  // resposta perdida ou Digisan fora do ar: pode ou não ter criado a nota → conferir antes de qualquer reenvio
  await db.from("notas_fiscais").update({ status: "verificar", mensagem: mensagemErro(r), atualizada_em: new Date().toISOString() }).eq("id", nota.id);
  return { ok: false, mensagem: `${l.titular}: sem resposta da Digisan — vou conferir antes de qualquer reenvio` };
}

/** Atualiza a nota consultando a Digisan (pelo id; sem id, procura pelo idExterno). */
export async function atualizarNota(db: SupabaseClient, cfg: NfseConfig | null, n: Nota): Promise<void> {
  if (n.digisan_id) {
    const r = await consultarNfse(n.digisan_id);
    if (r.ok && r.corpo) await aplicarRetorno(db, n.id, r.corpo);
    else await db.from("notas_fiscais").update({ mensagem: `Consulta à Digisan falhou: ${mensagemErro(r)}`, atualizada_em: new Date().toISOString() }).eq("id", n.id);
    return;
  }
  if (!cfg) return;
  const achada = await procurarPorIdExterno(cfg.prestadorCnpj, n.id_externo, n.competencia ?? n.criada_em.slice(0, 10));
  if (achada) { await aplicarRetorno(db, n.id, achada); return; }
  // não existe na Digisan: o envio não chegou → libera a reserva para emitir de novo
  if (n.status === "verificar" && Date.now() - Date.parse(n.criada_em) > 10 * 60_000)
    await db.from("notas_fiscais").update({ status: "rejeitada", mensagem: "O envio não chegou à Digisan. Pode emitir de novo.", atualizada_em: new Date().toISOString() }).eq("id", n.id);
}
