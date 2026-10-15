// Status da nota no A Chegada (o que a equipe vê).
export const ROTULO_STATUS: Record<string, string> = {
  enviando: "Processando",
  processando: "Processando",
  verificar: "Processando (conferindo)",
  autorizada: "Autorizada",
  rejeitada: "Rejeitada",
  cancelando: "Cancelamento em andamento",
  cancelada: "Cancelada",
};
/** Estes status contam como "já tem nota": não pode emitir de novo. */
export const ATIVOS = ["enviando", "processando", "verificar", "autorizada", "cancelando"];

/** Pacote do mês para a contabilidade: notas que entram e quantos PDFs por arquivo .zip. */
export const STATUS_PACOTE = ["autorizada", "cancelando", "cancelada"];
export const PDFS_POR_PARTE = 40;
