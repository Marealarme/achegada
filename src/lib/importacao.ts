import * as XLSX from "xlsx";
import { createHash } from "node:crypto";
import { CAMPOS, type Campo } from "./camposPlanilha";
import { dataHL, hospedesHL, lerArquivoHotelLink, type ReservaHL } from "./hotellink";

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

// ---------- campos que o A Chegada precisa de qualquer planilha ----------

export { CAMPOS };
export type Indices = Partial<Record<Campo, number>>;
/** Ligação salva: para planilhas com estes cabeçalhos, cada campo vem da coluna com este nome. */
export type MapaSalvo = { assinatura: string; colunas: Partial<Record<Campo, string>> };
export type PedidoMapeamento = { colunas: string[]; amostras: string[][]; sugestao: Indices };
export type ResultadoLeitura = { reservas: ReservaHL[]; erro?: string; avisos?: string[]; mapear?: PedidoMapeamento; mapaNovo?: MapaSalvo; fonte?: "modelo" | "sistema" | "ligacao" };

/** Lê as linhas a partir do cabeçalho, usando o índice de cada campo. */
function lerComIndices(linhas: unknown[][], inicio: number, i: Indices): { reservas: ReservaHL[]; erro?: string; avisos?: string[] } {
  const v = (c: unknown[], k: Campo) => (i[k] !== undefined && i[k]! >= 0 ? c[i[k]!] : "");
  const t = (c: unknown[], k: Campo) => String(v(c, k) ?? "").trim();
  const reservas: ReservaHL[] = [];
  const problemas: string[] = [];
  linhas.slice(inicio + 1).forEach((c, n) => {
    const titular = t(c, "titular").replace(/\s+/g, " ");
    if (!titular) return; // linha vazia ou de total
    const checkIn = dataPlanilha(v(c, "checkIn"));
    const checkOut = dataPlanilha(v(c, "checkOut"));
    if (!checkIn || !checkOut) {
      if (t(c, "checkIn") || t(c, "checkOut")) problemas.push(`linha ${inicio + n + 2} (${titular}): data inválida`); // sem datas: linha de total, ignora
      return;
    }
    const codigo = t(c, "referencia");
    // sem código: identifica a reserva pelo nome + datas, para não duplicar ao importar de novo
    const referencia = codigo || "PL-" + createHash("sha1").update(`${norm(titular)}|${checkIn}|${checkOut}`).digest("hex").slice(0, 12);
    const pessoas = t(c, "adultos");
    const porTexto = /adult|crian|child|ni[nñ]/i.test(pessoas) ? hospedesHL(pessoas) : null;
    reservas.push({
      referencia,
      otaReferencia: t(c, "codCanal").replace(/^-$/, ""),
      titular,
      telefone: t(c, "telefone"),
      origem: t(c, "canal"),
      checkIn,
      checkOut,
      status: /cancel/i.test(t(c, "situacao")) ? "Cancelada" : "Confirmada",
      quarto: t(c, "quarto"),
      adultos: porTexto ? porTexto.adultos : numero(pessoas, 2) || 2,
      criancas: porTexto ? porTexto.criancas : numero(t(c, "criancas"), 0),
    });
  });
  if (!reservas.length)
    return { reservas, erro: problemas.length ? `Nenhuma reserva válida. ${problemas.slice(0, 3).join("; ")}.` : "A planilha está vazia." };
  return { reservas, avisos: problemas };
}

/** Lê a planilha modelo. Devolve null se o arquivo não tiver as colunas do modelo. */
function lerModelo(linhas: unknown[][]) {
  const alvo = norm("Nome do titular");
  const inicio = linhas.findIndex((l) => l.some((c) => norm(String(c ?? "")) === alvo));
  if (inicio < 0) return null;
  const cab = linhas[inicio].map((c) => norm(String(c ?? "")));
  const col = (nome: string) => cab.indexOf(norm(nome));
  const i: Indices = {
    referencia: col("Código da reserva"), titular: col("Nome do titular"), telefone: col("WhatsApp"), checkIn: col("Check-in"), checkOut: col("Check-out"),
    adultos: col("Adultos"), criancas: col("Crianças"), quarto: col("Chalé ou quarto"), canal: col("Canal"), codCanal: col("Código no canal"), situacao: col("Situação"),
  };
  if (i.checkIn! < 0 || i.checkOut! < 0) return null; // parecido, mas não é o modelo: segue para a ligação de colunas
  return lerComIndices(linhas, inicio, i);
}

// ---------- planilhas de outros sistemas: ligação de colunas ----------

const textoCelula = (v: unknown) => {
  if (v instanceof Date) { const d = dataPlanilha(v); return d ? d.split("-").reverse().join("/") : ""; }
  return String(v ?? "").trim();
};

/** Acha a linha de cabeçalho: a primeira (entre as 20 primeiras) com 3+ células de texto. */
function linhaCabecalho(linhas: unknown[][]) {
  for (let k = 0; k < Math.min(20, linhas.length); k++) {
    const cheias = linhas[k].map(textoCelula).filter(Boolean);
    const textos = cheias.filter((c) => /[a-zà-ú]/i.test(c) && !dataPlanilha(c));
    if (cheias.length >= 3 && textos.length >= cheias.length * 0.6) return k;
  }
  return -1;
}

const assinaturaDe = (cab: string[]) => createHash("sha1").update(cab.map(norm).join("|")).digest("hex").slice(0, 16);

