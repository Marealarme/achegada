import * as XLSX from "xlsx";
import { COLUNAS_MODELO } from "@/lib/importacao";

export const dynamic = "force-static";

// Planilha modelo para o cliente preencher as reservas e importar no painel.
export function GET() {
  const exemplos = [
    ["R-1001", "Maria da Silva", "11 98765-4321", "17/10/2026", "19/10/2026", 2, 1, "Chalé 1", "Direto", "", "Confirmada"],
    ["", "João Souza", "21 99876-5432", "24/10/2026", "26/10/2026", 2, 0, "Suíte 3", "Booking", "4512367890", "Confirmada"],
  ];
  const planilha = XLSX.utils.aoa_to_sheet([[...COLUNAS_MODELO], ...exemplos]);
  planilha["!cols"] = [16, 26, 16, 12, 12, 9, 9, 18, 12, 16, 12].map((wch) => ({ wch }));

  const instrucoes = XLSX.utils.aoa_to_sheet([
    ["Como preencher"],
    [""],
    ["1. Uma linha por reserva. Apague as duas linhas de exemplo antes de enviar."],
    ["2. Obrigatórios: Nome do titular, Check-in e Check-out (formato dia/mês/ano, ex.: 17/10/2026)."],
    ["3. WhatsApp: com DDD. É para onde o link do check-in será enviado."],
    ["4. Chalé ou quarto: use sempre o mesmo nome. Chalés novos são criados sozinhos no painel."],
    ["5. Código da reserva (opcional): o número do seu sistema. Evita duplicar a reserva se você importar de novo."],
    ["6. Canal (opcional): Direto, Booking, Airbnb… Se for de site de reservas, preencha também o Código no canal."],
    ["7. Situação: Confirmada ou Cancelada. Reservas canceladas que já estavam no painel são canceladas lá também."],
    [""],
    ["No painel: Reservas → Importar reservas → escolha este arquivo."],
  ]);
  instrucoes["!cols"] = [{ wch: 110 }];

  const livro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(livro, planilha, "Reservas");
  XLSX.utils.book_append_sheet(livro, instrucoes, "Como preencher");
  const arquivo = XLSX.write(livro, { type: "buffer", bookType: "xlsx" }) as Buffer;
  return new Response(new Uint8Array(arquivo), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="planilha-reservas-a-chegada.xlsx"',
    },
  });
}
