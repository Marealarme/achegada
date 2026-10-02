"use server";

import { headers } from "next/headers";
import { supabaseServico } from "@/lib/supabase";
import { cpfValido, somenteDigitos } from "@/lib/util";
import { DEFICIENCIA, GENEROS, ids, MEIOS_TRANSPORTE, MOTIVOS_VIAGEM, RACAS, TIPOS_DEFICIENCIA } from "@/lib/fnrh/dominios";
import { fnrhLigada } from "@/lib/fnrh/cliente";
import { montarPayload, processarEnvio, type PessoaFicha } from "@/lib/fnrh/envio";
import type { Endereco, Pessoa } from "./CheckinFlow";

export type CheckinEntrada = {
  token: string;
  pessoas: Pessoa[];
  endereco: Endereco;
  horario: string;
  placa: string;
  transporte: string;
  motivo: string;
  pet: { tem: boolean; nome: string; especie: string; porte: string };
  aceiteRegras: boolean;
  aceitePet: boolean;
  marketing: boolean;
};

const ESPECIES = ["Cachorro", "Gato", "Outro"];
const PORTES = ["Pequeno", "Médio", "Grande"];
const txt = (v: unknown, max = 120) => String(v ?? "").trim().slice(0, max);
const ERRO_SALVAR = "Não conseguimos salvar agora. Tente de novo em instantes.";

