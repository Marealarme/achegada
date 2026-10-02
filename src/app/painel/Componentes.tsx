"use client";

import { useActionState, useState } from "react";
import { criarReserva } from "./actions";

type Unidade = { id: string; nome: string };

export function NovaReserva({ unidades }: { unidades: Unidade[] }) {
  const [aberto, setAberto] = useState(false);
  const [erro, acao, pendente] = useActionState(criarReserva, "");
  if (!aberto)
    return <button className="btn primary" type="button" onClick={() => setAberto(true)}>+ Nova reserva</button>;
  return (
    <form action={acao} className="newform" style={{ width: "100%" }}>
      <div className="field"><label htmlFor="titular">Nome do titular</label><input id="titular" name="titular" type="text" required /></div>
      <div className="grid2">
        <div className="field"><label htmlFor="telefone">WhatsApp</label><input id="telefone" name="telefone" type="tel" placeholder="(11) 90000-0000" /></div>
        <div className="field"><label htmlFor="unidade">Chalé</label>
          <select id="unidade" name="unidade">{unidades.map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}</select>
        </div>
      </div>
      <div className="grid2">
        <div className="field"><label htmlFor="check_in">Check-in</label><input id="check_in" name="check_in" type="date" required /></div>
        <div className="field"><label htmlFor="check_out">Check-out</label><input id="check_out" name="check_out" type="date" required /></div>
      </div>
      <div className="grid2">
        <div className="field"><label htmlFor="adultos">Adultos</label><input id="adultos" name="adultos" type="number" min={1} max={12} defaultValue={2} /></div>
        <div className="field"><label htmlFor="criancas">Crianças</label><input id="criancas" name="criancas" type="number" min={0} max={12} defaultValue={0} /></div>
      </div>
      {erro && <p className="err" role="alert">{erro}</p>}
      <div style={{ display: "flex", gap: 8 }}>
        <button className="btn" type="button" onClick={() => setAberto(false)}>Cancelar</button>
        <button className="btn primary" type="submit" disabled={pendente} style={{ flex: 1 }}>{pendente ? "Criando…" : "Criar reserva e gerar link"}</button>
      </div>
    </form>
  );
}

/** Abre o WhatsApp do colaborador com a mensagem pronta; ele só aperta enviar. */
export function BotoesMensagem({ mensagem, telefone }: { mensagem: string; telefone: string | null }) {
  const [copiado, setCopiado] = useState(false);
  let numero = (telefone ?? "").replace(/\D/g, "");
  if (numero && numero.length <= 11) numero = "55" + numero;
  const wa = `https://wa.me/${numero}?text=${encodeURIComponent(mensagem)}`;

  async function copiar() {
    try {
      await navigator.clipboard.writeText(mensagem);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      setCopiado(false);
    }
  }
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      <a className="btn primary" href={wa} target="_blank" rel="noopener noreferrer">Enviar no WhatsApp</a>
      <button className="btn" type="button" onClick={copiar}>{copiado ? "Copiado" : "Copiar mensagem"}</button>
    </div>
  );
}
