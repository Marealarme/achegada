"use client";

import { useState } from "react";
import * as XLSX from "xlsx";

type Item = { nome: string; ok: boolean; msg: string };

/** Converte no próprio navegador: o arquivo não sai do computador. */
export default function Conversor() {
  const [itens, setItens] = useState<Item[]>([]);
  const [ocupado, setOcupado] = useState(false);

  async function converter(arquivos: FileList | null) {
    if (!arquivos?.length) return;
    setOcupado(true);
    const novos: Item[] = [];
    for (const f of Array.from(arquivos)) {
      try {
        const wb = XLSX.read(new Uint8Array(await f.arrayBuffer()), { type: "array", cellDates: true });
        const linhas = wb.SheetNames.reduce((n, s) => n + (XLSX.utils.sheet_to_json(wb.Sheets[s], { header: 1 }) as unknown[]).length, 0);
        if (!linhas) throw new Error("vazio");
        const nome = f.name.replace(/\.(xls|xml|csv|xlsx|ods)$/i, "") + ".xlsx";
        XLSX.writeFile(wb, nome, { bookType: "xlsx", compression: true });
        novos.push({ nome, ok: true, msg: `${linhas} linha(s) convertidas. O arquivo foi para a pasta Downloads.` });
      } catch {
        novos.push({ nome: f.name, ok: false, msg: "Não consegui ler este arquivo. Confira se é uma planilha (.xls, .xml ou .csv)." });
      }
    }
    setItens((a) => [...novos, ...a]);
    setOcupado(false);
  }

  return (
    <div className="newform" style={{ display: "grid", gap: 12 }}>
      <div className="field">
        <label htmlFor="planilhas">Escolha a planilha (pode escolher várias)</label>
        <input id="planilhas" type="file" multiple accept=".xls,.xlsx,.csv,.xml,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv,text/xml,application/xml" onChange={(e) => { converter(e.target.files); e.target.value = ""; }} disabled={ocupado} />
        <span className="hint">Funciona com relatórios que abrem como “código” no Numbers (planilha XML 2003, .xls antigo) e com .csv. A conversão acontece no seu navegador: o arquivo não é enviado para lugar nenhum.</span>
      </div>
      {ocupado && <p className="muted small">Convertendo…</p>}
      {itens.map((i, n) => (
        <p key={n} className={i.ok ? "ok" : "err"}><b>{i.nome}</b>: {i.msg}</p>
      ))}
    </div>
  );
}
