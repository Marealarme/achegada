import * as XLSX from "xlsx";
import { podeConfigurar, sessaoEquipe } from "@/lib/sessao";
import { supabaseServico } from "@/lib/supabase";
import { cpfFormatar, noites } from "@/lib/util";
import { GENEROS, MEIOS_TRANSPORTE, MOTIVOS_VIAGEM, PAISES } from "@/lib/fnrh/dominios";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Planilhas de hóspedes (só dono e gerência). Cor/raça e deficiência nunca ficam guardadas, então não aparecem.
//  /painel/exportar?de=AAAA-MM-DD&ate=AAAA-MM-DD            → completa: aba "Estadias" (pessoa × estadia) + aba "Clientes" (uma linha por pessoa)
//  /painel/exportar?tipo=marketing&de=…&ate=…              → só quem autorizou ofertas, só dados de contato (para agência/CRM)
//  A planilha completa também traz a aba "Notas fiscais": uma linha por reserva (nº, valor, dados do titular).
// O período filtra pela data de check-in (abas Estadias e Clientes) e pela data de CHECK-OUT (aba Notas fiscais).

type Hospede = {
  id: string; nome: string; cpf: string | null; passaporte: string | null; data_nascimento: string | null; telefone: string | null;
  email: string | null; genero: string | null; nacionalidade: string | null; pais_residencia: string | null;
  cep: string | null; logradouro: string | null; numero: string | null; complemento: string | null; bairro: string | null;
  cidade: string | null; uf: string | null; consentimento_marketing_em: string | null;
};
type Pre = { created_at: string; horario_chegada: string | null; placa: string | null; pet_tem: boolean; pet_nome: string | null; pet_especie: string | null; motivo_viagem: string | null; meio_transporte: string | null };
type Linha = {
  papel: string;
  hospedes: Hospede | null;
  reservas: {
    titular: string; telefone: string | null; check_in: string; check_out: string; origem: string | null;
    referencia_externa?: string | null; ota_referencia?: string | null; valor_total?: number | null; valor_pago?: number | null; descartada_em?: string | null;
    fnrh_status: string | null; fnrh_concluida: boolean; checkin_em: string | null; checkout_em: string | null; cancelada_em: string | null;
    unidades: { nome: string } | null; pre_chegadas: Pre[] | Pre | null;
  } | null;
};

const rotulo = (lista: readonly { id: string; label: string }[], id: string | null) => (id ? lista.find((x) => x.id === id)?.label ?? id : "");
const dataBr = (iso: string | null) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "");
const dataHoraBr = (iso: string | null) => (iso ? new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "");
function idade(nasc: string | null, ref: string) {
  if (!nasc) return "";
  const [a, m, d] = nasc.split("-").map(Number), [ra, rm, rd] = ref.split("-").map(Number);
  return ra - a - (rm < m || (rm === m && rd < d) ? 1 : 0);
}
/** Telefone no formato +55 12 99999-9999 (brasileiro); outros ficam como digitados. */
function telefoneBR(v: string | null | undefined) {
  const t = String(v ?? "").trim();
  let d = t.replace(/\D/g, "");
  if (!d) return "";
  if (t.startsWith("+") && !d.startsWith("55")) return t; // estrangeiro
  if ((d.length === 12 || d.length === 13) && d.startsWith("55")) d = d.slice(2);
  if (d.length === 10 || d.length === 11) return `+55 ${d.slice(0, 2)} ${d.slice(2, d.length - 4)}-${d.slice(-4)}`;
  return t;
}
const aniversario = (nasc: string | null) => (nasc ? `${nasc.slice(8, 10)}/${nasc.slice(5, 7)}` : "");
const dataValida = (v: string | null) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);

