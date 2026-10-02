import * as XLSX from "xlsx";
import { createHash } from "node:crypto";
import { dataHL, lerArquivoHotelLink, type ReservaHL } from "./hotellink";

// Importação de reservas por planilha.
// Aceita a PLANILHA MODELO do A Chegada (baixada no painel) e, por compatibilidade,
// a lista exportada de alguns sistemas de reservas.

export const COLUNAS_MODELO = [
  "Código da reserva", "Nome do titular", "WhatsApp", "Check-in", "Check-out",
  "Adultos", "Crianças", "Chalé ou quarto", "Canal", "Código no canal", "Situação",
] as const;

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");

/** Data em vários formatos: objeto Date (célula de data), 15/10/2026, 15/10/26, 2026-10-15, "15 Oct 2026". */
function dataPlanilha(v: unknown): string | null {
  if (v instanceof Date && !isNaN(v.getTime())) {
    // células de data chegam como meia-noite local; arredonda para o dia mais próximo
    const d = new Date(v.getTime() + 12 * 3600e3);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
  }
  if (typeof v === "number" && v > 30000 && v < 80000) { // número de série de data do Excel
    const d = XLSX.SSF.parse_date_code(v);
    return `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
  }
  const s = String(v ?? "").trim();
  let m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (m) {
    const ano = m[3].length === 2 ? `20${m[3]}` : m[3];
    const dia = Number(m[1]), mes = Number(m[2]);
    if (dia < 1 || dia > 31 || mes < 1 || mes > 12) return null;
    return `${ano}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
  }
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  return dataHL(s);
}

const numero = (v: unknown, padrao: number) => {
  const n = parseInt(String(v ?? "").replace(/\D/g, ""), 10);
  return Number.isFinite(n) ? n : padrao;
};

/** Lê a planilha modelo. Devolve null se o arquivo não tiver as colunas do modelo. */
function lerModelo(linhas: unknown[][]): { reservas: ReservaHL[]; erro?: string; avisos?: string[] } | null {
  const alvo = norm("Nome do titular");
  const inicio = linhas.findIndex((l) => l.some((c) => norm(String(c ?? "")) === alvo));
  if (inicio < 0) return null;
  const cab = linhas[inicio].map((c) => norm(String(c ?? "")));
  const col = (nome: string) => cab.indexOf(norm(nome));
  const i = {
    ref: col("Código da reserva"), nome: col("Nome do titular"), tel: col("WhatsApp"), entrada: col("Check-in"), saida: col("Check-out"),
    adultos: col("Adultos"), criancas: col("Crianças"), quarto: col("Chalé ou quarto"), canal: col("Canal"), codCanal: col("Código no canal"), situacao: col("Situação"),
  };
  if (i.entrada < 0 || i.saida < 0)
    return { reservas: [], erro: "A planilha precisa das colunas “Check-in” e “Check-out”. Baixe a planilha modelo e copie as reservas para ela." };

  const reservas: ReservaHL[] = [];
  const problemas: string[] = [];
  linhas.slice(inicio + 1).forEach((c, n) => {
    const titular = String(c[i.nome] ?? "").trim().replace(/\s+/g, " ");
    if (!titular) return; // linha vazia
    const checkIn = dataPlanilha(c[i.entrada]);
    const checkOut = dataPlanilha(c[i.saida]);
    if (!checkIn || !checkOut) { problemas.push(`linha ${inicio + n + 2} (${titular}): data inválida`); return; }
    const codigo = i.ref >= 0 ? String(c[i.ref] ?? "").trim() : "";
    // sem código: identifica a reserva pelo nome + datas, para não duplicar ao importar de novo
    const referencia = codigo || "PL-" + createHash("sha1").update(`${norm(titular)}|${checkIn}|${checkOut}`).digest("hex").slice(0, 12);
    const situacao = i.situacao >= 0 ? String(c[i.situacao] ?? "").trim() : "";
    reservas.push({
      referencia,
      otaReferencia: i.codCanal >= 0 ? String(c[i.codCanal] ?? "").trim() : "",
      titular,
      telefone: i.tel >= 0 ? String(c[i.tel] ?? "").trim() : "",
      origem: i.canal >= 0 ? String(c[i.canal] ?? "").trim() : "",
      checkIn,
      checkOut,
      status: /cancel/i.test(situacao) ? "Cancelada" : "Confirmada",
      quarto: i.quarto >= 0 ? String(c[i.quarto] ?? "").trim() : "",
      adultos: i.adultos >= 0 ? numero(c[i.adultos], 2) : 2,
      criancas: i.criancas >= 0 ? numero(c[i.criancas], 0) : 0,
    });
  });
  if (!reservas.length)
    return { reservas, erro: problemas.length ? `Nenhuma reserva válida. ${problemas.slice(0, 3).join("; ")}.` : "A planilha está vazia." };
  return { reservas, avisos: problemas };
}

/** Lê a planilha de reservas enviada no painel (modelo do A Chegada, .xlsx/.xls/.csv, ou exportação de sistema). */
export function lerPlanilhaReservas(bytes: Uint8Array): { reservas: ReservaHL[]; erro?: string; avisos?: string[] } {
  const comeco = new TextDecoder("utf-8").decode(bytes.slice(0, 400));
  const zip = bytes[0] === 0x50 && bytes[1] === 0x4b; // .xlsx (PK...)
  if (!zip && /<\?xml|<Workbook/i.test(comeco)) return lerArquivoHotelLink(bytes); // exportação em XML (.xls 2003)

  let linhas: unknown[][];
  try {
    const ehTexto = !zip && !/[\x00-\x08]/.test(comeco);
    // CSV: decodifica como UTF-8 (acentos) e lê como texto puro (não troca dia e mês); planilha: lê as datas como datas
    const wb = ehTexto
      ? XLSX.read(new TextDecoder("utf-8").decode(bytes).replace(/^\uFEFF/, ""), { type: "string", raw: true })
      : XLSX.read(bytes, { type: "array", cellDates: true });
    const ws = wb.Sheets[wb.SheetNames[0]];
    linhas = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: "" }) as unknown[][];
  } catch {
    return { reservas: [], erro: "Não consegui abrir este arquivo. Use a planilha modelo (.xlsx) ou salve como .csv." };
  }
  const modelo = lerModelo(linhas);
  if (modelo) return modelo;
  // não é o modelo: tenta o formato de exportação de sistemas de reservas
  const outro = lerArquivoHotelLink(bytes);
  if (!outro.erro) return outro;
  return { reservas: [], erro: "Não reconheci as colunas desta planilha. Baixe a planilha modelo no botão “Importar reservas”, copie suas reservas para ela e envie de novo." };
}
