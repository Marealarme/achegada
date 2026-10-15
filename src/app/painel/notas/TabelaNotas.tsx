"use client";

import { useState, useTransition } from "react";
import { atualizarStatus, cancelarNota, emitirNotas } from "./actions";

export type LinhaTela = {
  reservaId: string; numeroReserva: string; titular: string; checkIn: string; checkOut: string; chale: string; canal: string;
  total: number | null; pendencias: string[];
  nota: { id: string; status: string; numero: string | null; mensagem: string | null } | null;
};

const ROTULO: Record<string, { txt: string; cls: string }> = {
  enviando: { txt: "Processando", cls: "pre" }, processando: { txt: "Processando", cls: "pre" }, verificar: { txt: "Processando (conferindo)", cls: "wait" },
  autorizada: { txt: "Autorizada", cls: "ok" }, rejeitada: { txt: "Rejeitada", cls: "bad" }, cancelando: { txt: "Cancelando…", cls: "wait" }, cancelada: { txt: "Cancelada", cls: "link" },
};
const MOTIVOS = [{ c: 1, t: "Erro na emissão" }, { c: 2, t: "Serviço não prestado" }, { c: 4, t: "Duplicidade da nota" }, { c: 3, t: "Erro de assinatura" }, { c: 5, t: "Erro de processamento" }];
const reais = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dataBr = (iso: string) => iso.slice(8, 10) + "/" + iso.slice(5, 7);
const podeEmitirLinha = (l: LinhaTela) => !l.pendencias.length && (!l.nota || ["rejeitada", "cancelada"].includes(l.nota.status));

