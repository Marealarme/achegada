"use client";

import { useEffect, useState } from "react";

const norm = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Campo com lupa que filtra, enquanto digita, os itens [data-busca] dentro de #alvo (sem recarregar a página). */
export default function FiltroLista({ alvo, placeholder }: { alvo: string; placeholder: string }) {
  const [busca, setBusca] = useState("");
  const [contagem, setContagem] = useState<{ vis: number; total: number } | null>(null);

  useEffect(() => {
    const itens = Array.from(document.querySelectorAll<HTMLElement>(`#${alvo} [data-busca]`));
    const termo = norm(busca.trim());
    let vis = 0;
    for (const el of itens) {
      const ok = !termo || norm(el.dataset.busca ?? "").includes(termo);
      el.style.display = ok ? "" : "none";
      if (ok) vis++;
    }
    setContagem(termo ? { vis, total: itens.length } : null);
  }, [busca, alvo]);

  return (
    <div style={{ position: "relative", margin: "0 0 12px" }}>
      <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
        style={{ position: "absolute", left: 12, top: 22, transform: "translateY(-50%)", color: "var(--muted, #5B706D)" }}>
        <circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" />
      </svg>
      <input type="search" aria-label={placeholder} placeholder={placeholder} value={busca} onChange={(e) => setBusca(e.target.value)}
        style={{ width: "100%", paddingLeft: 38, minHeight: 44 }} />
      {contagem && <div className="muted small" style={{ marginTop: 4 }}>{contagem.vis === 0 ? `Nada encontrado para “${busca}”.` : `${contagem.vis} de ${contagem.total} reserva(s)`}</div>}
    </div>
  );
}
