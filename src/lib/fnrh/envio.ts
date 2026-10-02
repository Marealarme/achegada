import "server-only";
import { supabaseServico } from "@/lib/supabase";
import { ErroFnrh, fnrhLigada, registrarHospedagem, type PayloadHospedagem } from "./cliente";

/**
 * Envia à FNRH a ficha guardada na fila (fnrh_envios) para esta reserva.
 * Sucesso: grava o id do governo na reserva e APAGA o pacote (que contém dados sensíveis).
 * Falha: marca a reserva com erro; o pacote fica para o botão "Tentar de novo" do painel.
 */
export async function processarEnvio(reservaId: string): Promise<{ ok: boolean; erro?: string }> {
  const db = supabaseServico();
  const { data: fila } = await db.from("fnrh_envios").select("payload, tentativas, pousada_id").eq("reserva_id", reservaId).maybeSingle();
  if (!fila?.payload) return { ok: false, erro: "Não há ficha pendente para enviar." };
  if (!(await fnrhLigada(fila.pousada_id))) return { ok: false, erro: "Integração FNRH não configurada." };

  await db.from("reservas").update({ fnrh_status: "enviando", fnrh_erro: null }).eq("id", reservaId);
  try {
    const pacote = normalizar(fila.payload as PayloadHospedagem, reservaId);
    let idGoverno: string;
    let aviso: string | null = null;
    try {
      ({ reservaId: idGoverno } = await registrarHospedagem(fila.pousada_id, pacote));
    } catch (e) {
      if (!(e instanceof ErroFnrh) || e.status !== 400 || !/situa[cç][aã]o/i.test(e.message)) throw e;
      ({ reservaId: idGoverno } = await registrarHospedagem(fila.pousada_id, comoPendente(pacote)));
      // guarda o motivo da recusa para entendermos por que foi como "pendente" (sem motivo/transporte)
      aviso = mascarar(`Aviso: ficha aceita como pré-check-in pendente, sem motivo da viagem e transporte. Resposta do governo à versão completa: ${e.message}`).slice(0, 900);
      console.warn("[FNRH] plano B (pendente):", aviso);
    }
    const agora = new Date().toISOString();
    await db.from("reservas").update({ fnrh_reserva_id: idGoverno, fnrh_status: "enviado", fnrh_erro: aviso, fnrh_enviado_em: agora, fnrh_concluida: true }).eq("id", reservaId);
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

/** Ajusta pacotes já guardados na fila ao formato do exemplo oficial da documentação. */
function normalizar(p: PayloadHospedagem, reservaId: string): PayloadHospedagem {
  return {
    reserva: { ...p.reserva, numero_reserva: numeroReserva(reservaId) },
    dados_hospede: (p.dados_hospede as Record<string, unknown>[]).map((h) => ({ ...h, situacao_hospede: "PRECHECKIN_REALIZADO" })),
  };
}

/** Plano B: situação "pendente" não aceita motivo/transporte, então vão vazios. */
function comoPendente(p: PayloadHospedagem): PayloadHospedagem {
  return {
    ...p,
    dados_hospede: (p.dados_hospede as Record<string, unknown>[]).map((h) => ({
      ...h, situacao_hospede: "PRECHECKIN_PENDENTE", dados_ficha: { motivo_viagem_id: "", meio_transporte_id: "" },
    })),
  };
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
        situacao_hospede: "PRECHECKIN_REALIZADO",
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
