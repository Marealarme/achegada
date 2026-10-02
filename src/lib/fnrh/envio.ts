import "server-only";
import { supabaseServico } from "@/lib/supabase";
import { ErroFnrh, fnrhLigada, registrarHospedagem, type PayloadHospedagem } from "./cliente";

/**
 * Envia à FNRH a ficha guardada na fila (fnrh_envios) para esta reserva.
 * Sucesso: grava o id do governo na reserva e APAGA o pacote (que contém dados sensíveis).
 * Falha: marca a reserva com erro; o pacote fica para o botão "Tentar de novo" do painel.
 */
export async function processarEnvio(reservaId: string): Promise<{ ok: boolean; erro?: string }> {
  if (!fnrhLigada()) return { ok: false, erro: "Integração FNRH não configurada." };
  const db = supabaseServico();

  const { data: fila } = await db.from("fnrh_envios").select("payload, tentativas").eq("reserva_id", reservaId).maybeSingle();
  if (!fila?.payload) return { ok: false, erro: "Não há ficha pendente para enviar." };

  await db.from("reservas").update({ fnrh_status: "enviando", fnrh_erro: null }).eq("id", reservaId);
  try {
    const { reservaId: idGoverno } = await registrarHospedagem(normalizar(fila.payload as PayloadHospedagem, reservaId));
    const agora = new Date().toISOString();
    await db.from("reservas").update({ fnrh_reserva_id: idGoverno, fnrh_status: "enviado", fnrh_erro: null, fnrh_enviado_em: agora, fnrh_concluida: true }).eq("id", reservaId);
    await db.from("hospedes_reserva").update({ status_fnrh: "concluido" }).eq("reserva_id", reservaId);
    await db.from("fnrh_envios").update({ payload: null, enviado_em: agora, ultimo_erro: null, tentativas: fila.tentativas + 1 }).eq("reserva_id", reservaId);
    return { ok: true };
  } catch (e) {
    const msg = e instanceof ErroFnrh ? e.message : "Erro inesperado ao enviar a ficha.";
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
    dados_hospede: (p.dados_hospede as Record<string, unknown>[]).map((h) => ({ ...h, situacao_hospede: "PRECHECKIN_PENDENTE" })),
  };
}

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
  reservaId: string; checkIn: string; checkOut: string;
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
      numero_reserva_ota: "",
      data_entrada: args.checkIn,
      data_saida: args.checkOut,
      quantidade_hospede_adulto: pessoas.length - menores,
      quantidade_hospede_menor: menores,
      origem_reserva_id: "MEIOHOSPEDAGEM",
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
