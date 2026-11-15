import "server-only";
import { supabaseServico } from "@/lib/supabase";
import { adicionarHospede, checkinReserva, ErroFnrh, fnrhLigada, hospedesDaReserva, registrarHospedagem, registrarPessoa, type PayloadHospedagem } from "./cliente";

/**
 * Envia à FNRH a ficha guardada na fila (fnrh_envios) para esta reserva.
 * Com `chegada` (recepção clicou "Hóspede chegou"): registra já com CHECKIN_REALIZADO, com motivo e transporte — ficha completa.
 * Sem `chegada` (envio automático das 23h30 ou "Enviar agora"): PRECHECKIN_PENDENTE, que o governo só aceita sem motivo/transporte.
 * Sucesso: grava o id do governo na reserva e APAGA o pacote (que contém dados sensíveis).
 * Falha: marca a reserva com erro; o pacote fica para o botão "Tentar de novo" do painel.
 */
export async function processarEnvio(reservaId: string, chegada?: Date): Promise<{ ok: boolean; erro?: string }> {
  const db = supabaseServico();
  const { data: fila } = await db.from("fnrh_envios").select("payload, tentativas, pousada_id").eq("reserva_id", reservaId).maybeSingle();
  if (!fila?.payload) return { ok: false, erro: "Não há ficha pendente para enviar." };
  if (!(await fnrhLigada(fila.pousada_id))) return { ok: false, erro: "Integração FNRH não configurada." };

  await db.from("reservas").update({ fnrh_status: "enviando", fnrh_erro: null }).eq("id", reservaId);
  try {
    const pacote = normalizar(fila.payload as PayloadHospedagem, reservaId);
    const avisos: string[] = [];
    let idGoverno: string;
    try {
      idGoverno = await registrar(fila.pousada_id, pacote, chegada, avisos);
    } catch (e) {
      // menor de idade com responsável recusado: cria a reserva com os adultos e inclui os menores depois
      if (!(e instanceof ErroFnrh) || e.status !== 400 || !/respons/i.test(e.message) || !temMenores(pacote)) throw e;
      idGoverno = await registrarMenoresDepois(fila.pousada_id, pacote, chegada, avisos, e.message);
    }
    if (!chegada) avisos.push("Aviso: enviada como pré-check-in pendente (sem motivo da viagem e transporte), porque ninguém marcou a chegada");
    const aviso = avisos.length ? mascarar(avisos.join(" | ")).slice(0, 900) : null;
    if (aviso) console.warn("[FNRH] aviso:", aviso);
    const agora = new Date().toISOString();
    await db.from("reservas").update({
      fnrh_reserva_id: idGoverno, fnrh_status: "enviado", fnrh_erro: aviso, fnrh_enviado_em: agora, fnrh_concluida: true,
      ...(chegada ? { checkin_em: chegada.toISOString() } : {}),
    }).eq("id", reservaId);
    await db.from("hospedes_reserva").update({ status_fnrh: "concluido" }).eq("reserva_id", reservaId);
    await db.from("fnrh_envios").update({ payload: null, enviado_em: agora, ultimo_erro: null, tentativas: fila.tentativas + 1 }).eq("reserva_id", reservaId);
    return { ok: true };
  } catch (e) {
    const msg = mascarar(e instanceof ErroFnrh ? e.message : "Erro inesperado ao enviar a ficha.");
    await db.from("reservas").update({ fnrh_status: "erro", fnrh_erro: msg }).eq("id", reservaId);
    await db.from("hospedes_reserva").update({ status_fnrh: "erro" }).eq("reserva_id", reservaId);
    await db.from("fnrh_envios").update({ ultimo_erro: msg, tentativas: fila.tentativas + 1 }).eq("reserva_id", reservaId);
    return { ok: false, erro: msg };
  }
}

/** Número curto e único da reserva para o governo (o exemplo oficial usa códigos curtos, ex.: "RESERVA005"). */
export const numeroReserva = (id: string) => "LC" + id.replace(/-/g, "").slice(0, 10).toUpperCase();

/** Ajusta pacotes já guardados na fila ao formato do exemplo oficial (nº curto da reserva). */
function normalizar(p: PayloadHospedagem, reservaId: string): PayloadHospedagem {
  return { reserva: { ...p.reserva, numero_reserva: numeroReserva(reservaId) }, dados_hospede: p.dados_hospede };
}

