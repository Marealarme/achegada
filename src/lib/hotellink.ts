import * as XLSX from "xlsx";

// Leitura da exportação de reservas do Hotel Link (arquivo .xls no formato "XML Spreadsheet 2003").

export type ReservaHL = {
  referencia: string;
  otaReferencia: string;
  titular: string;
  telefone: string;
  origem: string;
  checkIn: string;   // YYYY-MM-DD
  checkOut: string;  // YYYY-MM-DD
  status: string;
  quarto: string;    // primeiro quarto alocado, já com nome bonito ("Mezanino Maresias"); "" se não alocado
  adultos: number;
  criancas: number;
};

const MESES: Record<string, string> = {
  jan: "01", feb: "02", fev: "02", mar: "03", apr: "04", abr: "04", may: "05", mai: "05", jun: "06",
  jul: "07", aug: "08", ago: "08", sep: "09", set: "09", oct: "10", out: "10", nov: "11", dec: "12", dez: "12", ene: "01", dic: "12",
};

const OTAS = ["booking", "airbnb", "expedia", "decolar", "hoteis.com", "hotels.com", "trip.com", "agoda", "despegar"];

function texto(xml: string) {
  return xml
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .trim();
}

/** "16 Oct 2026" → "2026-10-16" */
export function dataHL(s: string): string | null {
  const t = s.trim();
  const m = t.match(/^(\d{1,2})\s+([A-Za-zçÇ]{3})[a-zç]*\.?\s+(\d{4})/);
  if (m) {
    const mes = MESES[m[2].toLowerCase()];
    return mes ? `${m[3]}-${mes}-${m[1].padStart(2, "0")}` : null;
  }
  const us = t.match(/^([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})/); // "Oct 16, 2026"
  if (us) {
    const mes = MESES[us[1].toLowerCase()];
    return mes ? `${us[3]}-${mes}-${us[2].padStart(2, "0")}` : null;
  }
  const br = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/); // "16/10/2026"
  if (br) return `${br[3]}-${br[2].padStart(2, "0")}-${br[1].padStart(2, "0")}`;
  return null;
}

/** "3 Adults, 1 Child" → { adultos: 3, criancas: 1 } */
export function hospedesHL(s: string) {
  const a = s.match(/(\d+)\s*adult/i);
  const c = s.match(/(\d+)\s*(child|crian|ni[nñ])/i);
  return { adultos: a ? Number(a[1]) : 2, criancas: c ? Number(c[1]) : 0 };
}

/** "MEZANINO MARESIAS,Unallocated" → "Mezanino Maresias"; "Suite  BOIÇUCANGA" → "Suíte Boiçucanga" */
export function quartoHL(s: string): string {
  const primeiro = s.split(",").map((x) => x.trim()).find((x) => x && !/^unallocated$/i.test(x)) ?? "";
  if (!primeiro) return "";
  const palavras = primeiro.toLowerCase().split(/\s+/).filter(Boolean)
    .map((p) => (p === "suite" ? "suíte" : p))
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1));
  return palavras.join(" ");
}

export const ehOta = (origem: string) => OTAS.some((o) => origem.toLowerCase().includes(o));

/** Lê o arquivo do Hotel Link em qualquer formato: .xls original (XML), ou aberto e salvo no Excel/Numbers (.xlsx/.numbers exportado). */
export function lerArquivoHotelLink(bytes: Uint8Array): { reservas: ReservaHL[]; erro?: string } {
  const comeco = new TextDecoder("utf-8").decode(bytes.slice(0, 400));
  const zip = bytes[0] === 0x50 && bytes[1] === 0x4b; // .xlsx (PK...)
  if (!zip && /<\?xml|<Workbook/i.test(comeco)) return lerExportacaoHotelLink(new TextDecoder("utf-8").decode(bytes));
  let linhas: string[][];
  try {
    const wb = XLSX.read(bytes, { type: "array", cellDates: false });
    const ws = wb.Sheets[wb.SheetNames[0]];
    linhas = (XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: "" }) as unknown[][]).map((r) => r.map((c) => String(c ?? "")));
  } catch {
    return { reservas: [], erro: "Não consegui abrir este arquivo. Use a planilha modelo do painel." };
  }
  // Caso comum: o .xls foi aberto no Numbers/Excel e o XML virou texto espalhado nas células
  const juntado = linhas.flat().filter(Boolean).join("\n");
  if (/<Workbook/i.test(juntado)) return lerExportacaoHotelLink(juntado);
  return lerTabela(linhas);
}

