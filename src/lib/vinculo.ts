import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

// Vínculo entre a ficha (card com check-in online) e a reserva do sistema (card importado com nº da reserva).
// Regra: mesma data de check-in + (nome do titular compatível OU telefone OU e-mail).
// Só vincula quando o casamento é único dos dois lados; com 0 ou 2+ candidatos, deixa para a tela "Fichas sem reserva".

const PARTICULAS = new Set(["de", "da", "do", "das", "dos", "e", "del", "van", "von"]);

/** Palavras do nome sem acento, minúsculas, sem partículas ("de", "da"…). */
export function palavrasNome(nome: string): string[] {
  return nome.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z\s]/g, " ")
    .split(/\s+/).filter((p) => p.length > 1 && !PARTICULAS.has(p));
}

/** Palavras iguais, ou com 1 letra de diferença quando têm 5+ letras ("Teixiera" = "Teixeira"). */
function palavraIgual(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.min(a.length, b.length) < 5 || Math.abs(a.length - b.length) > 1) return false;
  let i = 0, j = 0, dif = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++dif > 2) return false;
    if (a.length > b.length) i++; else if (b.length > a.length) j++; else { i++; j++; }
  }
  dif += a.length - i + (b.length - j);
  // troca de duas letras vizinhas conta como 1 diferença
  return dif <= 1 || (dif === 2 && a.length === b.length && [...a].sort().join("") === [...b].sort().join(""));
}

/** Nome parcial vale: todas as palavras do nome mais curto aparecem no mais longo ("Marcos Rangel" ⊂ "Marcos Rangel da Silva"). */
export function nomesCompativeis(a: string, b: string): boolean {
  const A = palavrasNome(a), B = palavrasNome(b);
  if (!A.length || !B.length) return false;
  const [menor, maior] = A.length <= B.length ? [A, B] : [B, A];
  return menor.every((p) => maior.some((q) => palavraIgual(p, q)));
}

/** Últimos 8 dígitos do telefone (ignora DDI/DDD e o 9 extra). */
const fone = (s: string | null | undefined) => { const d = String(s ?? "").replace(/\D/g, ""); return d.length >= 8 ? d.slice(-8) : ""; };
const email = (s: string | null | undefined) => { const e = String(s ?? "").trim().toLowerCase(); return e.includes("@") ? e : ""; };

export type Pessoa = { nomes: string[]; telefones: (string | null | undefined)[]; emails: (string | null | undefined)[] };

/** Por que os dois são compatíveis ("nome", "telefone", "e-mail") ou null. */
export function motivoCompativel(a: Pessoa, b: Pessoa): string | null {
  if (a.nomes.some((x) => b.nomes.some((y) => nomesCompativeis(x, y)))) return "nome";
  const fa = new Set(a.telefones.map(fone).filter(Boolean));
  if (b.telefones.map(fone).some((f) => f && fa.has(f))) return "telefone";
  const ea = new Set(a.emails.map(email).filter(Boolean));
  if (b.emails.map(email).some((e) => e && ea.has(e))) return "e-mail";
  return null;
}

/** Pares únicos: cada ficha com exatamente 1 reserva compatível E essa reserva com exatamente 1 ficha compatível. */
export function paresUnicos<F extends { id: string; dia: string; p: Pessoa }, R extends { id: string; dia: string; p: Pessoa }>(fichas: F[], reservas: R[]) {
  const porFicha = new Map<string, R[]>(), porReserva = new Map<string, F[]>();
  for (const f of fichas) for (const r of reservas) {
    if (f.dia !== r.dia || !motivoCompativel(f.p, r.p)) continue;
    porFicha.set(f.id, [...(porFicha.get(f.id) ?? []), r]);
    porReserva.set(r.id, [...(porReserva.get(r.id) ?? []), f]);
  }
  const pares: { ficha: F; reserva: R }[] = [];
  for (const f of fichas) {
    const rs = porFicha.get(f.id) ?? [];
    if (rs.length === 1 && (porReserva.get(rs[0].id) ?? []).length === 1) pares.push({ ficha: f, reserva: rs[0] });
  }
  return pares;
}

/** Pessoa de um card: titular do card + titular da ficha (nome, telefone, e-mail). */
export function pessoaDoCard(c: { titular: string; telefone: string | null; hospedes_reserva?: { papel: string; hospedes: { nome: string | null; telefone?: string | null; email?: string | null } | null }[] | null }): Pessoa {
  const tit = (c.hospedes_reserva ?? []).find((x) => x.papel === "titular")?.hospedes;
  return {
    nomes: [c.titular, tit?.nome ?? ""].filter(Boolean),
    telefones: [c.telefone, tit?.telefone],
    emails: [tit?.email],
  };
}

const ehNumeroReal = (ref: string | null | undefined) => !!ref && !ref.startsWith("PL-");

/**
 * Junta a ficha (card sem nº de reserva) com a reserva importada (card com nº, sem check-in online):
 * o card da ficha recebe nº, canal, código no canal e valor; o card da reserva sai da lista (cancelado como duplicado).
 * db precisa enxergar só a pousada (sessão da equipe) ou ser o serviço com pousadaId conferido.
 */
