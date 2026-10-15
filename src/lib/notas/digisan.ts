import "server-only";
import { createHmac } from "node:crypto";
import type { LinhaNota } from "./linhas";

// Cliente da API de NFS-e da Digisan. Roda SÓ no servidor.
// A chave vem da variável de ambiente DIGISAN_API_KEY (nunca do código, do banco ou do navegador).
// Não existe homologação para NFS-e na Digisan: toda chamada de emissão gera uma nota REAL.

const BASE = "https://api.digisan.com.br/api/v1";

export const digisanLigada = () => !!process.env.DIGISAN_API_KEY;

/** Segredo que a Digisan devolve no header Authorization de cada aviso (webhook). Derivado da chave: não precisa de outra variável. */
export function segredoWebhook(): string {
  const chave = process.env.DIGISAN_API_KEY ?? "";
  return createHmac("sha256", chave).update("achegada-webhook-nfse").digest("hex");
}

/** Configuração da pousada (pousadas.nfse_config): CNPJ do prestador e os dados fixos do serviço cadastrado na Digisan. */
export type NfseConfig = {
  prestadorCnpj: string;
  padraoNacional?: boolean;
  naturezaTributacao?: number;
  enviarPorEmail?: boolean;
  limiteMensal?: number;                 // plano da Digisan (padrão 160)
  cicloDia?: number;                     // dia em que o período do plano vira (ex.: 6 = de 06 a 06)
  prefixoDescricao?: string;             // começo do texto da nota (padrão "Hospedagem"); muda junto com o serviço
  servico: Record<string, unknown>;      // copiado tal como está em Cadastros > Serviços (código, alíquota, CNAE, NBS…)
};

export type RespostaDigisan = { ok: boolean; status: number; corpo: Record<string, unknown> | null; erro?: string };

async function chamar(caminho: string, init: RequestInit = {}): Promise<RespostaDigisan> {
  const chave = process.env.DIGISAN_API_KEY;
  if (!chave) return { ok: false, status: 0, corpo: null, erro: "A chave da Digisan ainda não foi cadastrada no servidor." };
  try {
    const r = await fetch(`${BASE}${caminho}`, {
      ...init,
      headers: { "x-api-key": chave, "Content-Type": "application/json", Accept: "application/json", ...(init.headers ?? {}) },
      signal: AbortSignal.timeout(25_000),
      cache: "no-store",
    });
    const texto = await r.text();
    let corpo: Record<string, unknown> | null = null;
    try { corpo = texto ? JSON.parse(texto) : null; } catch { corpo = { mensagem: texto.slice(0, 300) }; }
    return { ok: r.ok, status: r.status, corpo };
  } catch (e) {
    return { ok: false, status: 0, corpo: null, erro: e instanceof Error && e.name === "TimeoutError" ? "A Digisan demorou para responder." : "Não foi possível falar com a Digisan." };
  }
}

const dataBr = (iso: string) => iso.slice(0, 10).split("-").reverse().join("/");
const digitos = (s: string | null | undefined) => String(s ?? "").replace(/\D/g, "");

/** Texto da nota: "Hospedagem – [Chalé] – [check-in] a [check-out] – [N] noites – Reserva [nº]". */
export function descricaoNota(l: LinhaNota, prefixo = "Hospedagem") {
  return `${prefixo} – ${l.chale || "Chalé"} – ${dataBr(l.checkIn)} a ${dataBr(l.checkOut)} – ${l.noites} ${l.noites === 1 ? "noite" : "noites"} – Reserva ${l.numeroReserva}`;
}

/** Corpo do POST /nfse para uma reserva. Só chamar com a linha sem pendências. */
export function montarNfse(l: LinhaNota, cfg: NfseConfig, cidadeTomador?: string): Record<string, unknown> {
  const h = l.tomador!;
  const total = Math.round((l.total ?? 0) * 100) / 100;
  const aliquota = typeof cfg.servico.aliquotaIss === "number" ? cfg.servico.aliquotaIss : null;
  const tomador: Record<string, unknown> = {
    nome: h.nome,
    tipoPessoa: "FISICA",
    ...(h.email ? { email: h.email } : {}),
    ...(digitos(h.telefone ?? l.telefoneCard) ? { telefone: digitos(h.telefone ?? l.telefoneCard) } : {}),
  };
  if (!l.estrangeiro && h.cpf) {
    tomador.cpfCnpj = digitos(h.cpf);
    tomador.endereco = {
      uf: h.uf, cep: digitos(h.cep), logradouro: h.logradouro, numero: h.numero, bairro: h.bairro,
      ...(h.complemento ? { complemento: h.complemento } : {}),
      municipio: { codigoIbge: String(h.cidade_ibge ?? ""), nome: cidadeTomador ?? h.cidade },
      pais: { nome: "Brasil", sigla: "BR", bacen: "1058" },
    };
  } else {
    // estrangeiro: documento estrangeiro (passaporte) no lugar do CPF
    tomador.codigoEstrangeiro = h.passaporte ?? "";
    if (h.pais_residencia) tomador.endereco = { pais: { sigla: h.pais_residencia } };
  }
  return {
    idExterno: l.numeroReserva,
    emissao: new Date().toISOString(),
    competencia: l.checkOut,                       // mês do check-out
    enviarPorEmail: cfg.enviarPorEmail ?? false,
    ...(cfg.padraoNacional !== undefined ? { padraoNacional: cfg.padraoNacional } : {}),
    ...(cfg.naturezaTributacao !== undefined ? { naturezaTributacao: cfg.naturezaTributacao } : {}),
    prestador: { cnpj: digitos(cfg.prestadorCnpj) },
    tomador,
    servico: {
      ...cfg.servico,                              // dados fixos do serviço cadastrado na Digisan
      descricao: descricaoNota(l, cfg.prefixoDescricao || "Hospedagem"),
      valorServicos: total,                        // ISS já incluído no valor total
      ...(aliquota !== null ? { baseCalculo: total, valorIss: Math.round(total * aliquota) / 100 } : {}),
    },
  };
}

