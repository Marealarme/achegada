import * as XLSX from "xlsx";
import { podeConfigurar, sessaoEquipe } from "@/lib/sessao";
import { supabaseServico } from "@/lib/supabase";
import { cpfFormatar } from "@/lib/util";
import { baixarArquivo } from "@/lib/notas/digisan";
import { chaveDigisan } from "@/lib/notas/chave";
import { linhasNotas, numeroReserva } from "@/lib/notas/linhas";
import { PDFS_POR_PARTE, ROTULO_STATUS, STATUS_PACOTE } from "@/lib/notas/status";
import { criarZip } from "@/lib/zip";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// /painel/notas/pacote?mes=AAAA-MM[&parte=N] — pacote do mês para a contabilidade (.zip):
//   planilha com todas as notas do mês (autorizadas e canceladas) + reservas ainda sem nota, PDFs das notas e um LEIA-ME.
// O mês é o da COMPETÊNCIA (= check-out). Até PDFS_POR_PARTE PDFs por arquivo (limite de tamanho do download no servidor).

type NotaPacote = {
  id: string; reserva_id: string; digisan_id: string | null; status: string; numero: string | null; codigo_verificacao: string | null;
  valor: number | null; competencia: string | null; autorizada_em: string | null; cancelada_em: string | null; cancelamento_motivo: string | null;
  reservas: {
    titular: string; check_in: string; check_out: string; origem: string | null; referencia_externa: string | null; ota_referencia: string | null;
    unidades: { nome: string } | null;
    hospedes_reserva: { papel: string; hospedes: { nome: string; cpf: string | null; passaporte: string | null; cidade: string | null; uf: string | null; pais_residencia: string | null } | null }[];
  } | null;
};

