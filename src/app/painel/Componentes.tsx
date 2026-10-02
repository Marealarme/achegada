"use client";

import { useActionState, useState } from "react";
import { criarReserva, importarReservas, marcarLinkEnviado } from "./actions";

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

/** Abre o WhatsApp do colaborador com a mensagem pronta; ele só aperta enviar. Registra o envio no card. */
export function BotoesMensagem({ reservaId, mensagem, telefone }: { reservaId: string; mensagem: string; telefone: string | null }) {
  const [copiado, setCopiado] = useState(false);
  let numero = (telefone ?? "").replace(/\D/g, "");
  if (numero && numero.length <= 11) numero = "55" + numero;
  const wa = `https://wa.me/${numero}?text=${encodeURIComponent(mensagem)}`;
  const registrar = () => { marcarLinkEnviado(reservaId).catch(() => {}); };

  async function copiar() {
    try {
      await navigator.clipboard.writeText(mensagem);
      setCopiado(true);
      registrar();
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      setCopiado(false);
    }
  }
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      <a className="btn primary" href={wa} target="_blank" rel="noopener noreferrer" onClick={registrar}>Enviar no WhatsApp</a>
      <button className="btn" type="button" onClick={copiar}>{copiado ? "Copiado" : "Copiar mensagem"}</button>
    </div>
  );
}

/** Importa a planilha de reservas (modelo do A Chegada ou exportação do sistema) e cria os cards. */
export function ImportarReservas() {
  const [aberto, setAberto] = useState(false);
  const [res, acao, pendente] = useActionState(importarReservas, null);
  if (!aberto)
    return <button className="btn" type="button" onClick={() => setAberto(true)}>Importar reservas</button>;
  return (
    <form action={acao} className="newform" style={{ width: "100%" }}>
      <div className="field">
        <label htmlFor="arquivo">Planilha de reservas</label>
        <input id="arquivo" name="arquivo" type="file" required />
        <span className="hint">Use a <a href="/painel/modelo-reservas" download>planilha modelo</a>: baixe, preencha uma linha por reserva e envie aqui (.xlsx ou .csv). Também aceita a lista exportada de alguns sistemas de reservas. Reservas já importadas não duplicam.</span>
      </div>
      {res && <p className={res.ok ? "" : "err"} role="status">{res.mensagem}</p>}
      {res?.detalhes && res.detalhes.length > 0 && (
        <ul className="muted small" style={{ margin: 0, paddingLeft: 18 }}>{res.detalhes.map((d) => <li key={d}>{d}</li>)}</ul>
      )}
      <div style={{ display: "flex", gap: 8 }}>
        <button className="btn" type="button" onClick={() => setAberto(false)}>Fechar</button>
        <button className="btn primary" type="submit" disabled={pendente} style={{ flex: 1 }}>{pendente ? "Importando…" : "Importar reservas"}</button>
      </div>
    </form>
  );
}
