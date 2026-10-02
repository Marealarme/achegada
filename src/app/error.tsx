"use client";

/** Tela amigável quando algo falha no navegador (por exemplo, o app foi atualizado com a página aberta). */
export default function Erro({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="wrap">
      <div className="panel login">
        <h1>Algo não carregou</h1>
        <p className="muted">O app pode ter sido atualizado enquanto esta página estava aberta, ou a conexão caiu.</p>
        <button className="btn primary block" type="button" onClick={() => { reset(); window.location.reload(); }}>Recarregar</button>
      </div>
    </main>
  );
}
