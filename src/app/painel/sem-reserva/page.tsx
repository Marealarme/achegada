import type { Metadata } from "next";
import Link from "next/link";
import { sessaoEquipe } from "@/lib/sessao";
import { cpfMascarado, dataCurta, noites } from "@/lib/util";
import { motivoCompativel, pessoaDoCard } from "@/lib/vinculo";
import Cabecalho from "../Cabecalho";
import BotaoAcao from "../BotaoAcao";
import { descartarFicha, restaurarFicha, vincularFicha } from "./actions";

export const metadata: Metadata = { title: "Fichas sem reserva" };
export const dynamic = "force-dynamic";

type Hosp = { nome: string | null; cpf: string | null; telefone: string | null; email: string | null };
type Card = {
  id: string; titular: string; telefone: string | null; check_in: string; check_out: string; referencia_externa: string | null;
  origem: string | null; valor_total: number | null; cancelada_em: string | null; descartada_em: string | null;
  unidades: { nome: string } | null; hospedes_reserva: { papel: string; hospedes: Hosp | null }[]; pre_chegadas: unknown;
};
const CAMPOS = "id, titular, telefone, check_in, check_out, referencia_externa, origem, valor_total, cancelada_em, descartada_em, unidades(nome), hospedes_reserva(papel, hospedes(nome, cpf, telefone, email)), pre_chegadas(id)";
const temFicha = (c: Card) => (Array.isArray(c.pre_chegadas) ? c.pre_chegadas.length > 0 : !!c.pre_chegadas);
const reais = (v: number | null) => (v == null ? "" : Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));

