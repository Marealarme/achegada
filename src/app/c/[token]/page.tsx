import { cache } from "react";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { supabaseServico } from "@/lib/supabase";
import { dataCurta, noites } from "@/lib/util";
import CheckinFlow from "./CheckinFlow";
import AcoesFinais from "./AcoesFinais";
import { fnrhLigada } from "@/lib/fnrh/cliente";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Pousada = {
  id: string; nome: string; whatsapp: string | null; regras_da_casa: string | null; termo_pet: string | null;
  politica_cancelamento?: string | null; cidade?: string | null; logo_url?: string | null; endereco_mapa?: string | null;
  cafe_incluso?: boolean | null; aviso_early_late?: string | null;
};
type ReservaHospede = {
  id: string; titular: string; telefone: string | null; check_in: string; check_out: string; adultos: number; criancas: number;
  pousadas: Pousada; unidades: { nome: string } | null;
};

const CAMPOS_POUSADA = [
  "id, nome, whatsapp, regras_da_casa, termo_pet, politica_cancelamento, cidade, logo_url, endereco_mapa, cafe_incluso, aviso_early_late",
  "id, nome, whatsapp, regras_da_casa, termo_pet, politica_cancelamento", // antes da migração 0006
  "id, nome, whatsapp, regras_da_casa, termo_pet",                        // antes da migração 0003
];

/** Carrega a reserva pelo token (uma vez por pedido, usada pela página e pela prévia do link). */
const carregar = cache(async (token: string) => {
  if (!/^[a-f0-9]{24}$/.test(token)) return null;
  const db = supabaseServico();
  for (const campos of CAMPOS_POUSADA) {
    const sel: string = `id, titular, telefone, check_in, check_out, adultos, criancas, pousadas(${campos}), unidades(nome)`;
    const res = await db.from("reservas").select(sel).eq("token", token).maybeSingle();
    if (!res.error) return res.data as unknown as ReservaHospede | null;
  }
  return null;
});

const cidadeDe = (p: Pousada) => p.cidade?.trim() || "";

/** Prévia do link no WhatsApp: nome e logo da pousada. */
export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const r = await carregar((await params).token);
  const p = r?.pousadas;
  const nome = p?.nome ?? "Check-in online";
  const titulo = `Check-in online · ${nome}`;
  const descricao = `Faça seu check-in online e chegue direto para o descanso${p && cidadeDe(p) ? ` em ${cidadeDe(p)}` : ""}.`;
  const logo = p?.logo_url || null;
  const imagem = logo === "/logo-lua.png" ? { url: "/og-lua.png", width: 1200, height: 630 } : logo ? { url: logo } : null;
  return {
    title: { absolute: titulo },
    description: descricao,
    robots: { index: false, follow: false },
    icons: logo ? { icon: logo, apple: logo } : undefined,
    openGraph: { title: titulo, description: descricao, siteName: nome, locale: "pt_BR", type: "website", images: imagem ? [{ ...imagem, alt: nome }] : undefined },
  };
}

export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const r = await carregar(token);
  if (!r) notFound();

  const db = supabaseServico();
  const pousada = r.pousadas;
  const cidade = cidadeDe(pousada);
  const unidade = r.unidades?.nome ?? "Chalé";
  const expirado = Date.parse(r.check_out) + 2 * 864e5 < Date.now();
  const { data: pre } = await db.from("pre_chegadas").select("id").eq("reserva_id", r.id).maybeSingle();
  const linhas = (t: string | null | undefined) => (t ?? "").split("\n").map((x) => x.trim()).filter(Boolean);

  return (
    <main className="guest">
      <article className="phone">
        <header className={pousada.logo_url ? "hero com-logo" : "hero"}>
          {pousada.logo_url ? <img className="logo-hero" src={pousada.logo_url} alt="" width={64} height={64} /> : <span className="moon" aria-hidden="true" />}
          <small>{pousada.nome}{cidade ? ` · ${cidade}` : ""}</small>
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
            <p className="muted">A recepção já tem seus dados. Até breve{cidade ? ` em ${cidade}` : ""}!</p>
            <AcoesFinais pousada={pousada.endereco_mapa || `${pousada.nome} ${cidade}`.trim()} whatsapp={pousada.whatsapp} />
          </div>
        ) : (
          <CheckinFlow
            token={token}
            titular={r.titular}
            telefone={r.telefone}
            fnrhAutomatica={await fnrhLigada(pousada.id)}
            unidade={unidade}
            checkIn={r.check_in}
            checkOut={r.check_out}
            noites={noites(r.check_in, r.check_out)}
            adultos={r.adultos}
            criancas={r.criancas}
            regras={linhas(pousada.regras_da_casa)}
            termoPet={linhas(pousada.termo_pet)}
            cancelamento={linhas(pousada.politica_cancelamento)}
            pousada={pousada.endereco_mapa || `${pousada.nome} ${cidade}`.trim()}
            whatsapp={pousada.whatsapp}
            cafeIncluso={pousada.cafe_incluso ?? true}
            avisoEarlyLate={pousada.aviso_early_late ?? null}
          />
        )}
      </article>
      <p className="foot muted">Seus dados são usados para o seu registro de hospedagem, como exige a lei.</p>
    </main>
  );
}
