"use server";

import { revalidatePath } from "next/cache";
import { sessaoEquipe, temNotas } from "@/lib/sessao";
import { supabaseServico } from "@/lib/supabase";
import { cifrar, criptoDisponivel } from "@/lib/cripto";
import { enviarCertificado, mensagemErro, salvarEmpresa, verWebhook, type NfseConfig } from "@/lib/notas/digisan";
import { chaveDigisan } from "@/lib/notas/chave";
import { NOTAS_INCLUSAS } from "@/lib/assinatura";

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
  const nacional = f.get("padrao_nacional") === "on";
  const item = codigoServico(txt(f, "item", 12), nacional);
  const codMun = dig(f, "codigo_municipal");
  const cnae = dig(f, "cnae");
  const nbs = dig(f, "nbs");
  const aliquota = Number(txt(f, "aliquota", 6).replace(",", "."));
  const cst = dig(f, "cst"), cClass = dig(f, "cclasstrib"), indOp = dig(f, "indop");
  // operação com imóvel: o padrão nacional exige o grupo "imóvel" na nota (erro E0932)
  const imovelObrigatorio = ["020101", "020201", "020202", "020301", "020401"].includes(indOp);
  const im = {
    cep: dig(f, "im_cep"), uf: txt(f, "im_uf", 2).toUpperCase(), logradouro: txt(f, "im_log", 120), numero: txt(f, "im_num", 20),
    bairro: txt(f, "im_bairro", 80), cidade: txt(f, "im_cidade", 80), insc: txt(f, "im_insc", 40),
  };
  const temImovel = !!(im.cep || im.logradouro);
  const gateway = !f.has("limite");
  const limite = gateway ? NOTAS_INCLUSAS : Number(txt(f, "limite", 5)), ciclo = gateway ? 1 : Number(txt(f, "ciclo", 2));

  if (cnpj.length !== 14) return "Informe o CNPJ de quem emite a nota (14 números).";
  if (ibge.length !== 7) return "Informe o código IBGE do município da pousada (7 números).";
  if (nacional ? !/^\d{6}$/.test(item) : !/^\d{1,2}\.\d{2}$/.test(item))
    return nacional
      ? "Informe o código de tributação nacional com 6 números (ex.: 100501 para corretagem, 090101 para hospedagem)."
      : "Informe o item da lista de serviços no formato 10.05 ou 9.01.";
  if (!codMun) return "Informe o código de tributação municipal (está no cadastro do serviço na prefeitura ou na Digisan).";
  if (nbs.length !== 9) return "Informe o código NBS com 9 números (ex.: 110012100).";
  if (!(aliquota > 0 && aliquota <= 5)) return "Informe a alíquota do ISS entre 0,01 e 5.";
  if ((imovelObrigatorio || temImovel) && (im.cep.length !== 8 || im.uf.length !== 2 || !im.logradouro || !im.numero || !im.bairro || !im.cidade))
    return "Preencha o endereço do imóvel (CEP com 8 números, UF, rua, número, bairro e cidade): o indicador de operação informado é de imóvel e o padrão nacional exige.";
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
    ibscbs: {
      ...((servicoAntes.ibscbs as object) ?? {}), cst, codigoClassificacaoTributaria: cClass, codigoIndicadorOperacao: indOp, tipoOperacao: "1",
      imovel: temImovel ? {
        ...(im.insc ? { inscricaoImobiliaria: im.insc } : {}),
        endereco: { cep: im.cep, uf: im.uf, logradouro: im.logradouro, numero: im.numero, bairro: im.bairro, municipio: { codigoIbge: ibge, nome: im.cidade }, pais: { nome: "Brasil", sigla: "BR", bacen: "1058" } },
      } : undefined,
    },
  };
  if (!cnae) delete servico.cnae;

  const novo = {
    ...antes,
    prestadorCnpj: cnpj,
    padraoNacional: nacional,
    enviarPorEmail: f.get("enviar_email") === "on",
    telefoneTomador: f.get("telefone_tomador") === "on",
    prefixoDescricao: txt(f, "prefixo", 80) || "Hospedagem",
    limiteMensal: limite,
    cicloDia: ciclo,
    servico,
  };
  // mudou quem emite ou o serviço → nova nota de teste antes de liberar o resto
  const mudouFiscal = antes.prestadorCnpj !== cnpj || estavel(servicoAntes) !== estavel(servico) || !!antes.padraoNacional !== novo.padraoNacional;
  if (mudouFiscal || !antes.prestadorCnpj) Object.assign(novo, { liberada: false, testeDesde: new Date().toISOString() });
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
  let q = db.from("notas_fiscais").select("id", { count: "exact", head: true }).eq("pousada_id", s.pousada.id).eq("status", "autorizada");
  if (typeof cfg.testeDesde === "string") q = q.gte("criada_em", cfg.testeDesde); // a nota de teste tem que ser desta fase
  const { count } = await q;
  if (!count) return; // só libera depois de ao menos uma nota autorizada
  await db.from("pousadas").update({ nfse_config: { ...cfg, liberada: true } }).eq("id", s.pousada.id);
  revalidatePath("/painel/notas");
}

/** Conta Gateway (notas inclusas no plano): cadastra a pousada como emitente na Digisan e envia o certificado A1.
 * O certificado e a senha vão direto para a Digisan e NÃO ficam guardados no A Chegada. Só o dono. */