export default async function SemReserva({ searchParams }: { searchParams: Promise<{ erro?: string; ok?: string; teste?: string }> }) {
  const s = await sessaoEquipe({ exigirAssinatura: true });
  const { erro, ok, teste } = await searchParams;
  const desde = new Date(Date.now() - 120 * 864e5).toISOString().slice(0, 10); // últimos 4 meses

  // fichas = cards sem nº do sistema (criados à mão), ativos
  const { data: soltas, error } = await s.db.from("reservas").select(CAMPOS).is("referencia_externa", null).is("cancelada_em", null)
    .is("descartada_em", null).gte("check_out", desde).order("check_in", { ascending: true }).limit(200);
  const fichas = (soltas ?? []) as unknown as Card[];
  // sugestões = reservas importadas (com nº) das mesmas datas, ainda sem check-in online
  const dias = [...new Set(fichas.map((f) => f.check_in))];
  const { data: doSistema } = dias.length
    ? await s.db.from("reservas").select(CAMPOS).not("referencia_externa", "is", null).not("referencia_externa", "like", "PL-%").is("descartada_em", null).in("check_in", dias)
    : { data: [] };
  const candidatas = ((doSistema ?? []) as unknown as Card[]).filter((r) => !temFicha(r));
  const { data: descartadas } = teste
    ? await s.db.from("reservas").select(CAMPOS).not("descartada_em", "is", null).order("check_in", { ascending: false }).limit(50)
    : { data: null };

  return (
    <main className="wrap">
      <Cabecalho s={s} atual="sem-reserva" />
      <div className="desk unica">
        <section className="panel">
          <div className="panel-head"><h2>Fichas sem reserva</h2></div>
          <p className="muted small">
            Cards criados à mão, sem o número da reserva do sistema. Ligue cada um à reserva certa para o valor e o nº entrarem no relatório de notas.
            Ao ligar, o card importado da mesma reserva sai da lista (duplicado) e nada do que o hóspede preencheu é perdido.
          </p>
          {ok && <p className="ok-msg" role="status">Ficha ligada à reserva.</p>}
          {erro && <p className="err" role="alert">{erro}</p>}
          {error && <p className="err">Não foi possível carregar. A atualização do banco (0012) já foi feita?</p>}
          {!error && fichas.length === 0 && <p className="empty">Nenhuma ficha sem reserva. Tudo ligado. ✓</p>}

          <ul className="sem-reserva">
            {fichas.map((f) => {
              const tit = f.hospedes_reserva.find((x) => x.papel === "titular")?.hospedes ?? null;
              const pf = pessoaDoCard(f);
              const sug = candidatas.filter((r) => r.check_in === f.check_in)
                .map((r) => ({ r, motivo: motivoCompativel(pf, pessoaDoCard(r)) }))
                .sort((a, b) => Number(!!b.motivo) - Number(!!a.motivo) || Number(!!a.r.cancelada_em) - Number(!!b.r.cancelada_em));
              return (
                <li key={f.id} className="sr-item">
                  <div className="sr-ficha">
                    <span className="label">Ficha</span>
                    <b>{tit?.nome ?? f.titular}</b>
                    <span className="muted small">
                      {dataCurta(f.check_in)} → {dataCurta(f.check_out)} · {noites(f.check_in, f.check_out)} noite(s){f.unidades?.nome ? ` · ${f.unidades.nome}` : ""}
                    </span>
                    <span className="muted small">
                      {temFicha(f) ? `Check-in online feito${tit?.cpf ? ` · CPF ${cpfMascarado(tit.cpf)}` : ""}` : "Check-in online ainda não feito"}
                      {f.telefone ? ` · ${f.telefone}` : ""}
                    </span>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 6 }}>
                      <Link className="btn ghost" href={`/painel?r=${f.id}#r-${f.id}`}>Abrir card</Link>
                      <form action={descartarFicha}><input type="hidden" name="ficha" value={f.id} /><BotaoAcao className="btn ghost" aguardando="Marcando…">Marcar como teste / descartar</BotaoAcao></form>
                    </div>
                  </div>
                  <div className="sr-sugestoes">
                    <span className="label">Reservas do sistema com check-in em {dataCurta(f.check_in)}</span>
                    {sug.length === 0 && <p className="muted small">Nenhuma reserva importada nesta data. Importe a planilha do sistema com este dia.</p>}
                    {sug.map(({ r, motivo }) => (
                      <div key={r.id} className={motivo ? "sr-sug forte" : "sr-sug"}>
                        <div>
                          <b>{r.titular}</b>
                          <span className="muted small">
                            {" "}nº <span className="mono">{r.referencia_externa}</span>{r.origem ? ` · ${r.origem}` : ""}{r.unidades?.nome ? ` · ${r.unidades.nome}` : ""}
                            {r.valor_total != null ? ` · ${reais(r.valor_total)}` : ""}{r.cancelada_em ? " · card cancelado no painel" : ""}
                          </span>
                          {motivo && <span className="pill ok" style={{ marginLeft: 6 }}>mesmo {motivo}</span>}
                        </div>
                        <form action={vincularFicha}>
                          <input type="hidden" name="ficha" value={f.id} /><input type="hidden" name="reserva" value={r.id} />
                          <BotaoAcao className={motivo ? "btn primary" : "btn"} aguardando="Ligando…">Vincular</BotaoAcao>
                        </form>
                      </div>
                    ))}
                  </div>
                </li>
              );
            })}
          </ul>

          <p className="small" style={{ marginTop: 16 }}>
            {teste ? <Link href="/painel/sem-reserva">Esconder fichas marcadas como teste</Link> : <Link href="/painel/sem-reserva?teste=1">Ver fichas marcadas como teste</Link>}
          </p>
          {teste && (
            <ul className="historico">
              {((descartadas ?? []) as unknown as Card[]).map((d) => (
                <li key={d.id} className="historico-item" style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                  <span><b>{d.titular}</b> <span className="muted small">{dataCurta(d.check_in)} → {dataCurta(d.check_out)}</span></span>
                  <form action={restaurarFicha}><input type="hidden" name="ficha" value={d.id} /><BotaoAcao className="btn ghost" aguardando="Voltando…">Não é teste (voltar)</BotaoAcao></form>
                </li>
              ))}
              {(descartadas ?? []).length === 0 && <li className="muted small">Nenhuma ficha marcada como teste.</li>}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
