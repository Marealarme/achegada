import * as XLSX from "xlsx";
import { podeConfigurar, sessaoEquipe } from "@/lib/sessao";
import { supabaseServico } from "@/lib/supabase";
import { cpfFormatar, noites } from "@/lib/util";
import { GENEROS, MEIOS_TRANSPORTE, MOTIVOS_VIAGEM, PAISES } from "@/lib/fnrh/dominios";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Planilha com todos os hóspedes que já fizeram o check-in online, uma linha por pessoa por estadia.
// Só dono e gerência baixam (contém CPF e endereço). Cor/raça e deficiência nunca ficam guardadas, então não aparecem.

type Hospede = {
  nome: string; cpf: string | null; passaporte: string | null; data_nascimento: string | null; telefone: string | null;
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
function situacao(r: NonNullable<Linha["reservas"]>) {
  if (r.cancelada_em) return "Cancelada";
  if (r.checkout_em) return "Saiu";
  if (r.checkin_em) return "Hospedado";
  if (r.fnrh_status === "enviado" || r.fnrh_concluida) return "Ficha enviada";
  if (r.fnrh_status === "erro") return "Erro na ficha";
  return "Check-in online feito";
}

export async function GET() {
  const s = await sessaoEquipe({ exigirAssinatura: true });
  if (!podeConfigurar(s)) return new Response("Só o dono ou a gerência podem baixar a lista de hóspedes.", { status: 403 });

  const db = supabaseServico(); // a pousada já foi confirmada pela sessão; tudo filtrado por pousada_id
  const campos = (extra: string) =>
    `papel, hospedes(nome, cpf, passaporte, data_nascimento, telefone, email, genero, nacionalidade, pais_residencia, cep, logradouro, numero, complemento, bairro, cidade, uf, consentimento_marketing_em), reservas!inner(titular, telefone, check_in, check_out, origem, fnrh_status, fnrh_concluida, checkin_em, checkout_em${extra}, unidades(nome), pre_chegadas(created_at, horario_chegada, placa, pet_tem, pet_nome, pet_especie, motivo_viagem, meio_transporte))`;
  const linhas: Linha[] = [];
  for (let de = 0; ; de += 1000) {
    let resp = await db.from("hospedes_reserva").select(campos(", cancelada_em")).eq("pousada_id", s.pousada.id).range(de, de + 999);
    if (resp.error) resp = await db.from("hospedes_reserva").select(campos("")).eq("pousada_id", s.pousada.id).range(de, de + 999); // antes da 0007
    if (resp.error) return new Response("Não foi possível gerar a planilha. Tente de novo.", { status: 500 });
    const pagina = (resp.data ?? []) as unknown as Linha[];
    linhas.push(...pagina);
    if (pagina.length < 1000) break;
  }

  const dados = linhas
    .filter((l) => l.hospedes && l.reservas)
    .map((l) => {
      const h = l.hospedes!, r = l.reservas!;
      const pre = (Array.isArray(r.pre_chegadas) ? r.pre_chegadas[0] : r.pre_chegadas) ?? null;
      const titular = l.papel === "titular";
      const endereco = [h.logradouro, h.numero, h.complemento].filter(Boolean).join(", ");
      return {
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
        "Telefone / WhatsApp": h.telefone ?? (titular ? r.telefone ?? "" : ""),
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
        "Check-in online feito em": dataHoraBr(pre?.created_at ?? null),
      };
    })
    .sort((a, b) => b["Check-in"].split("/").reverse().join("").localeCompare(a["Check-in"].split("/").reverse().join("")) || a["Nome"].localeCompare(b["Nome"]));

  const planilha = XLSX.utils.json_to_sheet(dados.length ? dados : [{ "Aviso": "Nenhum hóspede fez o check-in online ainda." }]);
  if (dados.length) {
    const cab = Object.keys(dados[0]);
    planilha["!cols"] = cab.map((c) => ({ wch: Math.min(40, Math.max(c.length + 2, ...dados.slice(0, 200).map((d) => String(d[c as keyof typeof d] ?? "").length + 1))) }));
    planilha["!autofilter"] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: dados.length, c: cab.length - 1 } }) };
  }
  const livro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(livro, planilha, "Hóspedes");
  const arquivo = XLSX.write(livro, { type: "buffer", bookType: "xlsx" }) as Buffer;

  const hoje = new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
  return new Response(new Uint8Array(arquivo), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="hospedes-${s.pousada.slug}-${hoje}.xlsx"`,
      "Cache-Control": "private, max-age=300", // "no-store" faz o iPhone não conseguir abrir o arquivo baixado
    },
  });
}