export async function cadastrarEmitente(_: string, f: FormData): Promise<string> {
  const s = await sessaoEquipe({ exigirAssinatura: true });
  if (s.perfil.papel !== "dono") return "Só o dono pode cadastrar o emitente.";
  const db = supabaseServico();
  const k = await chaveDigisan(db, s.pousada.id);
  if (k?.origem !== "gateway") return "Esta pousada usa a própria conta da Digisan: o emitente e o certificado são cadastrados no painel da Digisan.";
  const cnpj = dig(f, "e_cnpj"), cep = dig(f, "e_cep"), ibge = dig(f, "e_ibge"), cnae = dig(f, "e_cnae");
  const razao = txt(f, "e_razao", 150), im = txt(f, "e_im", 30), email = txt(f, "e_email", 120).toLowerCase();
  const regime = txt(f, "e_regime", 2), especial = txt(f, "e_especial", 2);
  if (cnpj.length !== 14) return "Informe o CNPJ da pousada (14 números).";
  if (razao.length < 3) return "Informe a razão social (como está no cartão CNPJ).";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return "Informe um e-mail válido da empresa.";
  if (cnae.length !== 7) return "Informe o CNAE principal com 7 números (ex.: 5510801).";
  if (cep.length !== 8 || ibge.length !== 7) return "Informe o CEP (8 números) e o código IBGE do município (7 números).";
  if (!txt(f, "e_logradouro") || !txt(f, "e_numero", 20) || !txt(f, "e_bairro") || !txt(f, "e_municipio", 80) || txt(f, "e_uf", 2).length !== 2)
    return "Complete o endereço da empresa (rua, número, bairro, cidade e UF).";
  if (!["1", "2", "3", "4"].includes(regime)) return "Escolha o regime tributário.";

  const empresa = {
    cnpj, razaoSocial: razao, email, telefone: dig(f, "e_telefone"), cnaePrincipal: cnae,
    inscricaoEstadual: txt(f, "e_ie", 30), inscricaoMunicipal: im,
    optanteSimples: regime === "1" || regime === "2", mei: regime === "4",
    codigoRegimeTributario: regime, codigoRegimeTributarioEspecial: especial || "0",
    endereco: {
      uf: txt(f, "e_uf", 2).toUpperCase(), codigoMunicipioIbge: ibge, municipio: txt(f, "e_municipio", 80),
      logradouro: txt(f, "e_logradouro"), complemento: txt(f, "e_complemento", 60), numero: txt(f, "e_numero", 20), bairro: txt(f, "e_bairro"), cep,
    },
    ...(txt(f, "e_login_pref", 80) ? { loginPrefeitura: txt(f, "e_login_pref", 80), senhaPrefeitura: String(f.get("e_senha_pref") ?? "") } : {}),
  };
  const r = await salvarEmpresa(k.chave, empresa);
  if (!r.ok) return `A Digisan recusou o cadastro da empresa: ${mensagemErro(r)}`;

  const arq = f.get("e_certificado");
  const senha = String(f.get("e_cert_senha") ?? "");
  let certificadoEm: string | null = null;
  if (arq instanceof File && arq.size > 0) {
    if (!/\.(pfx|p12)$/i.test(arq.name)) return "Empresa cadastrada, mas o certificado precisa ser o arquivo A1 (.pfx ou .p12).";
    if (arq.size > 200_000) return "Empresa cadastrada, mas o arquivo do certificado está grande demais. Confira se é o A1 (.pfx).";
    if (!senha) return "Empresa cadastrada. Informe a senha do certificado para enviá-lo.";
    const c = await enviarCertificado(k.chave, cnpj, arq, arq.name, senha);
    if (!c.ok) return `Empresa cadastrada, mas a Digisan recusou o certificado (confira o arquivo e a senha): ${mensagemErro(c)}`;
    certificadoEm = new Date().toISOString();
  }

  const { data: p } = await db.from("pousadas").select("nfse_config").eq("id", s.pousada.id).maybeSingle();
  const antes = (p?.nfse_config ?? {}) as Record<string, unknown> & { emitente?: Record<string, unknown> };
  const novo: Record<string, unknown> = {
    ...antes,
    prestadorCnpj: cnpj,
    emitente: { razaoSocial: razao, cadastradoEm: new Date().toISOString(), certificadoEnviadoEm: certificadoEm ?? antes.emitente?.certificadoEnviadoEm ?? null },
    // natureza de tributação da Digisan: 1 = Simples Nacional. Sem ela a Digisan põe a alíquota do município
    // e o padrão nacional recusa a nota de optante do Simples (E0625).
    ...(["1", "2", "4"].includes(regime) ? { naturezaTributacao: 1 } : {}),
  };
  if (antes.prestadorCnpj !== cnpj) Object.assign(novo, { liberada: false, testeDesde: new Date().toISOString() });
  const { error } = await db.from("pousadas").update({ nfse_config: novo }).eq("id", s.pousada.id);
  if (error) return "A Digisan aceitou, mas não foi possível salvar aqui. Tente de novo.";
  revalidatePath("/painel/notas");
  return certificadoEm ? "Salvo: empresa cadastrada e certificado enviado. Agora complete o serviço abaixo." : "Salvo: empresa cadastrada. Falta enviar o certificado A1.";
}

/**
 * Padrão nacional: o código vai direto no cTribNac, que exige 6 números (item + subitem + desdobro).
 * Aceita "10.05", "10.05.01", "9.01" ou "100501" e devolve "100501" / "090101".
 * Fora do padrão nacional, devolve no formato da LC 116 ("10.05").
 */
function codigoServico(bruto: string, nacional: boolean): string {
  const t = bruto.trim();
  const m = t.match(/^(\d{1,2})\.(\d{2})(?:\.(\d{2}))?$/);
  if (nacional) {
    if (m) return m[1].padStart(2, "0") + m[2] + (m[3] ?? "01");
    return t.replace(/\D/g, "");
  }
  if (m) return `${Number(m[1])}.${m[2]}`;
  const d = t.replace(/\D/g, "");
  return d.length >= 4 ? `${Number(d.slice(0, 2))}.${d.slice(2, 4)}` : t;
}