export default function TabelaNotas({ linhas, podeEmitir, faseTeste }: { linhas: LinhaTela[]; podeEmitir: boolean; faseTeste: boolean }) {
  const [confirmar, setConfirmar] = useState<LinhaTela[] | null>(null);
  const [cancelar, setCancelar] = useState<LinhaTela | null>(null);
  const [codigo, setCodigo] = useState(1);
  const [motivo, setMotivo] = useState("");
  const [msgs, setMsgs] = useState<string[]>([]);
  const [pendente, iniciar] = useTransition();

  const aptas = linhas.filter(podeEmitirLinha);
  const totalSel = (confirmar ?? []).reduce((s, l) => s + (l.total ?? 0), 0);
  const emAndamento = linhas.some((l) => l.nota && ["enviando", "processando", "verificar", "cancelando"].includes(l.nota.status));

  return (
    <>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "8px 0 12px" }}>
        <button className="btn primary" type="button" disabled={!podeEmitir || !aptas.length || faseTeste || pendente}
          title={faseTeste ? "Liberado depois da nota de teste" : undefined} onClick={() => setConfirmar(aptas)}>
          Emitir todas as OK ({aptas.length})
        </button>
        {emAndamento && <button className="btn" type="button" disabled={pendente} onClick={() => iniciar(() => atualizarStatus())}>{pendente ? "Atualizando…" : "Atualizar status"}</button>}
      </div>
      {msgs.length > 0 && <ul className="nf-msgs" role="status">{msgs.map((m, i) => <li key={i}>{m}</li>)}</ul>}

      <div className="nf-tabela-wrap">
        <table className="nf-tabela">
          <thead><tr><th>Reserva</th><th>Titular</th><th>Estadia</th><th className="num">Valor</th><th>Pendência</th><th>Status da nota</th><th>Nº da nota</th><th>Arquivos</th><th></th></tr></thead>
          <tbody>
            {linhas.length === 0 && <tr><td colSpan={9} className="muted">Nenhuma reserva com check-out neste mês.</td></tr>}
            {linhas.map((l) => {
              const st = l.nota ? ROTULO[l.nota.status] ?? { txt: l.nota.status, cls: "link" } : { txt: "Não emitida", cls: "link" };
              const comArquivo = l.nota && ["autorizada", "cancelada", "cancelando"].includes(l.nota.status);
              return (
                <tr key={l.reservaId}>
                  <td className="mono small">{l.numeroReserva || "—"}<div className="muted small">{l.canal}</div></td>
                  <td>{l.titular}<div className="muted small">{l.chale}</div></td>
                  <td className="small">{dataBr(l.checkIn)} → {dataBr(l.checkOut)}</td>
                  <td className="num">{l.total ? reais(l.total) : "—"}</td>
                  <td className="small">{l.pendencias.length ? <span className="err">{l.pendencias.join(" / ")}</span> : <span className="pill ok">OK</span>}</td>
                  <td className="small"><span className={`pill ${st.cls}`}>{st.txt}</span>
                    {l.nota?.mensagem && <div className={l.nota.status === "rejeitada" ? "err small" : "muted small"}>{l.nota.mensagem}</div>}</td>
                  <td className="mono small">{l.nota?.numero ?? ""}</td>
                  <td className="small">{comArquivo && <><a href={`/painel/notas/${l.nota!.id}/pdf`} target="_blank" rel="noopener noreferrer">PDF</a> · <a href={`/painel/notas/${l.nota!.id}/xml`}>XML</a></>}</td>
                  <td>
                    {podeEmitirLinha(l) && <button className="btn mini primary" type="button" disabled={!podeEmitir || pendente} onClick={() => setConfirmar([l])}>Emitir</button>}
                    {l.nota?.status === "autorizada" && <button className="btn mini ghost" type="button" disabled={pendente} onClick={() => { setCancelar(l); setCodigo(1); setMotivo(""); }}>Cancelar nota</button>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {confirmar && (
        <div className="nf-modal" role="dialog" aria-modal="true" aria-label="Confirmar emissão">
          <div className="nf-caixa">
            <h3>Emitir {confirmar.length} nota(s) fiscal(is)?</h3>
            <p className="muted small">Cada nota é real e vai para a prefeitura. Confira a lista e o total.</p>
            <ul className="nf-lista">
              {confirmar.map((l) => <li key={l.reservaId}><span>{l.titular} <span className="muted small">· {l.numeroReserva} · saída {dataBr(l.checkOut)}</span></span><b>{reais(l.total ?? 0)}</b></li>)}
            </ul>
            <p className="nf-total">Total: <b>{reais(totalSel)}</b></p>
            {confirmar.length > 25 && <p className="muted small">São emitidas até 25 por vez; clique de novo para as próximas.</p>}
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button className="btn" type="button" disabled={pendente} onClick={() => setConfirmar(null)}>Voltar</button>
              <button className="btn primary" type="button" disabled={pendente} onClick={() => iniciar(async () => {
                const r = await emitirNotas(confirmar.map((l) => l.reservaId));
                setMsgs(r.mensagens); setConfirmar(null);
              })}>{pendente ? "Emitindo…" : `Confirmar e emitir (${reais(totalSel)})`}</button>
            </div>
          </div>
        </div>
      )}

      {cancelar && (
        <div className="nf-modal" role="dialog" aria-modal="true" aria-label="Cancelar nota">
          <div className="nf-caixa">
            <h3>Cancelar a nota nº {cancelar.nota?.numero} de {cancelar.titular}?</h3>
            <p className="muted small">O cancelamento vai para a prefeitura e não pode ser desfeito.</p>
            <div className="field"><label htmlFor="nf-cod">Motivo</label>
              <select id="nf-cod" value={codigo} onChange={(e) => setCodigo(Number(e.target.value))}>{MOTIVOS.map((m) => <option key={m.c} value={m.c}>{m.t}</option>)}</select>
            </div>
            <div className="field"><label htmlFor="nf-mot">Descreva (mín. 15 letras)</label>
              <input id="nf-mot" value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={255} />
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button className="btn" type="button" disabled={pendente} onClick={() => setCancelar(null)}>Voltar</button>
              <button className="btn perigo" type="button" disabled={pendente || motivo.trim().length < 15} onClick={() => iniciar(async () => {
                const r = await cancelarNota(cancelar.nota!.id, codigo, motivo);
                setMsgs([r.mensagem]); setCancelar(null);
              })}>{pendente ? "Cancelando…" : "Sim, cancelar a nota"}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
