import type { Metadata } from "next";
import { sessaoEquipe } from "@/lib/sessao";
import Cabecalho from "../Cabecalho";
import Conversor from "./Conversor";

export const metadata: Metadata = { title: "Converter planilha" };
export const dynamic = "force-dynamic";

export default async function Converter() {
  const s = await sessaoEquipe({ exigirAssinatura: true });
  return (
    <main className="wrap">
      <Cabecalho s={s} atual="converter" />
      <div className="desk unica">
        <section className="panel">
          <h2>Converter planilha para Excel / Numbers</h2>
          <p className="muted small">Alguns sistemas de reservas exportam relatórios num formato antigo do Excel, que o Numbers não abre. Escolha o arquivo e baixe uma versão .xlsx, que abre no Numbers, no Excel e no Google Planilhas.</p>
          <Conversor />
        </section>
      </div>
    </main>
  );
}