function planilhaDe(dados: Record<string, unknown>[], vazio: string) {
  const ws = XLSX.utils.json_to_sheet(dados.length ? dados : [{ "Aviso": vazio }]);
  if (dados.length) {
    const cab = Object.keys(dados[0]);
    ws["!cols"] = cab.map((c) => ({ wch: Math.min(40, Math.max(c.length + 2, ...dados.slice(0, 200).map((d) => String(d[c] ?? "").length + 1))) }));
    ws["!autofilter"] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: dados.length, c: cab.length - 1 } }) };
  }
  return ws;
}

const COLUNAS_DINHEIRO = ["Valor total", "Pago", "Pendente"];
/** Formata as colunas de dinheiro como R$ (o número continua número, dá para somar no Excel). */
function formatarDinheiro(ws: XLSX.WorkSheet) {
  if (!ws["!ref"]) return ws;
  const faixa = XLSX.utils.decode_range(ws["!ref"]);
  for (let c = faixa.s.c; c <= faixa.e.c; c++) {
    const cab = ws[XLSX.utils.encode_cell({ r: 0, c })]?.v;
    if (!COLUNAS_DINHEIRO.includes(String(cab))) continue;
    for (let r = 1; r <= faixa.e.r; r++) {
      const cel = ws[XLSX.utils.encode_cell({ r, c })];
      if (cel && cel.t === "n") cel.z = '"R$" #,##0.00';
    }
  }
  return ws;
}
/** Nº da reserva do sistema (as referências "PL-…" são internas, geradas quando a planilha não tinha código). */
const numeroReserva = (ref: string | null | undefined) => (ref && !ref.startsWith("PL-") ? ref : "");
const dinheiro = (v: number | string | null | undefined) => (v === null || v === undefined || v === "" ? "" : Number(v));

