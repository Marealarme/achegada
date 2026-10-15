import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { noites } from "@/lib/util";

// Linhas do relatório "Notas fiscais": uma por reserva com CHECK-OUT no período, sem canceladas e sem fichas de teste.
// Usado pela planilha Excel e pela tela de emissão de NFS-e — as duas mostram exatamente as mesmas reservas e pendências.

export type Tomador = {
  nome: string; cpf: string | null; passaporte: string | null; email: string | null; telefone: string | null;
  cep: string | null; logradouro: string | null; numero: string | null; complemento: string | null; bairro: string | null;
  cidade: string | null; cidade_ibge: number | null; uf: string | null; pais_residencia: string | null; nacionalidade: string | null;
};

export type LinhaNota = {
  reservaId: string;
  numeroReserva: string;   // "" quando a reserva não tem nº do sistema
  codigoCanal: string;
  canal: string;
  checkIn: string;         // AAAA-MM-DD
  checkOut: string;
  noites: number;
  chale: string;
  titular: string;         // nome do tomador (ficha) ou do card
  telefoneCard: string | null;
  tomador: Tomador | null; // null = sem check-in online
  estrangeiro: boolean;
  total: number | null;
  pago: number | null;
  pendencias: string[];    // vazio = OK
};

type Res = {
  id: string; titular: string; telefone: string | null; check_in: string; check_out: string; origem: string | null;
  referencia_externa?: string | null; ota_referencia?: string | null; valor_total?: number | null; valor_pago?: number | null;
  unidades: { nome: string } | null; hospedes_reserva: { papel: string; hospedes: Tomador | null }[];
};

const HOSP = "nome, cpf, passaporte, email, telefone, cep, logradouro, numero, complemento, bairro, cidade, cidade_ibge, uf, pais_residencia, nacionalidade";
const campos = (extra: string) => `id, titular, telefone, check_in, check_out, origem${extra}, unidades(nome), hospedes_reserva(papel, hospedes(${HOSP}))`;

/** Nº da reserva do sistema (as referências "PL-…" são internas, geradas quando a planilha não tinha código). */
export const numeroReserva = (ref: string | null | undefined) => (ref && !ref.startsWith("PL-") ? ref : "");

export function montarLinha(r: Res): LinhaNota {
  const h = r.hospedes_reserva.find((x) => x.papel === "titular")?.hospedes ?? null;
  const total = r.valor_total == null ? null : Number(r.valor_total);
  const pago = r.valor_pago == null ? null : Number(r.valor_pago);
  const estrangeiro = !!h?.pais_residencia && h.pais_residencia !== "BR";
  const pendencias = [
    !numeroReserva(r.referencia_externa) ? "sem reserva" : "",
    !h || (!h.cpf && !h.passaporte) ? "sem CPF" : "",
    !h || (!estrangeiro && (!h.cep || !h.logradouro)) ? "sem endereço" : "",
    total == null || total === 0 ? "sem valor" : "",
  ].filter(Boolean);
  return {
    reservaId: r.id,
    numeroReserva: numeroReserva(r.referencia_externa),
    codigoCanal: r.ota_referencia ?? "",
    canal: r.origem ?? "",
    checkIn: r.check_in,
    checkOut: r.check_out,
    noites: noites(r.check_in, r.check_out),
    chale: r.unidades?.nome ?? "",
    titular: h?.nome ?? r.titular,
    telefoneCard: r.telefone,
    tomador: h,
    estrangeiro,
    total,
    pago,
    pendencias,
  };
}

/** Reservas com check-out entre `de` e `ate` (inclusive). Tolera bancos sem as migrações mais novas. */
export async function linhasNotas(db: SupabaseClient, pousadaId: string, de: string | null, ate: string | null, reservaIds?: string[]): Promise<LinhaNota[]> {
  const tentativas = [
    [", referencia_externa, ota_referencia, valor_total, valor_pago", true],
    [", referencia_externa, ota_referencia, valor_total, valor_pago", false],
    [", referencia_externa, ota_referencia", false],
    ["", false],
  ] as const;
  for (const [extra, semTeste] of tentativas) {
    let q = db.from("reservas").select(campos(extra)).eq("pousada_id", pousadaId).is("cancelada_em", null).order("check_out").limit(5000);
    if (semTeste) q = q.is("descartada_em", null);
    if (de) q = q.gte("check_out", de);
    if (ate) q = q.lte("check_out", ate);
    if (reservaIds) q = q.in("id", reservaIds.length ? reservaIds : ["00000000-0000-0000-0000-000000000000"]);
    const { data, error } = await q;
    if (!error) return ((data ?? []) as unknown as Res[]).map(montarLinha);
  }
  return [];
}