const ehRecusa = (e: unknown): e is ErroFnrh => e instanceof ErroFnrh && e.status === 400;

/** Hóspede que chegou: CHECKIN_REALIZADO com data/hora e motivo/transporte (a única situação em que o governo aceita os dois). */
function comoCheckin(p: PayloadHospedagem, chegada: Date): PayloadHospedagem {
  return { ...p, dados_hospede: (p.dados_hospede as Record<string, unknown>[]).map((h) => ({ ...h, situacao_hospede: "CHECKIN_REALIZADO", check_in_em: chegada.toISOString(), check_out_em: "" })) };
}

/** Pré-check-in pendente: o governo recusa motivo/transporte nesta situação, então vão vazios. */
function comoPendente(p: PayloadHospedagem): PayloadHospedagem {
  return {
    ...p,
    dados_hospede: (p.dados_hospede as Record<string, unknown>[]).map((h) => ({
      ...h, situacao_hospede: "PRECHECKIN_PENDENTE", check_in_em: "", check_out_em: "", dados_ficha: { motivo_viagem_id: "", meio_transporte_id: "" },
    })),
  };
}

/** Registra no governo. Com chegada, tenta a ficha completa; se recusada (fora o caso de menores), cai para pendente + check-in. */
async function registrar(pousadaId: string, pacote: PayloadHospedagem, chegada: Date | undefined, avisos: string[]): Promise<string> {
  if (!chegada) return (await registrarHospedagem(pousadaId, comoPendente(pacote))).reservaId;
  try {
    return (await registrarHospedagem(pousadaId, comoCheckin(pacote, chegada))).reservaId;
  } catch (e) {
    if (!ehRecusa(e) || /respons/i.test(e.message)) throw e;
    const id = (await registrarHospedagem(pousadaId, comoPendente(pacote))).reservaId;
    await checkinReserva(pousadaId, id, chegada);
    avisos.push(`Aviso: check-in registrado, mas o governo recusou motivo/transporte na ficha completa: ${e.message}`);
    return id;
  }
}

type Hosp = Record<string, unknown> & { responsavel?: { numero_documento?: string }; dados_pessoais?: Record<string, unknown>; dados_ficha?: Record<string, unknown> };
const ehMenor = (h: Hosp) => !!h.responsavel?.numero_documento;
const temMenores = (p: PayloadHospedagem) => (p.dados_hospede as Hosp[]).some(ehMenor);

/** Plano C: cria a reserva só com os adultos e inclui cada menor pelo /pessoas + /reservas/{id}/hospedes, com o titular como responsável. */
async function registrarMenoresDepois(pousadaId: string, pacote: PayloadHospedagem, chegada: Date | undefined, avisos: string[], motivoRecusa: string): Promise<string> {
  const todos = pacote.dados_hospede as Hosp[];
  const menores = todos.filter(ehMenor);
  const id = await registrar(pousadaId, { ...pacote, dados_hospede: todos.filter((h) => !ehMenor(h)) }, chegada, avisos);
  try {
    const registrados = await hospedesDaReserva(pousadaId, id);
    const titular = registrados.find((r) => r.principal) ?? registrados[0];
    if (!titular?.hospedeId) throw new ErroFnrh("não achei o titular na reserva do governo");
    for (const m of menores) {
      const dp = m.dados_pessoais ?? {};
      const pessoaId = await registrarPessoa(pousadaId, dp);
      await adicionarHospede(pousadaId, id, {
        pessoa_id: pessoaId, is_principal: false, responsavel_id: titular.hospedeId, checkout_em: null,
        ...(chegada
          ? { situacao_hospede_id: "CHECKIN_REALIZADO", checkin_em: chegada.toISOString(), fnrh: m.dados_ficha ?? { motivo_viagem_id: "", meio_transporte_id: "" } }
          : { situacao_hospede_id: "PRECHECKIN_PENDENTE", checkin_em: null, fnrh: { motivo_viagem_id: "", meio_transporte_id: "" } }),
      });
    }
    avisos.push(`Menores incluídos em uma segunda etapa (o governo recusou o responsável no envio único: ${motivoRecusa})`);
  } catch (e) {
    avisos.push(`Reserva registrada só com os adultos; ${menores.length} menor(es) não entrou(aram): ${e instanceof Error ? e.message : String(e)}. Inclua na plataforma FNRH.`);
  }
  return id;
}

