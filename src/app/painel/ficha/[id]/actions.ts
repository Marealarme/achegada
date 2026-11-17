"use server";

import { revalidatePath } from "next/cache";
import { sessaoEquipe } from "@/lib/sessao";
import { supabaseServico } from "@/lib/supabase";
import { cpfValido, somenteDigitos } from "@/lib/util";

export type EstadoTomador = { ok?: boolean; erro?: string; campo?: string };

const txt = (f: FormData, k: string, max = 120) => String(f.get(k) ?? "").trim().slice(0, max);

/**
 * A equipe completa o titular da reserva (nome, CPF e endereço) quando o hóspede não fez o check-in online,
 * para a reserva poder ter nota fiscal. Não mexe na FNRH.
 */
export async function completarTomador(_: EstadoTomador, f: FormData): Promise<EstadoTomador> {
  const s = await sessaoEquipe({ exigirAssinatura: true });
  const reservaId = txt(f, "reserva_id", 40);
  if (!/^[0-9a-f-]{36}$/i.test(reservaId)) return { erro: "Reserva inválida. Recarregue a página." };

  const nome = txt(f, "nome", 120);
  const cpf = somenteDigitos(txt(f, "cpf", 20));
  const cep = somenteDigitos(txt(f, "cep", 12));
  const logradouro = txt(f, "logradouro"), numero = txt(f, "numero", 20), complemento = txt(f, "complemento", 60);
  const bairro = txt(f, "bairro", 80), cidade = txt(f, "cidade", 80), uf = txt(f, "uf", 2).toUpperCase();
  const ibge = Number(somenteDigitos(txt(f, "cidade_ibge", 7))) || null;
  const email = txt(f, "email", 120);

  if (nome.length < 3) return { erro: "Informe o nome completo do titular.", campo: "nome" };
  if (!cpfValido(cpf)) return { erro: "CPF inválido. Confira os 11 números.", campo: "cpf" };
  if (cep.length !== 8) return { erro: "Informe o CEP com 8 números.", campo: "cep" };
  if (!logradouro) return { erro: "Informe a rua.", campo: "logradouro" };
  if (!numero) return { erro: "Informe o número (ou S/N).", campo: "numero" };
  if (!bairro) return { erro: "Informe o bairro.", campo: "bairro" };
  if (!cidade || uf.length !== 2) return { erro: "Informe a cidade e a UF (ex.: SP).", campo: "cidade" };
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { erro: "E-mail inválido (pode deixar em branco).", campo: "email" };

  // confere pela sessão (RLS) que a reserva é desta pousada; a gravação usa a chave de serviço (a equipe só lê hóspedes)
  const { data: res } = await s.db.from("reservas").select("id").eq("id", reservaId).eq("pousada_id", s.pousada.id).maybeSingle();
  if (!res) return { erro: "Reserva não encontrada." };
  const db = supabaseServico();

  const dados = {
    pousada_id: s.pousada.id, nome, cpf, cep, logradouro, numero, complemento: complemento || null, bairro, cidade, uf,
    cidade_ibge: ibge, pais_residencia: "BR", nacionalidade: "BR", ...(email ? { email } : {}),
  };
  let { data: h, error } = await db.from("hospedes").upsert(dados, { onConflict: "pousada_id,cpf" }).select("id").single();
  if (error) {
    // banco sem alguma coluna nova: grava o básico
    const basico = { pousada_id: s.pousada.id, nome, cpf, cep, logradouro, numero, complemento: complemento || null, bairro, cidade, uf };
    ({ data: h, error } = await db.from("hospedes").upsert(basico, { onConflict: "pousada_id,cpf" }).select("id").single());
  }
  if (error || !h) return { erro: "Não consegui salvar. Tente de novo em instantes." };

  // vira o titular da reserva (o titular antigo, se houver, passa a acompanhante)
  await db.from("hospedes_reserva").update({ papel: "acompanhante" }).eq("reserva_id", reservaId).eq("papel", "titular").neq("hospede_id", h.id);
  const { error: e2 } = await db.from("hospedes_reserva")
    .upsert({ hospede_id: h.id, reserva_id: reservaId, pousada_id: s.pousada.id, papel: "titular" }, { onConflict: "hospede_id,reserva_id" });
  if (e2) return { erro: "Salvei o hóspede, mas não consegui ligar à reserva. Tente de novo." };

  revalidatePath(`/painel/ficha/${reservaId}`);
  revalidatePath("/painel/notas");
  return { ok: true };
}