function situacao(r: NonNullable<Linha["reservas"]>) {
  if (r.cancelada_em) return "Cancelada";
  if (r.checkout_em) return "Saiu";
  if (r.checkin_em) return "Hospedado";
  if (r.fnrh_status === "enviado" || r.fnrh_concluida) return "Ficha enviada";
  if (r.fnrh_status === "erro") return "Erro na ficha";
  return "Check-in online feito";
}

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const de = dataValida(q.get("de")), ate = dataValida(q.get("ate"));
  const marketing = q.get("tipo") === "marketing";
  const s = await sessaoEquipe({ exigirAssinatura: true });
  if (!podeConfigurar(s)) return new Response("Só o dono ou a gerência podem baixar a lista de hóspedes.", { status: 403 });

  const db = supabaseServico(); // a pousada já foi confirmada pela sessão; tudo filtrado por pousada_id
  const campos = (extra: string) =>
    `papel, hospedes(id, nome, cpf, passaporte, data_nascimento, telefone, email, genero, nacionalidade, pais_residencia, cep, logradouro, numero, complemento, bairro, cidade, uf, consentimento_marketing_em), reservas!inner(titular, telefone, check_in, check_out, origem, fnrh_status, fnrh_concluida, checkin_em, checkout_em${extra}, unidades(nome), pre_chegadas(created_at, horario_chegada, placa, pet_tem, pet_nome, pet_especie, motivo_viagem, meio_transporte))`;
  const linhas: Linha[] = [];
  // tenta com as colunas mais novas primeiro (0011: valor; 0005: nº da reserva; 0007: cancelada)
  const extras = [", cancelada_em, referencia_externa, ota_referencia, valor_total, valor_pago, descartada_em", ", cancelada_em, referencia_externa, ota_referencia, valor_total, valor_pago", ", cancelada_em, referencia_externa, ota_referencia", ", cancelada_em", ""];
  let nivel = 0;
  for (let de = 0; ; de += 1000) {
    let resp = await db.from("hospedes_reserva").select(campos(extras[nivel])).eq("pousada_id", s.pousada.id).range(de, de + 999);
    while (resp.error && nivel < extras.length - 1) {
      nivel++;
      resp = await db.from("hospedes_reserva").select(campos(extras[nivel])).eq("pousada_id", s.pousada.id).range(de, de + 999);
    }
    if (resp.error) return new Response("Não foi possível gerar a planilha. Tente de novo.", { status: 500 });
    const pagina = (resp.data ?? []) as unknown as Linha[];
    linhas.push(...pagina);
    if (pagina.length < 1000) break;
  }

  const validas = linhas.filter((l) => l.hospedes && l.reservas && !l.reservas.descartada_em); // fichas de teste ficam de fora
  const noPeriodo = (r: NonNullable<Linha["reservas"]>) => (!de || r.check_in >= de) && (!ate || r.check_in <= ate);

  // ---------- Clientes: uma linha por pessoa, com o histórico de TODAS as estadias (não canceladas) ----------
  type Cliente = { h: Hospede; fone: string; estadias: number; noites: number; primeira: string; ultima: string; ultimoChale: string; noPeriodo: boolean };
  const clientes = new Map<string, Cliente>();
  for (const l of validas) {
    const h = l.hospedes!, r = l.reservas!;
    if (r.cancelada_em) continue;
    const c = clientes.get(h.id) ?? { h, fone: "", estadias: 0, noites: 0, primeira: r.check_in, ultima: r.check_in, ultimoChale: "", noPeriodo: false };
    c.estadias++; c.noites += noites(r.check_in, r.check_out);
    if (r.check_in < c.primeira) c.primeira = r.check_in;
    if (r.check_in >= c.ultima) { c.ultima = r.check_in; c.ultimoChale = r.unidades?.nome ?? ""; }
    c.fone = c.fone || h.telefone || (l.papel === "titular" ? r.telefone ?? "" : "");
    c.noPeriodo ||= noPeriodo(r);
    clientes.set(h.id, c);
  }
  const listaClientes = [...clientes.values()].filter((c) => c.noPeriodo)
    .sort((a, b) => b.estadias - a.estadias || b.ultima.localeCompare(a.ultima) || a.h.nome.localeCompare(b.h.nome));

  const hoje = new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
  const sufixo = de || ate ? `${de ?? "inicio"}-a-${ate ?? hoje}` : hoje;
  const livro = XLSX.utils.book_new();
  let nomeArquivo: string;

  if (marketing) {
    // Só quem autorizou ofertas e só dados de contato: pode ir para agência, CRM ou WhatsApp Business.
    const dados = listaClientes.filter((c) => c.h.consentimento_marketing_em).map((c) => ({
      "Nome": c.h.nome,
      "WhatsApp": telefoneBR(c.fone),
      "E-mail": c.h.email ?? "",
      "Cidade": c.h.cidade ?? "",
      "UF": c.h.uf ?? "",
      "Aniversário": aniversario(c.h.data_nascimento),
      "Estadias": c.estadias,
      "Última estadia": dataBr(c.ultima),
      "Ofertas autorizadas em": dataHoraBr(c.h.consentimento_marketing_em),
    }));
    XLSX.utils.book_append_sheet(livro, planilhaDe(dados, "Ninguém autorizou receber ofertas neste período."), "Marketing");
    nomeArquivo = `marketing-${s.pousada.slug}-${sufixo}.xlsx`;
  } else {
    const estadias = validas.filter((l) => noPeriodo(l.reservas!)).map((l) => {
      const h = l.hospedes!, r = l.reservas!;
      const pre = (Array.isArray(r.pre_chegadas) ? r.pre_chegadas[0] : r.pre_chegadas) ?? null;
      const titular = l.papel === "titular";
      const endereco = [h.logradouro, h.numero, h.complemento].filter(Boolean).join(", ");
      return {
        "Nº da reserva": numeroReserva(r.referencia_externa),
        "Check-in": dataBr(r.check_in),
        "Check-out": dataBr(r.check_out),
        "Noites": noites(r.check_in, r.check_out),
        "Chalé / quarto": r.unidades?.nome ?? "",
        "Situação": situacao(r),
        "Nome": h.nome,
        "Titular ou acompanhante": titular ? "Titular" : "Acompanhante",
        "CPF": h.cpf ? cpfFormatar(h.cpf) : "",
        "Passaporte": h.passaporte ?? "",
        "Nascimento": dataBr(h.data_nascimento),
        "Idade na estadia": idade(h.data_nascimento, r.check_in),
        "Gênero": rotulo(GENEROS, h.genero),
        "Nacionalidade": rotulo(PAISES, h.nacionalidade),
        "Telefone / WhatsApp": telefoneBR(h.telefone ?? (titular ? r.telefone : "")),
        "E-mail": h.email ?? "",
        "CEP": h.cep ?? "",
        "Endereço": endereco,
        "Bairro": h.bairro ?? "",
        "Cidade": h.cidade ?? "",
        "UF": h.uf ?? "",
        "País de residência": rotulo(PAISES, h.pais_residencia),
        "Aceita receber ofertas": h.consentimento_marketing_em ? "Sim" : "Não",
        "Ofertas autorizadas em": dataHoraBr(h.consentimento_marketing_em),
        "Motivo da viagem": rotulo(MOTIVOS_VIAGEM, pre?.motivo_viagem ?? null),
        "Transporte": rotulo(MEIOS_TRANSPORTE, pre?.meio_transporte ?? null),
        "Placa": titular ? pre?.placa ?? "" : "",
        "Pet": titular ? (pre?.pet_tem ? [pre.pet_nome, pre.pet_especie].filter(Boolean).join(" · ") || "Sim" : "Não") : "",
        "Chegada prevista": titular ? pre?.horario_chegada?.slice(0, 5) ?? "" : "",
        "Canal da reserva": r.origem ?? "",
        "Código no canal": r.ota_referencia ?? "",
        "Valor total": titular ? dinheiro(r.valor_total) : "",
        "Check-in online feito em": dataHoraBr(pre?.created_at ?? null),
        "Chegada registrada na FNRH em": dataHoraBr(r.checkin_em),
        "Saída registrada na FNRH em": dataHoraBr(r.checkout_em),
      };
    }).sort((a, b) => b["Check-in"].split("/").reverse().join("").localeCompare(a["Check-in"].split("/").reverse().join("")) || a["Nome"].localeCompare(b["Nome"]));

    const dadosClientes = listaClientes.map((c) => ({
      "Nome": c.h.nome,
      "WhatsApp": telefoneBR(c.fone),
      "E-mail": c.h.email ?? "",
      "Cidade": c.h.cidade ?? "",
      "UF": c.h.uf ?? "",
      "Aniversário": aniversario(c.h.data_nascimento),
      "Estadias": c.estadias,
      "Noites no total": c.noites,
      "Primeira estadia": dataBr(c.primeira),
      "Última estadia": dataBr(c.ultima),
      "Último chalé": c.ultimoChale,
      "Aceita receber ofertas": c.h.consentimento_marketing_em ? "Sim" : "Não",
    }));
    // ---------- Notas fiscais: uma linha por reserva não cancelada, com ou sem check-in online ----------
    type HospNF = { nome: string; cpf: string | null; passaporte: string | null; email: string | null; telefone: string | null; cep: string | null; logradouro: string | null; numero: string | null; complemento: string | null; bairro: string | null; cidade: string | null; uf: string | null; pais_residencia: string | null };
    type ResNF = {
      titular: string; telefone: string | null; check_in: string; check_out: string; origem: string | null;
      referencia_externa?: string | null; ota_referencia?: string | null; valor_total?: number | null; valor_pago?: number | null;
      unidades: { nome: string } | null; hospedes_reserva: { papel: string; hospedes: HospNF | null }[];
    };
    const camposNF = (extra: string) => `titular, telefone, check_in, check_out, origem${extra}, unidades(nome), hospedes_reserva(papel, hospedes(nome, cpf, passaporte, email, telefone, cep, logradouro, numero, complemento, bairro, cidade, uf, pais_residencia))`;
    const reservasNF: ResNF[] = [];
    // notas do mês: reservas com CHECK-OUT no período escolhido, sem canceladas e sem fichas de teste
    for (const [extra, semTeste] of [[", referencia_externa, ota_referencia, valor_total, valor_pago", true], [", referencia_externa, ota_referencia, valor_total, valor_pago", false], [", referencia_externa, ota_referencia", false], ["", false]] as const) {
      let q = db.from("reservas").select(camposNF(extra)).eq("pousada_id", s.pousada.id).is("cancelada_em", null).order("check_out").limit(5000);
      if (semTeste) q = q.is("descartada_em", null);
      if (de) q = q.gte("check_out", de);
      if (ate) q = q.lte("check_out", ate);
      const { data, error } = await q;
      if (!error) { reservasNF.push(...((data ?? []) as unknown as ResNF[])); break; }
    }
    const notas = reservasNF.map((r) => {
      const h = r.hospedes_reserva.find((x) => x.papel === "titular")?.hospedes ?? null;
      const total = r.valor_total == null ? null : Number(r.valor_total);
      const estrangeiro = !!h?.pais_residencia && h.pais_residencia !== "BR";
      const pendencias = [
        !numeroReserva(r.referencia_externa) ? "sem reserva" : "",
        !h || (!h.cpf && !h.passaporte) ? "sem CPF" : "",
        !h || (!estrangeiro && (!h.cep || !h.logradouro)) ? "sem endereço" : "",
        total == null || total === 0 ? "sem valor" : "",
      ].filter(Boolean);
      const pago = r.valor_pago == null ? null : Number(r.valor_pago);
      return {
        "Nº da reserva": numeroReserva(r.referencia_externa),
        "Código no canal": r.ota_referencia ?? "",
        "Canal": r.origem ?? "",
        "Check-in": dataBr(r.check_in),
        "Check-out": dataBr(r.check_out),
        "Noites": noites(r.check_in, r.check_out),
        "Chalé / quarto": r.unidades?.nome ?? "",
        "Titular (tomador)": h?.nome ?? r.titular,
        "CPF": h?.cpf ? cpfFormatar(h.cpf) : "",
        "Passaporte": h?.passaporte ?? "",
        "E-mail": h?.email ?? "",
        "Telefone": telefoneBR(h?.telefone ?? r.telefone),
        "CEP": h?.cep ?? "",
        "Endereço": h ? [h.logradouro, h.numero, h.complemento].filter(Boolean).join(", ") : "",
        "Bairro": h?.bairro ?? "",
        "Cidade": h?.cidade ?? "",
        "UF": h?.uf ?? "",
        "País": h ? rotulo(PAISES, h.pais_residencia) : "",
        "Valor total": dinheiro(total),
        "Pago": dinheiro(pago),
        "Pendente": total != null && pago != null ? Math.round((total - pago) * 100) / 100 : "",
        "Pendência": pendencias.length ? pendencias.join(" / ") : "OK",
        "Check-in online": h ? "Sim" : "Não",
      };
    });

    XLSX.utils.book_append_sheet(livro, formatarDinheiro(planilhaDe(estadias, "Nenhum hóspede fez o check-in online neste período.")), "Estadias");
    XLSX.utils.book_append_sheet(livro, formatarDinheiro(planilhaDe(notas, "Nenhuma reserva neste período.")), "Notas fiscais");
    XLSX.utils.book_append_sheet(livro, planilhaDe(dadosClientes, "Nenhum cliente neste período."), "Clientes");
    nomeArquivo = `hospedes-${s.pousada.slug}-${sufixo}.xlsx`;
  }

  const arquivo = XLSX.write(livro, { type: "buffer", bookType: "xlsx", compression: true }) as Buffer;
  return new Response(new Uint8Array(arquivo), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${nomeArquivo}"`,
      "Cache-Control": "private, max-age=300", // "no-store" faz o iPhone não conseguir abrir o arquivo baixado
    },
  });
}