/** Sugere a coluna de cada campo pelo nome do cabeçalho (nome exato primeiro, depois "contém"). */
function sugerir(cab: string[]): Indices {
  const n = cab.map(norm);
  const usadas = new Set<number>();
  const sug: Indices = {};
  for (const modo of ["exato", "contem"] as const) {
    for (const campo of CAMPOS) {
      if (sug[campo.id] !== undefined) continue;
      for (const s of campo.sinonimos.map(norm)) {
        const k = n.findIndex((h, idx) => !usadas.has(idx) && h && (modo === "exato" ? h === s : s.length >= 4 && h.includes(s)));
        if (k >= 0) { sug[campo.id] = k; usadas.add(k); break; }
      }
    }
  }
  return sug;
}

function lerLinhas(bytes: Uint8Array): unknown[][] | null {
  const comeco = new TextDecoder("utf-8").decode(bytes.slice(0, 400));
  const zip = bytes[0] === 0x50 && bytes[1] === 0x4b; // .xlsx (PK...)
  try {
    const ehTexto = !zip && !/[\x00-\x08]/.test(comeco);
    // CSV: decodifica como UTF-8 (acentos) e lê como texto puro (não troca dia e mês); planilha: lê as datas como datas
    const wb = ehTexto
      ? XLSX.read(new TextDecoder("utf-8").decode(bytes).replace(/^﻿/, ""), { type: "string", raw: true })
      : XLSX.read(bytes, { type: "array", cellDates: true });
    const ws = wb.Sheets[wb.SheetNames[0]];
    return XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: "" }) as unknown[][];
  } catch {
    return null;
  }
}

/**
 * Lê a planilha de reservas enviada no painel.
 * Ordem: planilha modelo → lista do Hotel Link → ligação de colunas salva → ligação escolhida agora (manual).
 * Se nada servir, devolve `mapear` para o painel mostrar a tela de ligar colunas.
 */
export function lerPlanilhaReservas(
  bytes: Uint8Array,
  opcoes: { mapas?: MapaSalvo[]; manual?: Indices; refazer?: boolean } = {},
): ResultadoLeitura {
  const comeco = new TextDecoder("utf-8").decode(bytes.slice(0, 400));
  const zip = bytes[0] === 0x50 && bytes[1] === 0x4b;
  if (!zip && /<\?xml|<Workbook/i.test(comeco)) return { ...lerArquivoHotelLink(bytes), fonte: "sistema" }; // exportação em XML (.xls 2003)

  const linhas = lerLinhas(bytes);
  if (!linhas) return { reservas: [], erro: "Não consegui abrir este arquivo. Salve como .xlsx ou .csv e envie de novo." };

  if (!opcoes.manual && !opcoes.refazer) {
    const modelo = lerModelo(linhas);
    if (modelo) return { ...modelo, fonte: "modelo" };
    const outro = lerArquivoHotelLink(bytes);
    if (!outro.erro) return { ...outro, fonte: "sistema" };
  }

  const inicio = linhaCabecalho(linhas);
  if (inicio < 0) return { reservas: [], erro: "Não encontrei a linha com os nomes das colunas. A primeira linha da planilha deve ter os títulos (Nome, Check-in, Check-out…)." };
  const cab = linhas[inicio].map(textoCelula);
  const assinatura = assinaturaDe(cab);
  const n = cab.map(norm);

  // ligação escolhida agora na tela
  if (opcoes.manual) {
    const faltando = CAMPOS.filter((c) => c.obrigatorio && !(opcoes.manual![c.id]! >= 0));
    if (faltando.length) return { reservas: [], erro: `Escolha a coluna de: ${faltando.map((c) => c.rotulo).join(", ")}.`, mapear: pedido(linhas, inicio, cab, opcoes.manual) };
    const lido = lerComIndices(linhas, inicio, opcoes.manual);
    const colunas: MapaSalvo["colunas"] = {};
    for (const c of CAMPOS) { const k = opcoes.manual[c.id]; if (k !== undefined && k >= 0) colunas[c.id] = n[k]; }
    return { ...lido, fonte: "ligacao", ...(lido.erro ? { mapear: pedido(linhas, inicio, cab, opcoes.manual) } : { mapaNovo: { assinatura, colunas } }) };
  }

  // ligação salva para planilhas com estes mesmos cabeçalhos
  const salvo = (opcoes.mapas ?? []).find((m) => m.assinatura === assinatura);
  if (salvo && !opcoes.refazer) {
    const i: Indices = {};
    for (const c of CAMPOS) { const nome = salvo.colunas[c.id]; if (nome) i[c.id] = n.indexOf(nome); }
    if (i.titular! >= 0 && i.checkIn! >= 0 && i.checkOut! >= 0) return { ...lerComIndices(linhas, inicio, i), fonte: "ligacao" };
  }

  // primeira vez com esta planilha (ou pediu para refazer): mostra a tela de ligar colunas
  let sugestao = sugerir(cab);
  if (salvo) { sugestao = {}; for (const c of CAMPOS) { const nome = salvo.colunas[c.id]; if (nome && n.includes(nome)) sugestao[c.id] = n.indexOf(nome); } }
  return { reservas: [], mapear: pedido(linhas, inicio, cab, sugestao) };
}

function pedido(linhas: unknown[][], inicio: number, cab: string[], sugestao: Indices): PedidoMapeamento {
  const dados = linhas.slice(inicio + 1).filter((l) => l.some((c) => textoCelula(c))).slice(0, 3);
  return {
    colunas: cab.map((c, k) => c || `Coluna ${k + 1}`),
    amostras: cab.map((_, k) => dados.map((l) => textoCelula(l[k]).slice(0, 40)).filter(Boolean)),
    sugestao,
  };
}