export function lerExportacaoHotelLink(conteudo: string): { reservas: ReservaHL[]; erro?: string } {
  if (!/<Workbook/i.test(conteudo) || !/<Row/i.test(conteudo))
    return { reservas: [], erro: "Este arquivo não parece uma lista de reservas." };
  const linhas = [...conteudo.matchAll(/<Row[^>]*>([\s\S]*?)<\/Row>/g)].map((m) =>
    [...m[1].matchAll(/<Data[^>]*>([\s\S]*?)<\/Data>/g)].map((d) => texto(d[1]))
  );
  return lerTabela(linhas);
}

function lerTabela(todas: string[][]): { reservas: ReservaHL[]; erro?: string } {
  // cabeçalhos em português, inglês ou espanhol (o sistema exporta no idioma configurado pelo hoteleiro)
  const n = (s: string) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
  const ehRef = (c: string) => /^(referencia|reference|booking reference|booking ref)\b/.test(n(c));
  const inicio = todas.findIndex((l) => l.some(ehRef));
  if (inicio < 0) return { reservas: [], erro: "Não encontrei as colunas da lista de reservas. Use a planilha modelo do painel." };
  const cab = todas[inicio].map(n);
  const linhas = todas.slice(inicio);
  const col = (...nomes: string[]) => {
    for (const nome of nomes.map(n)) { const k = cab.indexOf(nome); if (k >= 0) return k; } // nome exato primeiro
    for (const nome of nomes.map(n)) { const k = cab.findIndex((c) => c.startsWith(nome)); if (k >= 0) return k; }
    return -1;
  };
  const i = {
    ref: cab.findIndex(ehRef),
    ota: col("OTA Refer", "OTA Ref", "Channel Ref", "Referencia OTA", "Referencia del canal"),
    hospede: col("Hóspede", "Guest Name", "Guest", "Huésped", "Huesped", "Nombre del huésped"),
    tel: col("Número de Telefone", "Telefone", "Phone Number", "Phone", "Número de teléfono", "Teléfono"),
    origem: col("Origem", "Source", "Channel", "Origen", "Canal"),
    entrada: col("Check-in", "Check in", "Arrival", "Llegada", "Entrada"),
    saida: col("Check-out", "Check out", "Departure", "Salida", "Saída"),
    status: col("Status", "Estado", "Situação"),
    quarto: col("Nome/Número do Quarto", "Room Name/Number", "Room Name", "Room", "Nombre/Número de la habitación", "Habitación", "Quarto"),
    pessoas: col("Número Total de Hóspedes", "Total Number of Guests", "Total Guests", "Número total de huéspedes", "Guests", "Huéspedes"),
  };
  if (i.ref < 0 || i.hospede < 0 || i.entrada < 0 || i.saida < 0)
    return { reservas: [], erro: "Não encontrei as colunas de referência, hóspede e datas. Use a planilha modelo do painel." };

  const reservas: ReservaHL[] = [];
  for (const c of linhas.slice(1)) {
    const checkIn = dataHL(c[i.entrada] ?? "");
    const checkOut = dataHL(c[i.saida] ?? "");
    const referencia = (c[i.ref] ?? "").trim();
    if (!referencia || !checkIn || !checkOut) continue; // pula linhas de resumo e vazias
    const limpo = (v: string | undefined) => (v && v.trim() !== "-" ? v.trim() : "");
    reservas.push({
      referencia,
      otaReferencia: limpo(c[i.ota]),
      titular: limpo(c[i.hospede]).replace(/\s+/g, " "),
      telefone: limpo(c[i.tel]),
      origem: limpo(c[i.origem]),
      checkIn,
      checkOut,
      status: limpo(c[i.status]),
      quarto: quartoHL(c[i.quarto] ?? ""),
      ...hospedesHL(c[i.pessoas] ?? ""),
    });
  }
  if (!reservas.length) return { reservas, erro: "Não encontrei nenhuma reserva neste arquivo." };
  return { reservas };
}
