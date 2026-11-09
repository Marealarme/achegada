import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ehAdmin, sessaoEquipe } from "@/lib/sessao";
import { supabaseServico } from "@/lib/supabase";
import Cabecalho from "../Cabecalho";

export const metadata: Metadata = { title: "Clientes" };
export const dynamic = "force-dynamic";

// Aba só do administrador do A Chegada: todas as pousadas cadastradas (lida com a chave de serviço, no servidor).

type Pousada = {
  id: string; nome: string; cidade: string | null; uf?: string | null; whatsapp: string | null; qtd_unidades: number | null;
  assinatura_status: string; teste_ate: string | null; created_at: string;
};
type Perfil = { user_id: string; pousada_id: string; nome: string; papel: string };

const dataBR = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "—");

function situacao(p: Pousada): { txt: string; cls: string } {
  switch (p.assinatura_status) {
    case "isenta": return { txt: "Isenta", cls: "pre" };
    case "trialing": return { txt: `Teste grátis até ${dataBR(p.teste_ate)}`, cls: "ok" };
    case "active": return { txt: "Ativa (pagando)", cls: "ok" };
    case "past_due": return { txt: "Pagamento pendente", cls: "bad" };
    case "canceled": case "unpaid": case "incomplete_expired": return { txt: "Cancelada", cls: "bad" };
    default: return { txt: "Sem cartão (não iniciou o teste)", cls: "link" };
  }
}

export default async function Clientes() {
  const s = await sessaoEquipe();
  if (!ehAdmin(s.email)) redirect("/painel");
  const db = supabaseServico();

  const { data: lista, error } = await db.from("pousadas")
    .select("id, nome, cidade, uf, whatsapp, qtd_unidades, assinatura_status, teste_ate, created_at").order("created_at", { ascending: false });
  const pousadas = (lista ?? []) as Pousada[];
  const ids = pousadas.map((p) => p.id);

  const [{ data: perfis }, { data: reservas }] = await Promise.all([
    db.from("perfis").select("user_id, pousada_id, nome, papel").in("pousada_id", ids.length ? ids : ["-"]),
    db.from("reservas").select("pousada_id, created_at, checkin_em").in("pousada_id", ids.length ? ids : ["-"]).limit(20000),
  ]);
  const donos = new Map<string, Perfil>();
  for (const pf of (perfis ?? []) as Perfil[]) if (pf.papel === "dono" && !donos.has(pf.pousada_id)) donos.set(pf.pousada_id, pf);
  const emails = new Map<string, string>();
  await Promise.all([...donos.values()].map(async (pf) => {
    const { data } = await db.auth.admin.getUserById(pf.user_id);
    if (data.user?.email) emails.set(pf.user_id, data.user.email);
  }));
  const uso = new Map<string, { reservas: number; checkins: number; ultima: string | null }>();
  for (const r of (reservas ?? []) as { pousada_id: string; created_at: string; checkin_em: string | null }[]) {
    const u = uso.get(r.pousada_id) ?? { reservas: 0, checkins: 0, ultima: null };
    u.reservas++; if (r.checkin_em) u.checkins++;
    if (!u.ultima || r.created_at > u.ultima) u.ultima = r.created_at;
    uso.set(r.pousada_id, u);
  }

  const conta = (f: (p: Pousada) => boolean) => pousadas.filter(f).length;
  const resumo = [
    ["Cadastradas", pousadas.length],
    ["Em teste", conta((p) => p.assinatura_status === "trialing")],
    ["Pagando", conta((p) => p.assinatura_status === "active")],
    ["Sem cartão", conta((p) => !["isenta", "trialing", "active", "past_due", "canceled", "unpaid", "incomplete_expired"].includes(p.assinatura_status))],
  ] as const;

  return (
    <main className="wrap">
      <Cabecalho s={s} atual="clientes" />
      <div className="desk unica">
        <section className="panel">
          <div className="panel-head"><h2>Clientes do A Chegada</h2></div>
          <p className="muted small">Todas as pousadas cadastradas, da mais nova para a mais antiga. Só administradores veem esta aba.</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 8, margin: "12px 0" }}>
            {resumo.map(([rot, n]) => (
              <div key={rot} className="card-g" style={{ padding: 12, gap: 2 }}>
                <div className="muted small">{rot}</div>
                <div style={{ fontSize: "1.6rem", fontWeight: 700 }}>{n}</div>
              </div>
            ))}
          </div>
          {error && <p className="aviso erro">Não foi possível carregar as pousadas agora.</p>}
          <ul className="historico">
            {pousadas.map((p) => {
              const st = situacao(p);
              const dono = donos.get(p.id);
              const email = dono ? emails.get(dono.user_id) : undefined;
              const fone = (p.whatsapp ?? "").replace(/\D/g, "");
              const u = uso.get(p.id) ?? { reservas: 0, checkins: 0, ultima: null };
              return (
                <li key={p.id}>
                  <div className="historico-item">
                    <div className="historico-topo" style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                      <b>{p.nome}</b>
                      <span className={`pill ${st.cls}`}>{st.txt}</span>
                    </div>
                    <div className="muted small">
                      {p.cidade ?? "—"}{p.uf ? ` – ${p.uf}` : ""} · {p.qtd_unidades ?? "?"} chalés/quartos · cadastro em {dataBR(p.created_at)}
                    </div>
                    <div className="small">
                      {dono?.nome ?? "—"}{email ? <> · <a href={`mailto:${email}`}>{email}</a></> : null}
                      {fone ? <> · <a href={`https://wa.me/${fone.startsWith("55") ? fone : "55" + fone}`} target="_blank" rel="noopener">WhatsApp {fone}</a></> : null}
                    </div>
                    <div className="muted small">
                      Uso: {u.reservas} reserva(s) · {u.checkins} check-in(s){u.ultima ? ` · última reserva criada em ${dataBR(u.ultima)}` : ""}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      </div>
    </main>
  );
}
