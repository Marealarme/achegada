import type { Metadata } from "next";
import { sessaoEquipe } from "@/lib/sessao";
import { cpfMascarado, dataCurta, noites } from "@/lib/util";
import Cabecalho from "../Cabecalho";

export const metadata: Metadata = { title: "Histórico" };
export const dynamic = "force-dynamic";

type Hospede = { nome: string | null; cpf: string | null; cidade: string | null; uf: string | null };
type Estadia = {
  id: string; titular: string; check_in: string; check_out: string; adultos: number; criancas: number; origem: string | null;
  cancelada_em: string | null; checkin_em: string | null; checkout_em: string | null; fnrh_status: string | null;
  unidades: { nome: string } | null;
  hospedes_reserva: { papel: string; hospedes: Hospede | null }[];
};

const CAMPOS = "id, titular, check_in, check_out, adultos, criancas, origem, cancelada_em, checkin_em, checkout_em, fnrh_status, unidades(nome), hospedes_reserva(papel, hospedes(nome, cpf, cidade, uf))";
const ano = (iso: string) => iso.slice(0, 4);

function situacao(r: Estadia): { txt: string; cls: string } {
  if (r.cancelada_em) return { txt: "Cancelada", cls: "bad" };
  if (r.checkout_em) return { txt: "Saiu", cls: "ok" };
  if (r.checkin_em) return { txt: "Chegou", cls: "ok" };
  if (r.fnrh_status === "enviado") return { txt: "Ficha enviada", cls: "pre" };
  return { txt: "Sem check-in", cls: "link" };
}

export default async function Historico({ searchParams }: { searchParams: Promise<{ q?: string; de?: string; ate?: string }> }) {
  const s = await sessaoEquipe({ exigirAssinatura: true });
  const { db } = s;
  const { q = "", de = "", ate = "" } = await searchParams;
  const busca = q.trim().slice(0, 60);
  const data = (v: string) => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? v : "");
  const desde = data(de), ateData = data(ate);

  // quem bate com a busca: titular da reserva OU qualquer hóspede (nome, CPF ou telefone)
  let ids: string[] | null = null;
  if (busca) {
    const digitos = busca.replace(/\D/g, "");
    const termo = `%${busca.replace(/[%_,()]/g, " ")}%`;
    const filtroHosp = digitos.length >= 4 ? `nome.ilike.${termo},cpf.ilike.%${digitos}%,telefone.ilike.%${digitos}%` : `nome.ilike.${termo}`;
    const [{ data: porTitular }, { data: hosp }] = await Promise.all([
      db.from("reservas").select("id").ilike("titular", termo).limit(300),
      db.from("hospedes").select("hospedes_reserva(reserva_id)").or(filtroHosp).limit(300),
    ]);
    const viaHospede = (hosp ?? []).flatMap((h) => ((h as { hospedes_reserva: { reserva_id: string }[] }).hospedes_reserva ?? []).map((x) => x.reserva_id));
    ids = [...new Set([...(porTitular ?? []).map((r) => r.id as string), ...viaHospede])];
  }

  let consulta = db.from("reservas").select(CAMPOS).order("check_in", { ascending: false }).limit(150);
  if (ids) consulta = consulta.in("id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);
  if (desde) consulta = consulta.gte("check_out", desde);
  if (ateData) consulta = consulta.lte("check_in", ateData);
  const { data: lista, error } = await consulta;
  const estadias = (lista ?? []) as unknown as Estadia[];

  // quantas vezes cada hóspede (pelo CPF) aparece no resultado
  const visitas = new Map<string, number>();
  for (const r of estadias) if (!r.cancelada_em)
    for (const hr of r.hospedes_reserva) { const c = hr.hospedes?.cpf; if (c) visitas.set(c, (visitas.get(c) ?? 0) + 1); }

  let anoAtual = "";
  return (
    <main className="wrap">
      <Cabecalho s={s} atual="historico" />
      <div className="desk unica">
        <section className="panel">
          <div className="panel-head"><h2>Histórico de hóspedes</h2></div>
          <form className="historico-busca" method="get">
            <div className="field" style={{ flex: 2, minWidth: 200 }}>
              <label htmlFor="q">Buscar</label>
              <input id="q" name="q" defaultValue={busca} placeholder="Nome, CPF ou telefone" autoComplete="off" />
            </div>
            <div className="field" style={{ flex: 1, minWidth: 140 }}>
              <label htmlFor="de">de</label>
              <input id="de" name="de" type="date" defaultValue={desde} />
            </div>
            <div className="field" style={{ flex: 1, minWidth: 140 }}>
              <label htmlFor="ate">até</label>
              <input id="ate" name="ate" type="date" defaultValue={ateData} />
            </div>
            <button className="btn primary" type="submit">Buscar</button>
          </form>
          <p className="muted small">
            {error ? "Não foi possível carregar o histórico agora." :
              `${estadias.length} estadia(s)${busca ? ` para “${busca}”` : ""}${estadias.length === 150 ? " (mostrando as 150 mais recentes; refine a busca)" : ""}. Para a planilha completa, use “Baixar hóspedes (Excel)” em Reservas.`}
          </p>

          {estadias.length === 0 && !error && <p className="muted">Nenhuma estadia encontrada.</p>}
          <ul className="historico">
            {estadias.map((r) => {
              const st = situacao(r);
              const cabecalhoAno = ano(r.check_in) !== anoAtual ? (anoAtual = ano(r.check_in)) : null;
              const pessoas = r.hospedes_reserva.filter((hr) => hr.hospedes?.nome)
                .sort((a, b) => (a.papel === "titular" ? -1 : b.papel === "titular" ? 1 : 0));
              return (
                <li key={r.id}>
                  {cabecalhoAno && <h3 className="historico-ano">{cabecalhoAno}</h3>}
                  <div className="historico-item">
                    <div className="historico-topo">
                      <b>{r.titular}</b>
                      <span className={`pill ${st.cls}`}>{st.txt}</span>
                    </div>
                    <span className="muted small">
                      {dataCurta(r.check_in)} → {dataCurta(r.check_out)} · {noites(r.check_in, r.check_out)} noite(s)
                      {r.unidades?.nome ? ` · ${r.unidades.nome}` : ""} · {r.adultos + r.criancas} hósp.{r.origem ? ` · ${r.origem}` : ""}
                    </span>
                    {pessoas.length > 0 && (
                      <ul className="historico-pessoas small">
                        {pessoas.map((hr, k) => {
                          const h = hr.hospedes!;
                          const n = h.cpf ? visitas.get(h.cpf) ?? 0 : 0;
                          return (
                            <li key={k}>
                              {h.nome}
                              <span className="muted">
                                {h.cpf ? ` · CPF ${cpfMascarado(h.cpf)}` : ""}{h.cidade ? ` · ${h.cidade}${h.uf ? `/${h.uf}` : ""}` : ""}
                              </span>
                              {n > 1 && <span className="pill pre" style={{ marginLeft: 6 }}>{n} estadias</span>}
                            </li>
                          );
                        })}
                      </ul>
                    )}
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
