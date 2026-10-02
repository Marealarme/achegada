import "server-only";

// Cliente da API FNRH v2 (Ministério do Turismo / Serpro).
// Roda SOMENTE no servidor. Credenciais vêm das variáveis de ambiente da Vercel:
//   FNRH_USUARIO, FNRH_SENHA          → "Chave das API's" no módulo da pousada (FNRH_SRH)
//   FNRH_CPF_SOLICITANTE              → CPF do responsável (exigido pela API para auditoria)
//   FNRH_AMBIENTE = "producao" | "homologacao" (padrão: homologacao, para testar sem criar fichas reais)

const URLS = {
  producao: "https://fnrh.turismo.serpro.gov.br/FNRH_API/rest/v2",
  homologacao: "https://hom-lowcode.serpro.gov.br/FNRH_API/rest/v2",
};

export function fnrhConfig() {
  const usuario = process.env.FNRH_USUARIO;
  const senha = process.env.FNRH_SENHA;
  const cpf = (process.env.FNRH_CPF_SOLICITANTE ?? "").replace(/\D/g, "");
  if (!usuario || !senha || cpf.length !== 11) return null;
  const ambiente = process.env.FNRH_AMBIENTE === "producao" ? "producao" : "homologacao";
  return { usuario, senha, cpf, ambiente, base: URLS[ambiente] } as const;
}

/** A integração está ligada quando as três credenciais estão cadastradas. */
export const fnrhLigada = () => fnrhConfig() !== null;

export class ErroFnrh extends Error {
  constructor(message: string, public status?: number) {
    super(message);
  }
}

async function chamar(caminho: string, init: { method: string; body?: string; contentType?: string; comCpf?: boolean }) {
  const cfg = fnrhConfig();
  if (!cfg) throw new ErroFnrh("Integração FNRH não configurada.");
  const headers: Record<string, string> = {
    Authorization: "Basic " + Buffer.from(`${cfg.usuario}:${cfg.senha}`).toString("base64"),
    "Content-Type": init.contentType ?? "application/json",
    Accept: "application/json",
  };
  if (init.comCpf) headers.cpf_solicitante = cfg.cpf;

  let res: Response;
  try {
    res = await fetch(cfg.base + caminho, { method: init.method, headers, body: init.body, signal: AbortSignal.timeout(20000), cache: "no-store" });
  } catch {
    throw new ErroFnrh("O sistema do governo não respondeu. Tente de novo em alguns minutos.");
  }
  const texto = await res.text();
  let json: unknown = null;
  try { json = texto ? JSON.parse(texto) : null; } catch { /* resposta sem JSON */ }
  if (!res.ok) {
    const msg = res.status === 401
      ? "Usuário ou senha da API FNRH incorretos."
      : resumirErro(json) || `Erro ${res.status} no sistema do governo.`;
    throw new ErroFnrh(msg, res.status);
  }
  return json;
}

function resumirErro(json: unknown): string {
  if (!json || typeof json !== "object") return "";
  const o = json as Record<string, unknown>;
  const partes = [o.mensagem, o.message, o.erro, o.detalhe, o.detail]
    .filter((x) => typeof x === "string") as string[];
  if (Array.isArray(o.erros)) partes.push(...o.erros.map((e) => (typeof e === "string" ? e : JSON.stringify(e))));
  return partes.join(" · ").slice(0, 500);
}

export type PayloadHospedagem = {
  reserva: {
    numero_reserva: string; numero_reserva_ota: string; data_entrada: string; data_saida: string;
    quantidade_hospede_adulto: number; quantidade_hospede_menor: number; origem_reserva_id: "MEIOHOSPEDAGEM" | "OTA";
  };
  dados_hospede: unknown[];
};

/** POST /hospedagem/registrar — cria a reserva e todos os hóspedes numa única chamada. */
export async function registrarHospedagem(payload: PayloadHospedagem) {
  const json = (await chamar("/hospedagem/registrar", { method: "POST", body: JSON.stringify(payload), comCpf: true })) as
    | { dados?: { reserva?: { reserva_id?: string } } }
    | null;
  const id = json?.dados?.reserva?.reserva_id;
  if (!id) throw new ErroFnrh("O governo não devolveu o número da reserva.");
  return { reservaId: id };
}

/** POST /reservas/{id}/checkin e /checkout — corpo é texto puro com data/hora ISO em UTC. */
export async function checkinReserva(reservaId: string, quando = new Date()) {
  return chamar(`/reservas/${encodeURIComponent(reservaId)}/checkin`, { method: "POST", body: quando.toISOString(), contentType: "text/plain" });
}
export async function checkoutReserva(reservaId: string, quando = new Date()) {
  return chamar(`/reservas/${encodeURIComponent(reservaId)}/checkout`, { method: "POST", body: quando.toISOString(), contentType: "text/plain" });
}

/** POST /reservas/{id}/cancelar — só funciona enquanto a reserva está CRIADA (antes do check-in). */
export async function cancelarReserva(reservaId: string) {
  return chamar(`/reservas/${encodeURIComponent(reservaId)}/cancelar`, { method: "POST" });
}
