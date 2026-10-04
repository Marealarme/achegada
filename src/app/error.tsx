"use client";

/** Tela amigável quando algo falha no navegador (por exemplo, o app foi atualizado com a página aberta). */
export default function Erro({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const codigo = error?.digest || (typeof window !== "undefined" ? window.location.pathname : "");
  return (
    <main className="wrap">
      <div className="panel login">
        <h1>Algo não carregou</h1>
        <p className="muted">O app pode ter sido atualizado enquanto esta página estava aberta, ou a conexão caiu.</p>
        {codigo && <p className="muted small">Código para o suporte: <span className="mono">{codigo}</span></p>}
        <button className="btn primary block" type="button" onClick={() => { reset(); window.location.reload(); }}>Recarregar</button>
      </div>
    </main>
  );
}
