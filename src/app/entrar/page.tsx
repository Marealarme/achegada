"use client";

import { useActionState } from "react";
import { entrar } from "./actions";

export default function Entrar() {
  const [erro, acao, pendente] = useActionState(entrar, "");
  return (
    <main className="wrap">
      <form action={acao} className="panel login">
        <div>
          <span className="label">Chegada</span>
          <h1>Entrar no painel</h1>
        </div>
        <div className="field">
          <label htmlFor="email">E-mail</label>
          <input id="email" name="email" type="email" autoComplete="email" required />
        </div>
        <div className="field">
          <label htmlFor="senha">Senha</label>
          <input id="senha" name="senha" type="password" autoComplete="current-password" required />
        </div>
        {erro && <p className="err" role="alert">{erro}</p>}
        <button className="btn primary block" type="submit" disabled={pendente}>{pendente ? "Entrando…" : "Entrar"}</button>
      </form>
    </main>
  );
}