export async function vincular(db: SupabaseClient, pousadaId: string, fichaId: string, reservaId: string, autorId: string | null): Promise<string> {
  const campos = "id, pousada_id, check_in, referencia_externa, ota_referencia, origem, valor_total, valor_pago, unidade_id, telefone, cancelada_em, descartada_em, pre_chegadas(id)";
  const [{ data: f }, { data: r }] = await Promise.all([
    db.from("reservas").select(campos).eq("id", fichaId).eq("pousada_id", pousadaId).maybeSingle(),
    db.from("reservas").select(campos).eq("id", reservaId).eq("pousada_id", pousadaId).maybeSingle(),
  ]);
  type Card = { id: string; check_in: string; referencia_externa: string | null; ota_referencia: string | null; origem: string | null; valor_total: number | null; valor_pago: number | null; unidade_id: string | null; telefone: string | null; cancelada_em: string | null; descartada_em: string | null; pre_chegadas: unknown };
  const ficha = f as Card | null, res = r as Card | null;
  if (!ficha || !res) return "Não encontrei a ficha ou a reserva.";
  if (ficha.id === res.id) return "Escolha uma reserva diferente da ficha.";
  if (ficha.referencia_externa) return "Esta ficha já está ligada a uma reserva.";
  if (!ehNumeroReal(res.referencia_externa)) return "Esta reserva não tem número do sistema.";
  const temFicha = Array.isArray(res.pre_chegadas) ? res.pre_chegadas.length > 0 : !!res.pre_chegadas;
  if (temFicha) return "A reserva escolhida já tem check-in online de outro hóspede.";
  const agora = new Date().toISOString();

  // 1) a reserva importada solta o número (o nº é único por pousada) e sai da lista como duplicada
  const { error: e1 } = await db.from("reservas").update({
    referencia_externa: null,
    ...(res.cancelada_em ? {} : { cancelada_em: agora, cancelada_por: autorId }),
  }).eq("id", res.id);
  if (e1) return "Não foi possível vincular agora. Tente de novo.";
  // 2) a ficha recebe os dados da reserva (sem apagar o que a equipe já tinha preenchido)
  const { error: e2 } = await db.from("reservas").update({
    referencia_externa: res.referencia_externa,
    ota_referencia: ficha.ota_referencia ?? res.ota_referencia,
    origem: ficha.origem ?? res.origem,
    valor_total: res.valor_total ?? ficha.valor_total,
    valor_pago: res.valor_pago ?? ficha.valor_pago,
    unidade_id: ficha.unidade_id ?? res.unidade_id,
    telefone: ficha.telefone ?? res.telefone,
    vinculada_em: agora,
  }).eq("id", ficha.id);
  if (e2) {
    // desfaz o passo 1 para não perder o número
    await db.from("reservas").update({ referencia_externa: res.referencia_externa, ...(res.cancelada_em ? {} : { cancelada_em: null, cancelada_por: null }) }).eq("id", res.id);
    return "Não foi possível vincular agora. Tente de novo.";
  }
  return "";
}

/** Depois do check-in online numa ficha sem nº: procura a reserva importada da mesma data e vincula se for única. */
export async function vincularAposCheckin(db: SupabaseClient, pousadaId: string, fichaId: string) {
  try {
    const sel = "id, titular, telefone, check_in, referencia_externa, hospedes_reserva(papel, hospedes(nome, telefone, email)), pre_chegadas(id)";
    const { data: f } = await db.from("reservas").select(sel).eq("id", fichaId).maybeSingle();
    type C = { id: string; titular: string; telefone: string | null; check_in: string; referencia_externa: string | null; hospedes_reserva: { papel: string; hospedes: { nome: string | null; telefone: string | null; email: string | null } | null }[]; pre_chegadas: unknown };
    const ficha = f as C | null;
    if (!ficha || ficha.referencia_externa) return;
    const { data: mesmoDia } = await db.from("reservas").select(sel).eq("pousada_id", pousadaId).eq("check_in", ficha.check_in)
      .is("cancelada_em", null).is("descartada_em", null);
    const cards = (mesmoDia ?? []) as unknown as C[];
    const temFicha = (c: C) => (Array.isArray(c.pre_chegadas) ? c.pre_chegadas.length > 0 : !!c.pre_chegadas);
    const reservas = cards.filter((c) => ehNumeroReal(c.referencia_externa) && !temFicha(c)).map((c) => ({ id: c.id, dia: c.check_in, p: pessoaDoCard(c) }));
    const fichas = cards.filter((c) => !c.referencia_externa).map((c) => ({ id: c.id, dia: c.check_in, p: pessoaDoCard(c) }));
    const par = paresUnicos(fichas, reservas).find((x) => x.ficha.id === ficha.id);
    if (par) await vincular(db, pousadaId, ficha.id, par.reserva.id, null);
  } catch {
    /* o vínculo é um extra: nunca atrapalha o check-in do hóspede */
  }
}
