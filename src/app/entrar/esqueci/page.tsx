"use client";

import { useActionState } from "react";
import { pedirNovaSenha } from "../actions";

export default function Esqueci() {
  const [res, acao, pendente] = useActionState(pedirNovaSenha, "");
  return (
    <main className="wrap">
      <form action={acao} className="panel login">
        <div>
          <span className="label">A Chegada</span>
          <h1>Esqueci minha senha</h1>
          <p className="muted small">Informe o e-mail da sua conta. Vamos mandar um link para você criar uma senha nova.</p>
        </div>
        {res === "ok" ? (
          <p className="ok">Pronto! Se este e-mail tiver conta no A Chegada, o link chega em alguns minutos. Confira também a caixa de spam.</p>
        ) : (
          <>
            <div className="field">
              <label htmlFor="email">E-mail</label>
              <input id="email" name="email" type="email" autoComplete="email" required />
            </div>
            {res.startsWith("erro:") && <p className="err" role="alert">{res.slice(5)}</p>}
            <button className="btn primary block" type="submit" disabled={pendente}>{pendente ? "Enviando…" : "Enviar link"}</button>
          </>
        )}
        <p className="muted small"><a href="/entrar">Voltar para o login</a></p>
      </form>
    </main>
  );
}
