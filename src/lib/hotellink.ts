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
  jul: "07", aug: "08", ago: "08", sep: "09", set: "09", oct: "10", out: "10", nov: "11", dec: "12", dez: "12",
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
  const m = s.trim().match(/^(\d{1,2})\s+([A-Za-zçÇ]{3})[a-zç]*\.?\s+(\d{4})/);
  if (!m) return null;
  const mes = MESES[m[2].toLowerCase()];
  return mes ? `${m[3]}-${mes}-${m[1].padStart(2, "0")}` : null;
}

/** "3 Adults, 1 Child" → { adultos: 3, criancas: 1 } */
export function hospedesHL(s: string) {
  const a = s.match(/(\d+)\s*adult/i);
  const c = s.match(/(\d+)\s*(child|crian)/i);
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

export function lerExportacaoHotelLink(conteudo: string): { reservas: ReservaHL[]; erro?: string } {
  if (!/<Workbook/i.test(conteudo) || !/<Row/i.test(conteudo))
    return { reservas: [], erro: "Este arquivo não parece a exportação de reservas do Hotel Link. Exporte de novo e envie sem abrir no Excel." };
  const linhas = [...conteudo.matchAll(/<Row[^>]*>([\s\S]*?)<\/Row>/g)].map((m) =>
    [...m[1].matchAll(/<Data[^>]*>([\s\S]*?)<\/Data>/g)].map((d) => texto(d[1]))
  );
  const cab = linhas[0] ?? [];
  const col = (nome: string) => cab.findIndex((c) => c.toLowerCase().startsWith(nome.toLowerCase()));
  const i = {
    ref: col("Referência"), ota: col("OTA Refer"), hospede: col("Hóspede"), tel: col("Número de Telefone"), origem: col("Origem"),
    entrada: col("Check-in"), saida: col("Check-out"), status: col("Status"), quarto: col("Nome/Número do Quarto"), pessoas: col("Número Total de Hóspedes"),
  };
  if (i.ref < 0 || i.hospede < 0 || i.entrada < 0 || i.saida < 0)
    return { reservas: [], erro: "Não encontrei as colunas de referência, hóspede e datas. Confira se é a lista de reservas do Hotel Link." };

  const reservas: ReservaHL[] = [];
  for (const c of linhas.slice(1)) {
    if (c.length < cab.length - 2) continue; // linhas de resumo no fim do arquivo
    const checkIn = dataHL(c[i.entrada] ?? "");
    const checkOut = dataHL(c[i.saida] ?? "");
    const referencia = (c[i.ref] ?? "").trim();
    if (!referencia || !checkIn || !checkOut) continue;
    const limpo = (v: string | undefined) => (v && v !== "-" ? v.trim() : "");
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
  return { reservas };
}
