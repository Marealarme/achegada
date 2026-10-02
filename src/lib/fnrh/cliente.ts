import "server-only";

import { supabaseServico } from "@/lib/supabase";
import { decifrar } from "@/lib/cripto";

// Cliente da API FNRH v2 (Ministério do Turismo / Serpro). Roda SOMENTE no servidor.
// Cada pousada guarda a própria "Chave das API's" (tabela pousada_segredos, senha e CPF criptografados).
// Compatibilidade: a pousada-piloto (slug FNRH_POUSADA_PILOTO, padrão "lua") pode usar as variáveis
// FNRH_USUARIO / FNRH_SENHA / FNRH_CPF_SOLICITANTE / FNRH_AMBIENTE da Vercel enquanto não salvar no painel.

const URLS = {
  producao: "https://fnrh.turismo.serpro.gov.br/FNRH_API/rest/v2",
  homologacao: "https://hom-lowcode.serpro.gov.br/FNRH_API/rest/v2",
};

export type ConfigFnrh = { usuario: string; senha: string; cpf: string; ambiente: "producao" | "homologacao"; base: string };

export async function fnrhConfig(pousadaId: string): Promise<ConfigFnrh | null> {
  const db = supabaseServico();
  const { data: seg } = await db.from("pousada_segredos").select("fnrh_usuario, fnrh_senha_cripto, fnrh_cpf_cripto, fnrh_ambiente").eq("pousada_id", pousadaId).maybeSingle();
  if (seg?.fnrh_usuario) {
    const senha = decifrar(seg.fnrh_senha_cripto);
    const cpf = (decifrar(seg.fnrh_cpf_cripto) ?? "").replace(/\D/g, "");
    if (senha && cpf.length === 11) {
      const ambiente = seg.fnrh_ambiente === "homologacao" ? "homologacao" : "producao";
      return { usuario: seg.fnrh_usuario, senha, cpf, ambiente, base: URLS[ambiente] };
    }
  }
  // variáveis da Vercel: só para a pousada-piloto
  const usuario = process.env.FNRH_USUARIO;
  const senha = process.env.FNRH_SENHA;
  const cpf = (process.env.FNRH_CPF_SOLICITANTE ?? "").replace(/\D/g, "");
  if (!usuario || !senha || cpf.length !== 11) return null;
  const { data: p } = await db.from("pousadas").select("slug").eq("id", pousadaId).maybeSingle();
  if (p?.slug !== (process.env.FNRH_POUSADA_PILOTO ?? "lua")) return null;
  const ambiente = process.env.FNRH_AMBIENTE === "producao" ? "producao" : "homologacao";
  return { usuario, senha, cpf, ambiente, base: URLS[ambiente] };
}

/** A integração está ligada para esta pousada quando há chave e CPF válidos. */
export const fnrhLigada = async (pousadaId: string) => (await fnrhConfig(pousadaId)) !== null;

export class ErroFnrh extends Error {
  constructor(message: string, public status?: number) {
    super(message);
  }
}

async function chamar(pousadaId: string, caminho: string, init: { method: string; body?: string; contentType?: string; comCpf?: boolean }) {
  const cfg = await fnrhConfig(pousadaId);
  if (!cfg) throw new ErroFnrh("Integração FNRH não configurada.");
  const headers: Record<string, string> = {
    Authorization: "Basic " + Buffer.from(`${cfg.usuario}:${cfg.senha}`).toString("base64"),
    "Content-Type": init.contentType ?? "application/json",
    Accept: "application/json",
  };
  if (init.comCpf) headers.cpf_solicitante = cfg.cpf;

  let res: Response;
  try {
    res = await fetch(cfg.base + caminho, { method: init.method, headers, body: init.body, signal: AbortSignal.timeout(30000), cache: "no-store" });
  } catch (e) {
    console.error("[FNRH] sem resposta", caminho, cfg.ambiente, pousadaId, e instanceof Error ? e.name + ": " + e.message : e);
    throw new ErroFnrh("O sistema do governo não respondeu em 30 segundos. Tente de novo em alguns minutos.");
  }
  const texto = await res.text();
  let json: unknown = null;
  try { json = texto ? JSON.parse(texto) : null; } catch { /* resposta sem JSON */ }
  if (!res.ok) {
    console.error("[FNRH] erro", res.status, caminho, cfg.ambiente, pousadaId, texto.slice(0, 800));
    const resumo = resumirErro(json);
    const detalhe = texto.replace(/\s+/g, " ").trim().slice(0, 600);
    const msg = res.status === 401
      ? "Usuário ou senha da API FNRH incorretos."
      : `${resumo || `Erro ${res.status} no sistema do governo.`}${detalhe && detalhe !== resumo ? ` — resposta do governo: ${detalhe}` : ""}`;
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
export async function registrarHospedagem(pousadaId: string, payload: PayloadHospedagem) {
  const json = (await chamar(pousadaId, "/hospedagem/registrar", { method: "POST", body: JSON.stringify(payload), comCpf: true })) as
    | { dados?: { reserva?: { reserva_id?: string } } }
    | null;
  const id = json?.dados?.reserva?.reserva_id;
  if (!id) throw new ErroFnrh("O governo não devolveu o número da reserva.");
  return { reservaId: id };
}

/** POST /reservas/{id}/checkin e /checkout — corpo é texto puro com data/hora ISO em UTC. */
export async function checkinReserva(pousadaId: string, reservaId: string, quando = new Date()) {
  return chamar(pousadaId, `/reservas/${encodeURIComponent(reservaId)}/checkin`, { method: "POST", body: quando.toISOString(), contentType: "text/plain" });
}
export async function checkoutReserva(pousadaId: string, reservaId: string, quando = new Date()) {
  return chamar(pousadaId, `/reservas/${encodeURIComponent(reservaId)}/checkout`, { method: "POST", body: quando.toISOString(), contentType: "text/plain" });
}

/** POST /reservas/{id}/cancelar — só funciona enquanto a reserva está CRIADA (antes do check-in). */
export async function cancelarReserva(pousadaId: string, reservaId: string) {
  return chamar(pousadaId, `/reservas/${encodeURIComponent(reservaId)}/cancelar`, { method: "POST" });
}