const dataBr = (iso: string | null | undefined) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "");
const dataHoraBr = (iso: string | null) => (iso ? new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "");
const centavos = (v: number) => Math.round(v * 100) / 100;
const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
const MESES = ["janeiro", "fevereiro", "marco", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

function planilha(dados: Record<string, unknown>[], vazio: string, colunasDinheiro: string[]) {
  const ws = XLSX.utils.json_to_sheet(dados.length ? dados : [{ Aviso: vazio }]);
  if (dados.length) {
    const cab = Object.keys(dados[0]);
    ws["!cols"] = cab.map((c) => ({ wch: Math.min(45, Math.max(c.length, ...dados.map((d) => String(d[c] ?? "").length)) + 2) }));
    ws["!autofilter"] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: dados.length, c: cab.length - 1 } }) };
    cab.forEach((c, i) => {
      if (!colunasDinheiro.includes(c)) return;
      for (let r = 1; r <= dados.length; r++) {
        const cel = ws[XLSX.utils.encode_cell({ r, c: i })];
        if (cel && typeof cel.v === "number") cel.z = '"R$" #,##0.00';
      }
    });
  }
  return ws;
}

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const s = await sessaoEquipe({ exigirAssinatura: true });
  if (!podeConfigurar(s)) return new Response("Só o dono ou a gerência.", { status: 403 });
  const mes = /^\d{4}-\d{2}$/.test(q.get("mes") ?? "") ? q.get("mes")! : new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 7);
  const [ano, m] = mes.split("-").map(Number);
  const ini = `${mes}-01`, fim = new Date(Date.UTC(ano, m, 0)).toISOString().slice(0, 10);

  const db = supabaseServico(); // filtrado pela pousada da sessão
  const [{ data: pous }, { data, error }] = await Promise.all([
    db.from("pousadas").select("nfse_config").eq("id", s.pousada.id).maybeSingle(),
    db.from("notas_fiscais")
      .select("id, reserva_id, digisan_id, status, numero, codigo_verificacao, valor, competencia, autorizada_em, cancelada_em, cancelamento_motivo, reservas(titular, check_in, check_out, origem, referencia_externa, ota_referencia, unidades(nome), hospedes_reserva(papel, hospedes(nome, cpf, passaporte, cidade, uf, pais_residencia)))")
      .eq("pousada_id", s.pousada.id).in("status", STATUS_PACOTE).gte("competencia", ini).lte("competencia", fim)
      .order("numero", { ascending: true }),
  ]);
  if (error) return new Response("Não foi possível montar o pacote. Tente de novo.", { status: 500 });
  const notas = ((data ?? []) as unknown as NotaPacote[]).sort((a, b) => Number(a.numero ?? 0) - Number(b.numero ?? 0));
  const aliquota = Number(((pous?.nfse_config as { servico?: { aliquotaIss?: number } } | null)?.servico?.aliquotaIss) ?? 0);

  const totalPartes = Math.max(1, Math.ceil(notas.length / PDFS_POR_PARTE));
  const parte = Math.min(totalPartes, Math.max(1, Number(q.get("parte")) || 1));
  const daParte = notas.slice((parte - 1) * PDFS_POR_PARTE, parte * PDFS_POR_PARTE);

  const nomePdf = (n: NotaPacote) => {
    const t = n.reservas?.hospedes_reserva.find((h) => h.papel === "titular")?.hospedes?.nome ?? n.reservas?.titular ?? "";
    return `NFSe-${String(n.numero ?? "sem-numero").padStart(5, "0")}-${semAcento(t)}${n.status === "autorizada" ? "" : "-CANCELADA"}.pdf`;
  };

  // ---------- planilha: todas as notas do mês ----------
  const linhas = notas.map((n) => {
    const r = n.reservas, h = r?.hospedes_reserva.find((x) => x.papel === "titular")?.hospedes ?? null;
    const valor = n.valor == null ? null : Number(n.valor);
    const cancelada = n.status !== "autorizada";
    return {
      "Nº da nota": n.numero ? Number(n.numero) : "",
      "Situação": ROTULO_STATUS[n.status] ?? n.status,
      "Emitida em": dataHoraBr(n.autorizada_em),
      "Competência": dataBr(n.competencia),
      "Código de verificação": n.codigo_verificacao ?? "",
      "Tomador": h?.nome ?? r?.titular ?? "",
      "CPF / Passaporte": h?.cpf ? cpfFormatar(h.cpf) : h?.passaporte ?? "",
      "Cidade / UF": h ? [h.cidade, h.uf].filter(Boolean).join(" / ") || (h.pais_residencia ?? "") : "",
      "Valor do serviço": valor ?? "",
      [`ISS (${String(aliquota).replace(".", ",")}%)`]: valor != null && !cancelada ? centavos((valor * aliquota) / 100) : "",
      "Nº da reserva": numeroReserva(r?.referencia_externa),
      "Canal": r?.origem ?? "",
      "Chalé": r?.unidades?.nome ?? "",
      "Check-in": dataBr(r?.check_in),
      "Check-out": dataBr(r?.check_out),
      "Cancelada em": dataHoraBr(n.cancelada_em),
      "Motivo do cancelamento": n.cancelamento_motivo ?? "",
      "Arquivo PDF": nomePdf(n),
      "Está no pacote": totalPartes > 1 ? `Parte ${Math.floor(notas.indexOf(n) / PDFS_POR_PARTE) + 1}` : "Sim",
    };
  });
  const autorizadas = notas.filter((n) => n.status === "autorizada");
  const totalValor = centavos(autorizadas.reduce((t, n) => t + Number(n.valor ?? 0), 0));
  const resumo = [
    { Item: "Mês de competência", Valor: `${MESES[m - 1]} de ${ano}` },
    { Item: "Notas autorizadas", Valor: autorizadas.length },
    { Item: "Notas canceladas", Valor: notas.length - autorizadas.length },
    { Item: "Valor total das notas autorizadas", Valor: totalValor },
    { Item: `ISS estimado (${String(aliquota).replace(".", ",")}%)`, Valor: centavos((totalValor * aliquota) / 100) },
    { Item: "Gerado em", Valor: dataHoraBr(new Date().toISOString()) },
  ];

  // ---------- reservas do mês ainda sem nota (para a contabilidade saber o que falta) ----------
  const comNota = new Set(notas.map((n) => n.reserva_id));
  const semNota = (await linhasNotas(db, s.pousada.id, ini, fim)).filter((l) => !comNota.has(l.reservaId)).map((l) => ({
    "Nº da reserva": l.numeroReserva,
    "Canal": l.canal,
    "Titular": l.titular,
    "Check-in": dataBr(l.checkIn),
    "Check-out": dataBr(l.checkOut),
    "Valor total": l.total ?? "",
    "Por que ainda não tem nota": l.pendencias.length ? l.pendencias.join(" / ") : "Não emitida ainda",
  }));

  const livro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(livro, planilha(resumo, "", ["Valor"]), "Resumo");
  const resumoWs = livro.Sheets["Resumo"];
  for (const r of [4, 5]) { const c = resumoWs[XLSX.utils.encode_cell({ r, c: 1 })]; if (c) c.z = '"R$" #,##0.00'; }
  XLSX.utils.book_append_sheet(livro, planilha(linhas, "Nenhuma nota emitida neste mês.", ["Valor do serviço", Object.keys(linhas[0] ?? {}).find((k) => k.startsWith("ISS")) ?? ""]), "Notas");
  XLSX.utils.book_append_sheet(livro, planilha(semNota, "Todas as reservas do mês já têm nota.", ["Valor total"]), "Reservas sem nota");
  const xlsx = XLSX.write(livro, { type: "buffer", bookType: "xlsx", compression: true }) as Buffer;

  // ---------- PDFs (5 de cada vez) ----------
  const chave = (await chaveDigisan(db, s.pousada.id))?.chave ?? null;
  const pdfs: { nome: string; dados: Uint8Array }[] = [];
  const faltaram: string[] = [];
  for (let i = 0; i < daParte.length; i += 5) {
    await Promise.all(daParte.slice(i, i + 5).map(async (n) => {
      const r = n.digisan_id ? await baixarArquivo(chave, n.digisan_id, "pdf") : null;
      if (r) pdfs.push({ nome: `PDFs/${nomePdf(n)}`, dados: new Uint8Array(await r.arrayBuffer()) });
      else faltaram.push(`Nota ${n.numero ?? "?"}`);
    }));
  }
  pdfs.sort((a, b) => a.nome.localeCompare(b.nome));

  const leiame = [
    `Pacote de notas fiscais (NFS-e) — ${MESES[m - 1]} de ${ano}${totalPartes > 1 ? ` — parte ${parte} de ${totalPartes}` : ""}`,
    `Prestador: CNPJ conforme cada nota. Gerado pelo A Chegada em ${dataHoraBr(new Date().toISOString())}.`,
    "",
    "Conteúdo:",
    `- notas-${mes}.xlsx: aba Resumo (totais), aba Notas (uma linha por nota, com nº da reserva, tomador, valor e ISS) e aba Reservas sem nota.`,
    `- PDFs/: ${pdfs.length} nota(s) em PDF${totalPartes > 1 ? ` (notas ${(parte - 1) * PDFS_POR_PARTE + 1} a ${Math.min(parte * PDFS_POR_PARTE, notas.length)} da planilha)` : ""}.`,
    "",
    "XML completo das notas: baixar no portal da prefeitura de São Sebastião (https://saosebastiao.iibr.com.br) com o acesso do prestador.",
    "O mês das notas é o da competência (= dia do check-out da reserva).",
    ...(faltaram.length ? ["", `ATENÇÃO: não foi possível baixar agora o PDF de: ${faltaram.join(", ")}. Gere o pacote de novo em alguns minutos.`] : []),
  ].join("\r\n");

  const zip = criarZip([
    { nome: `notas-${mes}.xlsx`, dados: new Uint8Array(xlsx) },
    { nome: "LEIA-ME.txt", dados: new Uint8Array(Buffer.from("﻿" + leiame, "utf8")) },
    ...pdfs,
  ]);
  const nome = `notas-fiscais-${s.pousada.slug}-${mes}${totalPartes > 1 ? `-parte-${parte}` : ""}.zip`;
  return new Response(new Uint8Array(zip), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${nome}"`,
      "Cache-Control": "private, max-age=60",
    },
  });
}