export const emitirNfse = (corpo: Record<string, unknown>) => chamar("/nfse", { method: "POST", body: JSON.stringify(corpo) });
export const consultarNfse = (id: string) => chamar(`/nfse/${encodeURIComponent(id)}`);
export const cancelarNfse = (id: string, codigo: number, motivo: string) =>
  chamar(`/nfse/${encodeURIComponent(id)}/cancelar`, { method: "POST", body: JSON.stringify({ codigo, motivo }) });

/** Procura na Digisan uma nota já criada para o idExterno (usado quando a resposta da emissão se perdeu). */
export async function procurarPorIdExterno(cnpj: string, idExterno: string, competencia: string): Promise<Record<string, unknown> | null> {
  const mes = competencia.slice(0, 7);
  const fim = new Date(Date.UTC(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)), 0)).toISOString().slice(0, 10);
  let cursor = "";
  for (let pagina = 0; pagina < 10; pagina++) {
    const q = pagina === 0
      ? `?cnpj=${digitos(cnpj)}&dataReferencia=COMPETENCIA&dataInicio=${mes}-01&dataFim=${fim}&limit=100`
      : `?cursor=${encodeURIComponent(cursor)}`;
    const r = await chamar(`/nfse${q}`);
    if (!r.ok || !r.corpo) return null;
    const lista = (Array.isArray(r.corpo) ? r.corpo : (r.corpo.dados ?? r.corpo.data ?? r.corpo.items ?? r.corpo.notas ?? [])) as Record<string, unknown>[];
    const achou = lista.find((n) => String(n.idExterno ?? "") === idExterno);
    if (achou) return achou;
    cursor = String((r.corpo as Record<string, unknown>).cursor ?? (r.corpo as Record<string, unknown>).proximoCursor ?? "");
    if (!cursor || !lista.length) return null;
  }
  return null;
}

/** Baixa o PDF ou o XML (a Digisan exige a chave; o navegador baixa por uma rota do A Chegada). */
export async function baixarArquivo(id: string, tipo: "pdf" | "xml"): Promise<Response | null> {
  const chave = process.env.DIGISAN_API_KEY;
  if (!chave) return null;
  try {
    const r = await fetch(`${BASE}/nfse/${encodeURIComponent(id)}/${tipo}`, { headers: { "x-api-key": chave }, signal: AbortSignal.timeout(25_000), cache: "no-store" });
    return r.ok ? r : null;
  } catch { return null; }
}

/** Cadastra o aviso (webhook) da Digisan apontando para o A Chegada. */
export const cadastrarWebhook = (url: string) =>
  chamar("/webhook", { method: "POST", body: JSON.stringify({ url, method: "POST", headers: { Authorization: `Bearer ${segredoWebhook()}` } }) });
export const verWebhook = () => chamar("/webhook");

/** Traduz o status da Digisan para o do A Chegada. */
export function statusDoApp(statusDigisan: string | undefined): { status: string; cancelamentoRecusado?: boolean } {
  const s = String(statusDigisan ?? "").toUpperCase();
  if (s === "AUTORIZADA") return { status: "autorizada" };
  if (s === "CANCELADA") return { status: "cancelada" };
  if (s === "FALHA_CANCELAMENTO") return { status: "autorizada", cancelamentoRecusado: true };
  if (/FALHA|REJEIT|ERRO|DENEG/.test(s)) return { status: "rejeitada" };
  return { status: "processando" };
}

/** Mensagem legível de um erro da Digisan ({codigo, mensagem} ou lista de erros). */
export function mensagemErro(r: RespostaDigisan): string {
  if (r.erro) return r.erro;
  if (r.status === 401 || r.status === 403) return "Chave da Digisan inválida ou sem permissão.";
  const c = r.corpo ?? {};
  const m = c.mensagem ?? c.message ?? c.mensagemRejeicao ?? c.erro;
  const lista = Array.isArray(c.erros) ? (c.erros as unknown[]).map((e) => (typeof e === "string" ? e : JSON.stringify(e))).join("; ") : "";
  return String(m ?? lista ?? `Erro ${r.status} na Digisan`).slice(0, 500) || `Erro ${r.status} na Digisan`;
}
