"use client";

import { useActionState } from "react";
import { salvarNovaSenha } from "../entrar/actions";

export default function NovaSenha() {
  const [erro, acao, pendente] = useActionState(salvarNovaSenha, "");
  return (
    <main className="wrap">
      <form action={acao} className="panel login">
        <div>
          <span className="label">A Chegada</span>
          <h1>Criar nova senha</h1>
          <p className="muted small">Use pelo menos 8 caracteres. Evite datas e nomes fáceis de adivinhar.</p>
        </div>
        <div className="field">
          <label htmlFor="senha">Nova senha</label>
          <input id="senha" name="senha" type="password" autoComplete="new-password" minLength={8} required />
        </div>
        <div className="field">
          <label htmlFor="confirma">Repita a nova senha</label>
          <input id="confirma" name="confirma" type="password" autoComplete="new-password" minLength={8} required />
        </div>
        {erro && <p className="err" role="alert">{erro}</p>}
        <button className="btn primary block" type="submit" disabled={pendente}>{pendente ? "Salvando…" : "Salvar nova senha"}</button>
        <p className="muted small"><a href="/painel">Voltar ao painel</a></p>
      </form>
    </main>
  );
}