export async function enviarCheckin(e: CheckinEntrada): Promise<{ ok: true; fichaEnviada: boolean } | { ok: false; erro: string }> {
  const db = supabaseServico();

  const token = String(e.token ?? "");
  type R = { id: string; pousada_id: string; check_in: string; check_out: string; ota_referencia?: string | null };
  let { data: reserva } = (await db.from("reservas").select("id, pousada_id, check_in, check_out, ota_referencia").eq("token", token).maybeSingle()) as { data: R | null };
  if (!reserva) ({ data: reserva } = (await db.from("reservas").select("id, pousada_id, check_in, check_out").eq("token", token).maybeSingle()) as { data: R | null });
  if (!reserva) return { ok: false, erro: "Link inválido. Peça um novo link à recepção." };
  if (Date.parse(reserva.check_out) + 2 * 864e5 < Date.now()) return { ok: false, erro: "Este link expirou." };

  const { data: jaFeito } = await db.from("pre_chegadas").select("id").eq("reserva_id", reserva.id).maybeSingle();
  if (jaFeito) return { ok: false, erro: "O check-in desta reserva já foi feito." };

  // ---------- validação no servidor (a tela também valida, mas não confiamos só nela) ----------
  if (!Array.isArray(e.pessoas) || e.pessoas.length < 1 || e.pessoas.length > 12) return { ok: false, erro: "Informe de 1 a 12 hóspedes." };
  const docs = new Set<string>();
  const pessoas: PessoaFicha[] = [];
  for (const p of e.pessoas) {
    const nome = txt(p.nome);
    const nacionalidade = /^[A-Z]{2}$/.test(p.nacionalidade) ? p.nacionalidade : "BR";
    const brasileiro = nacionalidade === "BR";
    const documento = brasileiro ? somenteDigitos(p.documento) : txt(p.documento, 15).replace(/[^0-9A-Za-z]/g, "").toUpperCase();
    if (nome.split(/\s+/).length < 2) return { ok: false, erro: "Confira os nomes completos." };
    if (brasileiro ? !cpfValido(documento) : documento.length < 5) return { ok: false, erro: "Há um documento inválido." };
    if (docs.has(documento)) return { ok: false, erro: "O mesmo documento aparece duas vezes." };
    docs.add(documento);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(p.nascimento ?? "")) return { ok: false, erro: "Confira as datas de nascimento." };
    if (!ids(GENEROS).includes(p.genero) || !ids(RACAS).includes(p.raca) || !ids(DEFICIENCIA).includes(p.deficiencia))
      return { ok: false, erro: "Complete gênero, cor/raça e deficiência de todos." };
    if (p.genero === "OUTRO" && !txt(p.generoDescricao)) return { ok: false, erro: "Descreva o gênero escolhido como “Outro”." };
    if (p.deficiencia === "SIM" && !ids(TIPOS_DEFICIENCIA).includes(p.tipoDeficiencia)) return { ok: false, erro: "Informe o tipo de deficiência." };
    pessoas.push({
      nome, documento, tipoDocumento: brasileiro ? "CPF" : "PASSAPORTE", nascimento: p.nascimento, nacionalidade,
      genero: p.genero, generoDescricao: txt(p.generoDescricao, 60), raca: p.raca, deficiencia: p.deficiencia, tipoDeficiencia: p.tipoDeficiencia,
    });
  }

  const end = e.endereco ?? ({} as Endereco);
  const email = txt(end.email, 120).toLowerCase();
  const telefone = somenteDigitos(end.telefone).slice(0, 13);
  const paisResidencia = /^[A-Z]{2}$/.test(end.paisResidencia) ? end.paisResidencia : "BR";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return { ok: false, erro: "Confira o e-mail." };
  if (telefone.length < 10) return { ok: false, erro: "Confira o telefone." };
  const cep = somenteDigitos(end.cep);
  const cidadeIbge = Number(end.cidadeIbge) || null;
  if (paisResidencia === "BR" && (cep.length !== 8 || !cidadeIbge || !txt(end.logradouro) || !txt(end.numero, 20) || !txt(end.bairro)))
    return { ok: false, erro: "Complete o endereço (CEP, rua, número e bairro)." };

  const transporte = ids(MEIOS_TRANSPORTE).includes(e.transporte) ? e.transporte : "AUTOMOVEL";
  const motivo = ids(MOTIVOS_VIAGEM).includes(e.motivo) ? e.motivo : "LAZER_FERIAS";
  if (!e.aceiteRegras) return { ok: false, erro: "É preciso aceitar as regras da casa." };
  if (e.pet?.tem && (!e.aceitePet || !txt(e.pet.nome))) return { ok: false, erro: "Complete os dados do pet e aceite o termo." };

  const agora = new Date().toISOString();
  const h = await headers();
  const ip = (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || null;
  const endereco = paisResidencia === "BR"
    ? { cep, logradouro: txt(end.logradouro), numero: txt(end.numero, 20), complemento: txt(end.complemento, 60), bairro: txt(end.bairro), cidade: txt(end.cidade, 80), cidade_ibge: cidadeIbge, uf: txt(end.uf, 2).toUpperCase() }
    : { cep: null, logradouro: null, numero: null, complemento: null, bairro: null, cidade: null, cidade_ibge: null, uf: null };

  // ---------- 1. cadastro permanente (sem cor/raça e sem deficiência: esses vão só para a ficha) ----------
  const idsHospedes: string[] = [];
  for (const [i, p] of pessoas.entries()) {
    const linha: Record<string, unknown> = {
      pousada_id: reserva.pousada_id,
      nome: p.nome,
      cpf: p.tipoDocumento === "CPF" ? p.documento : null,
      passaporte: p.tipoDocumento === "PASSAPORTE" ? p.documento : null,
      data_nascimento: p.nascimento,
      genero: p.genero,
      nacionalidade: p.nacionalidade,
      pais_residencia: paisResidencia,
      ...endereco,
      updated_at: agora,
    };
    if (i === 0) {
      linha.email = email;
      linha.telefone = telefone;
      if (e.marketing) linha.consentimento_marketing_em = agora;
    }
    const chave = p.tipoDocumento === "CPF" ? "pousada_id,cpf" : "pousada_id,passaporte";
    let { data, error } = await db.from("hospedes").upsert(linha, { onConflict: chave }).select("id").single();
    if (error && p.tipoDocumento === "CPF") {
      // migração 0004 ainda não rodou: salva só os campos da Fase 1
      const basico: Record<string, unknown> = { pousada_id: linha.pousada_id, nome: linha.nome, cpf: linha.cpf, data_nascimento: linha.data_nascimento, updated_at: agora };
      if (i === 0) { basico.telefone = telefone; if (e.marketing) basico.consentimento_marketing_em = agora; }
      ({ data, error } = await db.from("hospedes").upsert(basico, { onConflict: "pousada_id,cpf" }).select("id").single());
    }
    if (error || !data) return { ok: false, erro: ERRO_SALVAR };
    idsHospedes.push(data.id);
  }

  // ---------- 2. liga as pessoas a esta estadia ----------
  const { error: errLig } = await db.from("hospedes_reserva").upsert(
    idsHospedes.map((id, i) => ({ hospede_id: id, reserva_id: reserva.id, pousada_id: reserva.pousada_id, papel: i === 0 ? "titular" : "acompanhante" })),
    { onConflict: "hospede_id,reserva_id" }
  );
  if (errLig) return { ok: false, erro: ERRO_SALVAR };

  // ---------- 3. dados de chegada e aceites ----------
  const dadosPre = {
    reserva_id: reserva.id,
    pousada_id: reserva.pousada_id,
    horario_chegada: /^\d{2}:\d{2}$/.test(e.horario) ? e.horario : null,
    placa: String(e.placa ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 7) || null,
    meio_transporte: transporte,
    motivo_viagem: motivo,
    pet_tem: !!e.pet?.tem,
    pet_nome: e.pet?.tem ? txt(e.pet.nome, 60) : null,
    pet_especie: e.pet?.tem && ESPECIES.includes(e.pet.especie) ? e.pet.especie : null,
    pet_porte: e.pet?.tem && PORTES.includes(e.pet.porte) ? e.pet.porte : null,
    late_checkout: false,
    aceite_regras_em: agora,
    aceite_pet_em: e.pet?.tem ? agora : null,
    ip,
  };
  let { error: errPre } = await db.from("pre_chegadas").insert(dadosPre);
  if (errPre) {
    // migração 0004 ainda não rodou: tenta sem os campos de viagem
    const { meio_transporte: _t, motivo_viagem: _m, ...semViagem } = dadosPre;
    void _t; void _m;
    ({ error: errPre } = await db.from("pre_chegadas").insert(semViagem));
  }
  if (errPre) return { ok: false, erro: ERRO_SALVAR };

  // ---------- 4. ficha no governo (só se a integração estiver ligada) ----------
  if (!(await fnrhLigada(reserva.pousada_id))) return { ok: true, fichaEnviada: false };
  const payload = montarPayload({
    reservaId: reserva.id, checkIn: reserva.check_in, checkOut: reserva.check_out, otaReferencia: reserva.ota_referencia ?? null, pessoas, motivo, transporte,
    endereco: {
      email, telefone, paisResidencia, cep, logradouro: txt(end.logradouro), numero: txt(end.numero, 20),
      complemento: txt(end.complemento, 60), bairro: txt(end.bairro), cidadeIbge, uf: txt(end.uf, 2).toUpperCase(),
    },
  });
  const { error: errFila } = await db.from("fnrh_envios").upsert({ reserva_id: reserva.id, pousada_id: reserva.pousada_id, payload, ultimo_erro: null });
  if (errFila) return { ok: true, fichaEnviada: false }; // o check-in foi salvo; a recepção reenvia pelo painel
  const envio = await processarEnvio(reserva.id);
  return { ok: true, fichaEnviada: envio.ok };
}
