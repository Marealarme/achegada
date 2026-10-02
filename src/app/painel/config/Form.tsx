"use client";

import { useActionState } from "react";

type Acao = (anterior: string, f: FormData) => Promise<string>;

/** Formulário que mostra a resposta do servidor (salvo / erro) logo abaixo do botão. */
export default function Form({ action, botao, children, multipart }: { action: Acao; botao: string; children: React.ReactNode; multipart?: boolean }) {
  const [msg, acao, pendente] = useActionState(action, "");
  const ok = /^(Salvo|Logo|Chave|Acesso|\d+ salvo)/.test(msg);
  return (
    <form action={acao} className="secao" encType={multipart ? "multipart/form-data" : undefined}>
      {children}
      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <button className="btn primary" type="submit" disabled={pendente}>{pendente ? "Salvando…" : botao}</button>
        {msg && <span className={ok ? "ok" : "err"} role="status">{msg}</span>}
      </div>
    </form>
  );
}
