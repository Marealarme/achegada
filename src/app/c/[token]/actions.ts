"use server";

import { headers } from "next/headers";
import { supabaseServico } from "@/lib/supabase";
import { cpfValido, somenteDigitos } from "@/lib/util";

export type PessoaEntrada = { nome: string; cpf: string; nascimento: string };
export type CheckinEntrada = {
  token: string;
  pessoas: PessoaEntrada[];
  horario: string;
  placa: string;
  pet: { tem: boolean; nome: string; especie: string; porte: string };
  lateCheckout: boolean;
  aceiteRegras: boolean;
  aceitePet: boolean;
  marketing: boolean;
};

const ESPECIES = ["Cachorro", "Gato", "Outro"];
const PORTES = ["Pequeno", "Médio", "Grande"];

export async function enviarCheckin(e: CheckinEntrada): Promise<{ ok: true } | { ok: false; erro: string }> {
  const db = supabaseServico();

  const { data: reserva } = await db
    .from("reservas")
    .select("id, pousada_id, check_out, telefone")
    .eq("token", String(e.token ?? ""))
    .maybeSingle();
  if (!reserva) return { ok: false, erro: "Link inválido. Peça um novo link à recepção." };
  if (Date.parse(reserva.check_out) + 2 * 864e5 < Date.now()) return { ok: false, erro: "Este link expirou." };

  const { data: jaFeito } = await db.from("pre_chegadas").select("id").eq("reserva_id", reserva.id).maybeSingle();
  if (jaFeito) return { ok: false, erro: "O check-in desta reserva já foi feito." };

  // validação no servidor (a tela também valida, mas não confiamos só nela)
  // o hóspede pode ajustar a quantidade (veio sozinho, ou com mais gente): de 1 a 12 pessoas
  if (!Array.isArray(e.pessoas) || e.pessoas.length < 1 || e.pessoas.length > 12) return { ok: false, erro: "Informe de 1 a 12 hóspedes." };
  const cpfs = new Set<string>();
  for (const p of e.pessoas) {
    const nome = String(p.nome ?? "").trim();
    const cpf = somenteDigitos(p.cpf);
    if (nome.split(/\s+/).length < 2 || nome.length > 120) return { ok: false, erro: "Confira os nomes completos." };
    if (!cpfValido(cpf)) return { ok: false, erro: "Há um CPF inválido." };
    if (cpfs.has(cpf)) return { ok: false, erro: "O mesmo CPF aparece duas vezes." };
    cpfs.add(cpf);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(p.nascimento ?? "")) return { ok: false, erro: "Confira as datas de nascimento." };
  }
  if (!e.aceiteRegras) return { ok: false, erro: "É preciso aceitar as regras da casa." };
  if (e.pet?.tem && (!e.aceitePet || !String(e.pet.nome ?? "").trim())) return { ok: false, erro: "Complete os dados do pet e aceite o termo." };

  const agora = new Date().toISOString();
  const h = await headers();
  const ip = (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || null;

  // 1. cadastro permanente: cria ou atualiza cada pessoa (chave = pousada + CPF)
  const ids: string[] = [];
  for (const [i, p] of e.pessoas.entries()) {
    const linha: Record<string, unknown> = {
      pousada_id: reserva.pousada_id,
      nome: p.nome.trim(),
      cpf: somenteDigitos(p.cpf),
      data_nascimento: p.nascimento,
      updated_at: agora,
    };
    if (i === 0) {
      if (reserva.telefone) linha.telefone = reserva.telefone;
      if (e.marketing) linha.consentimento_marketing_em = agora;
    }
    const { data, error } = await db.from("hospedes").upsert(linha, { onConflict: "pousada_id,cpf" }).select("id").single();
    if (error || !data) return { ok: false, erro: "Não conseguimos salvar agora. Tente de novo em instantes." };
    ids.push(data.id);
  }

  // 2. liga as pessoas a esta estadia
  const { error: errLig } = await db.from("hospedes_reserva").upsert(
    ids.map((id, i) => ({ hospede_id: id, reserva_id: reserva.id, pousada_id: reserva.pousada_id, papel: i === 0 ? "titular" : "acompanhante" })),
    { onConflict: "hospede_id,reserva_id" }
  );
  if (errLig) return { ok: false, erro: "Não conseguimos salvar agora. Tente de novo em instantes." };

  // 3. dados de chegada e aceites
  const { error: errPre } = await db.from("pre_chegadas").insert({
    reserva_id: reserva.id,
    pousada_id: reserva.pousada_id,
    horario_chegada: /^\d{2}:\d{2}$/.test(e.horario) ? e.horario : null,
    placa: String(e.placa ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 7) || null,
    pet_tem: !!e.pet?.tem,
    pet_nome: e.pet?.tem ? String(e.pet.nome).trim().slice(0, 60) : null,
    pet_especie: e.pet?.tem && ESPECIES.includes(e.pet.especie) ? e.pet.especie : null,
    pet_porte: e.pet?.tem && PORTES.includes(e.pet.porte) ? e.pet.porte : null,
    late_checkout: !!e.lateCheckout,
    aceite_regras_em: agora,
    aceite_pet_em: e.pet?.tem ? agora : null,
    ip,
  });
  if (errPre) return { ok: false, erro: "Não conseguimos salvar agora. Tente de novo em instantes." };

  return { ok: true };
}
