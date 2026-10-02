import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { supabaseServico } from "@/lib/supabase";
import { dataCurta, noites } from "@/lib/util";
import CheckinFlow from "./CheckinFlow";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Check-in online", robots: { index: false, follow: false } };

export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[a-f0-9]{24}$/.test(token)) notFound();

  const db = supabaseServico();
  const buscar = (camposPousada: string) =>
    db
      .from("reservas")
      .select(`id, titular, check_in, check_out, adultos, criancas, pousadas(${camposPousada}), unidades(nome)`)
      .eq("token", token)
      .maybeSingle();
  // se a migração 0003 ainda não rodou, a coluna politica_cancelamento não existe: busca sem ela
  let consulta = await buscar("nome, regras_da_casa, termo_pet, politica_cancelamento");
  if (consulta.error) consulta = await buscar("nome, regras_da_casa, termo_pet");
  const r = consulta.data;
  if (!r) notFound();

  const pousada = r.pousadas as unknown as { nome: string; regras_da_casa: string | null; termo_pet: string | null; politica_cancelamento?: string | null };
  const unidade = (r.unidades as unknown as { nome: string } | null)?.nome ?? "Chalé";
  const expirado = Date.parse(r.check_out) + 2 * 864e5 < Date.now();
  const { data: pre } = await db.from("pre_chegadas").select("id").eq("reserva_id", r.id).maybeSingle();

  return (
    <main className="guest">
      <article className="phone">
        <header className="hero">
          <span className="moon" aria-hidden="true" />
          <small>{pousada.nome} · Maresias</small>
          <h1>{pre ? "Tudo pronto" : "Check-in online"}</h1>
          <p>
            {unidade} · {dataCurta(r.check_in)} a {dataCurta(r.check_out)}
          </p>
        </header>
        {expirado ? (
          <div className="body">
            <p>Este link expirou. Se precisar de algo, fale com a recepção pelo WhatsApp.</p>
          </div>
        ) : pre ? (
          <div className="body done">
            <div className="badge-ok" aria-hidden="true">✓</div>
            <h2>Seu check-in online já foi feito</h2>
            <p className="muted">A recepção já tem seus dados. Até breve em Maresias!</p>
          </div>
        ) : (
          <CheckinFlow
            token={token}
            titular={r.titular}
            unidade={unidade}
            checkIn={r.check_in}
            checkOut={r.check_out}
            noites={noites(r.check_in, r.check_out)}
            adultos={r.adultos}
            criancas={r.criancas}
            regras={(pousada.regras_da_casa ?? "").split("\n").filter(Boolean)}
            termoPet={(pousada.termo_pet ?? "").split("\n").filter(Boolean)}
            cancelamento={(pousada.politica_cancelamento ?? "").split("\n").filter(Boolean)}
          />
        )}
      </article>
      <p className="foot muted">Seus dados são usados para o seu registro de hospedagem, como exige a lei.</p>
    </main>
  );
}