/** Esconde CPFs que o governo devolve nas mensagens de erro. */
const mascarar = (t: string) => t.replace(/\b(\d{3})\d{5}(\d{3})\b/g, "$1*****$2");

const idade = (nasc: string, ref: string) => {
  const [a, m, d] = nasc.split("-").map(Number);
  const [ra, rm, rd] = ref.split("-").map(Number);
  return ra - a - (rm < m || (rm === m && rd < d) ? 1 : 0);
};

export type PessoaFicha = {
  nome: string; documento: string; tipoDocumento: "CPF" | "PASSAPORTE"; nascimento: string;
  genero: string; generoDescricao: string; raca: string; deficiencia: string; tipoDeficiencia: string; nacionalidade: string;
};
export type EnderecoFicha = {
  email: string; telefone: string; paisResidencia: string;
  cep: string; logradouro: string; numero: string; complemento: string; bairro: string; cidadeIbge: number | null; uf: string;
};

/** Monta o pacote do POST /hospedagem/registrar a partir do check-in do hóspede. */
export function montarPayload(args: {
  reservaId: string; checkIn: string; checkOut: string; otaReferencia?: string | null;
  pessoas: PessoaFicha[]; endereco: EnderecoFicha; motivo: string; transporte: string;
}): PayloadHospedagem {
  const { pessoas, endereco: e } = args;
  const menores = pessoas.filter((p) => idade(p.nascimento, args.checkIn) < 18).length;
  const titular = pessoas[0];
  const contato = e.paisResidencia === "BR"
    ? {
        email: e.email, telefone: e.telefone.replace(/\D/g, ""), PaisResidencia_id: "BR",
        cep: e.cep.replace(/\D/g, ""), logradouro: e.logradouro, numero: e.numero, complemento: e.complemento, bairro: e.bairro,
        cidade_id: e.cidadeIbge, estado_id: e.uf,
      }
    : { email: e.email, telefone: e.telefone.replace(/\D/g, ""), PaisResidencia_id: e.paisResidencia, cep: "", logradouro: "", numero: "", complemento: "", bairro: "" };

  return {
    reserva: {
      numero_reserva: numeroReserva(args.reservaId),
      numero_reserva_ota: args.otaReferencia ?? "",
      data_entrada: args.checkIn,
      data_saida: args.checkOut,
      quantidade_hospede_adulto: pessoas.length - menores,
      quantidade_hospede_menor: menores,
      origem_reserva_id: args.otaReferencia ? "OTA" : "MEIOHOSPEDAGEM",
    },
    dados_hospede: pessoas.map((p, i) => {
      const menor = idade(p.nascimento, args.checkIn) < 18;
      return {
        is_principal: i === 0,
        situacao_hospede: "PRECHECKIN_PENDENTE",
        check_in_em: "",
        check_out_em: "",
        dados_pessoais: {
          nome: p.nome.toUpperCase(),
          nome_social: "",
          PaisNacionalidade_id: p.nacionalidade,
          genero_id: p.genero,
          GeneroDescricao: p.genero === "OUTRO" ? p.generoDescricao.trim() : "",
          data_nascimento: p.nascimento,
          raca_id: p.raca,
          deficiencia_id: p.deficiencia,
          tipo_deficiencia_id: p.deficiencia === "SIM" ? p.tipoDeficiencia : "",
          documento_id: { numero_documento: p.documento.replace(/[^0-9A-Za-z]/g, ""), tipo_documento_id: p.tipoDocumento },
          contato,
        },
        responsavel: menor && i > 0
          ? { numero_documento: titular.documento.replace(/[^0-9A-Za-z]/g, ""), tipo_documento_id: titular.tipoDocumento }
          : { numero_documento: "", tipo_documento_id: "" },
        dados_ficha: { motivo_viagem_id: args.motivo, meio_transporte_id: args.transporte },
      };
    }),
  };
}
