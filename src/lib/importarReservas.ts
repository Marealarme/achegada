import "server-only";
import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { supabaseServico } from "@/lib/supabase";
import { ehOta } from "@/lib/hotellink";
import { lerPlanilhaReservas, type Indices, type MapaSalvo, type PedidoMapeamento } from "@/lib/importacao";
import { cancelarReserva, ErroFnrh } from "@/lib/fnrh/cliente";

export type ResultadoImportacao = { ok: boolean; mensagem: string; detalhes?: string[]; mapear?: PedidoMapeamento; ligacaoSalva?: boolean };

const jaCanceladaNoGoverno = (e: unknown) => e instanceof ErroFnrh && /situa[cç][aã]o:\s*cancelad/i.test(e.message);
/** Cancela no governo; se já estava cancelada lá, conta como sucesso. */
async function cancelarNoGoverno(pousadaId: string, fnrhReservaId: string) {
  try { await cancelarReserva(pousadaId, fnrhReservaId); }
  catch (e) { if (!jaCanceladaNoGoverno(e)) throw e; }
}

/**
 * Lê a planilha e grava as reservas na pousada. Usada pela tela (Importar reservas) e pelo e-mail de importação.
 * Só chame depois de confirmar de qual pousada é o envio. autorId = quem enviou (null quando veio por e-mail).
 */
export async function aplicarImportacao(pousadaId: string, autorId: string | null, bytes: Uint8Array, opcoes: { manual?: Indices; refazer?: boolean } = {}): Promise<ResultadoImportacao> {
  const db = supabaseServico();

  // ligações de colunas já salvas desta pousada (migração 0008; sem ela, a ligação vale só para este envio)
  const { data: pousadaMapas, error: semMapas } = await db.from("pousadas").select("mapas_planilha").eq("id", pousadaId).maybeSingle();
  const mapas = (semMapas ? [] : (pousadaMapas?.mapas_planilha as MapaSalvo[] | null) ?? []);
  const leitura = lerPlanilhaReservas(bytes, { mapas, manual: opcoes.manual, refazer: opcoes.refazer });
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
    .select("id, referencia_externa, telefone, cancelada_em, checkin_em, fnrh_reserva_id, pre_chegadas(id)").eq("pousada_id", pousadaId).in("referencia_externa", refs.length ? refs : ["-"]);
  if (errExist) return { ok: false, mensagem: "O banco ainda não está pronto para a importação. Rode as migrações 0005 e 0007 no Supabase." };
  type Existente = { id: string; telefone: string | null; pre_chegadas: unknown; cancelada_em: string | null; checkin_em: string | null; fnrh_reserva_id: string | null };
  const porRef = new Map((existentes ?? []).map((r) => [r.referencia_externa as string, r as unknown as Existente]));
  // valor da reserva (migração 0011); sem a coluna, importa normalmente sem o valor
  const { error: semValor } = await db.from("reservas").select("valor_total").limit(1);
  const valores = (r: (typeof reservas)[number]) => {
    if (semValor) return {};
    const v: { valor_total?: number; valor_pago?: number } = {};
    if (r.valorTotal != null) v.valor_total = r.valorTotal;
    if (r.valorPago != null) v.valor_pago = r.valorPago;
    return v;
  };

  let criadas = 0, atualizadas = 0, canceladas = 0, valoresPassados = 0;
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
        cancelada_em: new Date().toISOString(), cancelada_por: autorId,
        ...(atualCard.fnrh_reserva_id ? { fnrh_status: "nao_enviado", fnrh_reserva_id: null, fnrh_concluida: false } : {}),
      }).eq("id", atualCard.id);
      if (!error) { canceladas++; await db.from("fnrh_envios").delete().eq("reserva_id", atualCard.id); }
      continue;
    }
    // confirmada ou já hospedada no sistema (status "Check-in"/"Hospedado"): entra no painel — quem já chegou também precisa da ficha
    const valida = /confirm|check.?in|hospedad|in.?house|checked.?in/i.test(r.status) && !/check.?out/i.test(r.status);
    if (r.checkOut < hoje || !valida) {
      // estadia que já terminou (no sistema fica "Check-out") ou fora do fluxo: não cria nem muda card,
      // só completa o valor de quem já está no painel (relatório de notas fiscais)
      const v = valores(r);
      if (atualCard && !/cancel/i.test(r.status) && Object.keys(v).length) { await db.from("reservas").update(v).eq("id", atualCard.id); valoresPassados++; }
      else ignoradas.push(`${quem}: ${!valida ? `status "${r.status || "sem status"}"` : "estadia já terminou"}`);
      continue;
    }
    if (r.checkOut <= r.checkIn) { ignoradas.push(`${quem}: datas inválidas`); continue; }
    const dados = {
      titular: r.titular || "Hóspede",
      // estrangeiro (+1, +351…) fica com "+" para o WhatsApp não colocar 55 na frente
      telefone: r.telefone.replace(/\D/g, "") ? (r.telefone.trim().startsWith("+") && !r.telefone.replace(/\D/g, "").startsWith("55") ? "+" : "") + r.telefone.replace(/\D/g, "") : null,
      check_in: r.checkIn,
      check_out: r.checkOut,
      adultos: Math.min(12, Math.max(1, r.adultos)),
      criancas: Math.min(12, Math.max(0, r.criancas)),
      unidade_id: await idUnidade(r.quarto),
      origem: r.origem || null,
      ota_referencia: ehOta(r.origem) ? r.otaReferencia || r.referencia : null,
      ...valores(r),
    };
    const atual = porRef.get(r.referencia);
    if (atual) {
      const jaFez = Array.isArray(atual.pre_chegadas) ? atual.pre_chegadas.length > 0 : !!atual.pre_chegadas;
      if (jaFez) {
        // já fez o check-in online: não mexe nos dados da estadia, só atualiza o valor (pode ter mudado no sistema)
        const v = valores(r);
        if (Object.keys(v).length) await db.from("reservas").update(v).eq("id", atual.id);
        ignoradas.push(`${quem}: já fez o check-in online (mantida como está)`); continue;
      }
      // telefone já válido no card (pode ter sido corrigido à mão no painel): a planilha não sobrescreve
      const foneCard = (atual.telefone ?? "").replace(/\D/g, "");
      const { telefone, ...resto } = dados;
      const { error } = await db.from("reservas").update(foneCard.length >= 10 ? resto : { ...resto, telefone }).eq("id", atual.id);
      if (error) ignoradas.push(`${quem}: não foi possível atualizar`); else atualizadas++;
    } else {
      const { error } = await db.from("reservas").insert({
        ...dados, pousada_id: pousadaId, referencia_externa: r.referencia, token: randomBytes(12).toString("hex"), criado_por: autorId,
      });
      if (error) ignoradas.push(`${quem}: não foi possível criar`); else criadas++;
    }
  }

  revalidatePath("/painel");
  const partes = [`${criadas} nova(s)`, `${atualizadas} atualizada(s)`];
  if (canceladas) partes.push(`${canceladas} cancelada(s) na planilha`);
  if (valoresPassados) partes.push(`valor completado em ${valoresPassados} estadia(s) que já terminaram`);
  if (ignoradas.length) partes.push(`${ignoradas.length} ignorada(s)`);
  const aviso = leitura.mapaNovo && semMapas ? " (ligação de colunas não ficou salva: rode a migração 0008 no Supabase)" : "";
  return { ok: true, mensagem: `Importação concluída: ${partes.join(", ")}.${aviso}`, detalhes: ignoradas, ligacaoSalva: usouLigacao };
}
