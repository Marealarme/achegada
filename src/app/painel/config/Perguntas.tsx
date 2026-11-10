"use client";

import { useActionState, useState } from "react";
import { SUGESTOES, TIPOS, temOpcoes, MAX_PERGUNTAS, type Pergunta, type TipoPergunta } from "@/lib/perguntas";

type Acao = (anterior: string, f: FormData) => Promise<string>;
type Edicao = Omit<Pergunta, "opcoes" | "max"> & { opcoes: string; max: string };

const novoId = () => `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
const paraEdicao = (p: Omit<Pergunta, "id"> & { id?: string }): Edicao => ({ ...p, id: p.id ?? novoId(), opcoes: p.opcoes.join("\n"), max: p.max ? String(p.max) : "" });

/** Editor das perguntas extras do check-in online. Erro ao salvar não apaga nada do que foi digitado. */
export default function Perguntas({ iniciais, action }: { iniciais: Pergunta[]; action: Acao }) {
  const [lista, setLista] = useState<Edicao[]>(() => iniciais.map(paraEdicao));
  const [msg, acao, pendente] = useActionState(action, "");
  const ok = msg.startsWith("Salvo");

  const mudar = (i: number, campo: keyof Edicao, valor: string | boolean) => setLista((l) => l.map((x, j) => (j === i ? { ...x, [campo]: valor } : x)));
  const mover = (i: number, d: number) => setLista((l) => { const n = [...l]; const [x] = n.splice(i, 1); n.splice(i + d, 0, x); return n; });
  const json = JSON.stringify(lista.map((x) => ({ ...x, opcoes: x.opcoes.split("\n"), max: Number(x.max) || null })));

  return (
    <form action={acao} className="secao">
      <input type="hidden" name="perguntas" value={json} />
      {lista.length === 0 && (
        <div className="note">
          <b>Nenhuma pergunta extra ainda</b>
          <span className="muted">Comece pelas mais usadas e ajuste do seu jeito.</span>
          <button className="btn" type="button" onClick={() => setLista(SUGESTOES.map(paraEdicao))}>Usar perguntas sugeridas</button>
        </div>
      )}
      {lista.map((x, i) => (
        <div className="card-g" key={x.id}>
          <div className="card-g-head">
            <b>Pergunta {i + 1}</b>
            <div style={{ display: "flex", gap: 4 }}>
              <button className="btn ghost" type="button" onClick={() => mover(i, -1)} disabled={i === 0} aria-label="Subir">↑</button>
              <button className="btn ghost" type="button" onClick={() => mover(i, 1)} disabled={i === lista.length - 1} aria-label="Descer">↓</button>
              <button className="btn ghost" type="button" onClick={() => setLista((l) => l.filter((_, j) => j !== i))}>Remover</button>
            </div>
          </div>
          <div className="field">
            <label htmlFor={`q-${x.id}`}>Pergunta</label>
            <input id={`q-${x.id}`} type="text" maxLength={200} value={x.texto} onChange={(e) => mudar(i, "texto", e.target.value)} placeholder="Ex.: Onde nos encontrou?" />
          </div>
          <div className="grid2">
            <div className="field">
              <label htmlFor={`t-${x.id}`}>Tipo de resposta</label>
              <select id={`t-${x.id}`} value={x.tipo} onChange={(e) => mudar(i, "tipo", e.target.value as TipoPergunta)}>
                {TIPOS.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor={`a-${x.id}`}>Dica abaixo da pergunta (opcional)</label>
              <input id={`a-${x.id}`} type="text" maxLength={200} value={x.ajuda} onChange={(e) => mudar(i, "ajuda", e.target.value)} />
            </div>
          </div>
          {temOpcoes(x.tipo) && (
            <div className="field">
              <label htmlFor={`o-${x.id}`}>Opções (uma por linha, pelo menos 2)</label>
              <textarea id={`o-${x.id}`} rows={4} value={x.opcoes} onChange={(e) => mudar(i, "opcoes", e.target.value)} />
            </div>
          )}
          {x.tipo === "multipla" && (
            <div className="field">
              <label htmlFor={`m-${x.id}`}>Máximo de opções que o hóspede pode marcar (vazio = sem limite)</label>
              <input id={`m-${x.id}`} type="number" min={1} max={30} value={x.max} onChange={(e) => mudar(i, "max", e.target.value)} />
            </div>
          )}
          <label className="check"><input type="checkbox" checked={x.obrigatoria} onChange={(e) => mudar(i, "obrigatoria", e.target.checked)} /><span>Resposta obrigatória</span></label>
        </div>
      ))}
      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        {lista.length < MAX_PERGUNTAS && (
          <button className="btn" type="button" onClick={() => setLista((l) => [...l, paraEdicao({ texto: "", tipo: "texto", obrigatoria: false, opcoes: [], max: null, ajuda: "" })])}>+ Adicionar pergunta</button>
        )}
        <button className="btn primary" type="submit" disabled={pendente}>{pendente ? "Salvando…" : "Salvar perguntas"}</button>
        {msg && <span className={ok ? "ok" : "err"} role="status">{msg}</span>}
      </div>
    </form>
  );
}
