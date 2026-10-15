"use server";

import { revalidatePath } from "next/cache";
import { sessaoEquipe, temNotas } from "@/lib/sessao";
import { supabaseServico } from "@/lib/supabase";
import { cifrar, criptoDisponivel } from "@/lib/cripto";
import { verWebhook, type NfseConfig } from "@/lib/notas/digisan";

const txt = (f: FormData, k: string, max = 200) => String(f.get(k) ?? "").trim().slice(0, max);
const dig = (f: FormData, k: string) => txt(f, k).replace(/\D/g, "");
/** JSON com as chaves em ordem: compara configurações sem depender da ordem dos campos. */
const estavel = (v: unknown): string =>
  v && typeof v === "object" && !Array.isArray(v)
    ? `{${Object.keys(v as object).sort().filter((k) => (v as Record<string, unknown>)[k] !== undefined).map((k) => `${JSON.stringify(k)}:${estavel((v as Record<string, unknown>)[k])}`).join(",")}}`
    : JSON.stringify(v);

/** Salva a configuração de NFS-e da pousada. Só o dono. A chave da Digisan é testada e guardada criptografada. */
export async function salvarConfigNfse(_: string, f: FormData): Promise<string> {
  const s = await sessaoEquipe({ exigirAssinatura: true });
  if (s.perfil.papel !== "dono") return "Só o dono pode configurar a emissão de notas.";
  if (!temNotas(s)) return "Ative o adicional de notas fiscais na assinatura.";
  const db = supabaseServico();
  const { data: p } = await db.from("pousadas").select("nfse_config").eq("id", s.pousada.id).maybeSingle();
  const antes = (p?.nfse_config ?? {}) as Partial<NfseConfig> & { liberada?: boolean; webhookId?: string };
  const servicoAntes = (antes.servico ?? {}) as Record<string, unknown>;

  const chave = String(f.get("chave") ?? "").trim();
  const cnpj = dig(f, "cnpj");
  const ibge = dig(f, "ibge");
  const item = txt(f, "item", 10);
  const codMun = dig(f, "codigo_municipal");
  const cnae = dig(f, "cnae");
  const nbs = dig(f, "nbs");
  const aliquota = Number(txt(f, "aliquota", 6).replace(",", "."));
  const cst = dig(f, "cst"), cClass = dig(f, "cclasstrib"), indOp = dig(f, "indop");
  const limite = Number(txt(f, "limite", 5)), ciclo = Number(txt(f, "ciclo", 2));

  if (cnpj.length !== 14) return "Informe o CNPJ de quem emite a nota (14 números).";
  if (ibge.length !== 7) return "Informe o código IBGE do município da pousada (7 números).";
  if (!/^\d{1,2}\.\d{2}$/.test(item)) return "Informe o item da lista de serviços no formato 10.05 ou 9.01.";
  if (!codMun) return "Informe o código de tributação municipal (está no cadastro do serviço na prefeitura ou na Digisan).";
  if (nbs.length !== 9) return "Informe o código NBS com 9 números (ex.: 110012100).";
  if (!(aliquota > 0 && aliquota <= 5)) return "Informe a alíquota do ISS entre 0,01 e 5.";
  if (cst.length !== 3 || cClass.length !== 6 || indOp.length !== 6) return "Informe a classificação do IBS/CBS: CST (3 números), classificação tributária (6) e indicador de operação (6).";
  if (!(limite >= 1 && limite <= 100000)) return "Informe quantas notas por mês o plano da Digisan permite.";
  if (!(ciclo >= 1 && ciclo <= 28)) return "Informe o dia (1 a 28) em que o período do plano da Digisan vira.";

  // chave nova: testa na Digisan antes de guardar
  if (chave) {
    if (!criptoDisponivel()) return "O servidor ainda não tem a chave de criptografia (CRIPTO_CHAVE). Fale com o suporte.";
    const r = await verWebhook(chave);
    if (r.status === 401 || r.status === 403) return "A Digisan não aceitou essa chave. Confira em Configurações > Chaves de API no painel da Digisan.";
    if (r.status === 0) return "Não foi possível falar com a Digisan para testar a chave. Tente de novo em instantes.";
    const { error } = await db.from("pousada_segredos").upsert({ pousada_id: s.pousada.id, digisan_chave_cripto: cifrar(chave), updated_at: new Date().toISOString() });
    if (error) return "Não foi possível guardar a chave. Confira se a atualização do banco 0014 foi rodada.";
  }

  const servico: Record<string, unknown> = {
    ...servicoAntes,
    cnae: cnae || undefined,
    codigoNbs: nbs,
    itemListaServicoLC116: item,
    codigoTributacaoMunicipio: codMun,
    codigoMunicipio: ibge,
    codigoMunicipioIncidencia: ibge,
    tipoTributacao: servicoAntes.tipoTributacao ?? 1,
    indicadorExigibilidade: servicoAntes.indicadorExigibilidade ?? 1,
    issRetido: servicoAntes.issRetido ?? false,
    aliquotaIss: Math.round(aliquota * 100) / 100,
    ibscbs: { ...((servicoAntes.ibscbs as object) ?? {}), cst, codigoClassificacaoTributaria: cClass, codigoIndicadorOperacao: indOp, tipoOperacao: "1" },
  };
  if (!cnae) delete servico.cnae;

  const novo = {
    ...antes,
    prestadorCnpj: cnpj,
    padraoNacional: f.get("padrao_nacional") === "on",
    enviarPorEmail: f.get("enviar_email") === "on",
    telefoneTomador: f.get("telefone_tomador") === "on",
    prefixoDescricao: txt(f, "prefixo", 80) || "Hospedagem",
    limiteMensal: limite,
    cicloDia: ciclo,
    servico,
  };
  // mudou quem emite ou o serviço → nova nota de teste antes de liberar o resto
  const mudouFiscal = antes.prestadorCnpj !== cnpj || estavel(servicoAntes) !== estavel(servico) || !!antes.padraoNacional !== novo.padraoNacional;
  if (mudouFiscal || !antes.prestadorCnpj) novo.liberada = false;
  if (chave) delete novo.webhookId; // chave nova → ativar os avisos de novo nesta conta da Digisan

  const { error } = await db.from("pousadas").update({ nfse_config: novo }).eq("id", s.pousada.id);
  if (error) return "Não foi possível salvar. Tente de novo.";
  revalidatePath("/painel/notas");
  return mudouFiscal && antes.liberada
    ? "Salvo. Como os dados fiscais mudaram, a emissão voltou para a fase de teste: emita uma nota e confira o PDF antes de liberar as outras."
    : "Salvo.";
}

/** Libera a emissão de todas as notas depois de conferir o PDF da nota de teste. Só o dono. */
export async function liberarEmissao(): Promise<void> {
  const s = await sessaoEquipe({ exigirAssinatura: true });
  if (s.perfil.papel !== "dono" || !temNotas(s)) return;
  const db = supabaseServico();
  const { data: p } = await db.from("pousadas").select("nfse_config").eq("id", s.pousada.id).maybeSingle();
  const cfg = p?.nfse_config as Record<string, unknown> | null;
  if (!cfg) return;
  const { count } = await db.from("notas_fiscais").select("id", { count: "exact", head: true }).eq("pousada_id", s.pousada.id).eq("status", "autorizada");
  if (!count) return; // só libera depois de ao menos uma nota autorizada
  await db.from("pousadas").update({ nfse_config: { ...cfg, liberada: true } }).eq("id", s.pousada.id);
  revalidatePath("/painel/notas");
}
