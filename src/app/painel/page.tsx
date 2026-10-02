import Link from "next/link";
import { headers } from "next/headers";
import type { Metadata } from "next";
import { podeConfigurar, sessaoEquipe } from "@/lib/sessao";
import Cabecalho from "./Cabecalho";
import { cpfMascarado, dataCurta, mensagemWhatsApp, noites, partesData } from "@/lib/util";
import { cancelarCard, cancelarFicha, marcarFnrh, reenviarFnrh, registrarChegada, registrarSaida } from "./actions";
import { fnrhLigada } from "@/lib/fnrh/cliente";
import { BotoesMensagem, ImportarReservas, NovaReserva } from "./Componentes";
import BotaoAcao from "./BotaoAcao";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
export const metadata: Metadata = { title: "Painel" };

type Reserva = {
  id: string; titular: string; telefone: string | null; check_in: string; check_out: string;
  adultos: number; criancas: number; token: string; fnrh_concluida: boolean; link_enviado_em?: string | null;
  fnrh_status?: string; fnrh_erro?: string | null; fnrh_reserva_id?: string | null; checkin_em?: string | null; checkout_em?: string | null;
  unidades: { nome: string } | null;
  pre_chegadas: { horario_chegada: string | null; placa: string | null; pet_tem: boolean; pet_nome: string | null; pet_especie: string | null; pet_porte: string | null; late_checkout: boolean }[] | { horario_chegada: string | null } | null;
  hospedes_reserva: { papel: string; hospedes: { nome: string; cpf: string | null; passaporte?: string | null; consentimento_marketing_em: string | null } | null }[];
};

function status(r: { fnrh_concluida: boolean; pre: unknown; link_enviado_em?: string | null; fnrh_status?: string; checkin_em?: string | null; checkout_em?: string | null }) {
  if (r.checkout_em) return { cls: "ok", txt: "Saiu" };
  if (r.checkin_em) return { cls: "ok", txt: "Hospedado" };
  if (r.fnrh_status === "erro" || r.fnrh_status === "enviando") return { cls: "bad", txt: "Erro na ficha" };
  if (r.fnrh_status === "enviado") return { cls: "ok", txt: "Ficha enviada" };
  if (r.fnrh_concluida) return { cls: "ok", txt: "Pronto" };
  if (r.pre) return { cls: "pre", txt: "Pré-chegada feita" };
  if (r.link_enviado_em) return { cls: "wait", txt: "Aguardando hóspede" };
  return { cls: "link", txt: "Link a enviar" };
}

function quando(iso: string) {
  const d = new Date(Date.parse(iso) - 3 * 3600e3); // horário de Brasília
  return `${d.getUTCDate()}/${d.getUTCMonth() + 1} às ${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}

const CAMPOS = "id, titular, telefone, check_in, check_out, adultos, criancas, token, fnrh_concluida, unidades(nome), pre_chegadas(horario_chegada, placa, pet_tem, pet_nome, pet_especie, pet_porte, late_checkout), hospedes_reserva(papel, hospedes(nome, cpf, consentimento_marketing_em))";

export default async function Painel({ searchParams }: { searchParams: Promise<{ r?: string }> }) {
  const { r: selecionada } = await searchParams;
  const sessao = await sessaoEquipe({ exigirAssinatura: true });
  const { db, perfil } = sessao;
  const pousadaNome = sessao.pousada.nome;

  const hoje = new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10); // horário de Brasília
  const buscar = (campos: string, semCanceladas = false) => {
    const q = db.from("reservas").select(campos).gte("check_out", hoje).order("check_in", { ascending: true }).limit(200);
    return semCanceladas ? q.is("cancelada_em", null) : q;
  };
  const COMPLETO = `${CAMPOS}, link_enviado_em, fnrh_status, fnrh_erro, fnrh_reserva_id, checkin_em, checkout_em`;
  const [comFiltro, { data: unidades }] = await Promise.all([
    buscar(COMPLETO, true),
    db.from("unidades").select("id, nome").order("nome"),
  ]);
  // migração 0007 ainda não rodou: busca sem esconder as canceladas
  const primeira = comFiltro.error ? await buscar(COMPLETO) : comFiltro;
  let lista = primeira.data;
  if (primeira.error) {
    // migrações 0002/0004 ainda não rodaram: busca só o que existe
    const segunda = await buscar(`${CAMPOS}, link_enviado_em`);
    lista = segunda.error ? (await buscar(CAMPOS)).data : segunda.data;
  }
  const integracao = await fnrhLigada(sessao.pousada.id);

  const reservas = ((lista ?? []) as unknown as Reserva[]).map((r) => ({
    ...r,
    pre: Array.isArray(r.pre_chegadas) ? r.pre_chegadas[0] ?? null : (r.pre_chegadas as Reserva["pre_chegadas"] & object) ?? null,
  }));
  const atual = reservas.find((x) => x.id === selecionada);

  const h = await headers();
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? `https://${h.get("host")}`;
  const feitas = reservas.filter((r) => r.pre).length;
  const prontas = reservas.filter((r) => r.fnrh_concluida).length;

  const detalhe = (atual: (typeof reservas)[number]) => {
    const st = status(atual);
    const p = atual.pre as null | { horario_chegada: string | null; placa: string | null; pet_tem: boolean; pet_nome: string | null; pet_especie: string | null; pet_porte: string | null; late_checkout: boolean };
    const link = `${base}/c/${atual.token}`;
    const msg = mensagemWhatsApp({ titular: atual.titular, unidade: atual.unidades?.nome ?? "seu chalé", check_in: atual.check_in, check_out: atual.check_out, link }, pousadaNome);
    const titular = atual.hospedes_reserva.find((x) => x.papel === "titular")?.hospedes;
    return (
      <section className="detalhe" aria-label="Detalhe da reserva">
        <div className="panel-head"><div><span className="label">{atual.unidades?.nome ?? "Sem chalé"}</span><h2>{atual.titular}</h2></div><span className={`pill ${st.cls}`}>{st.txt}</span></div>
        <dl className="kv">
          <dt>Estadia</dt><dd>{dataCurta(atual.check_in)} a {dataCurta(atual.check_out)} · {noites(atual.check_in, atual.check_out)} noites</dd>
          <dt>Hóspedes</dt><dd>{atual.adultos} adultos{atual.criancas ? ` e ${atual.criancas} criança(s)` : ""}</dd>
          <dt>WhatsApp</dt><dd className="mono">{atual.telefone ?? "—"}</dd>
        </dl>
        <div className="field">
          <span className="label">Mensagem para o hóspede</span>
          <div className="msg">{msg}</div>
          <BotoesMensagem reservaId={atual.id} mensagem={msg} telefone={atual.telefone} />
          {atual.link_enviado_em && <p className="muted small">Link enviado em {quando(atual.link_enviado_em)}.</p>}
        </div>
        {p ? (
          <>
            <div className="field"><span className="label">Pré-chegada</span>
              <dl className="kv">
                <dt>Chega às</dt><dd>{p.horario_chegada?.slice(0, 5) ?? "—"}</dd>
                <dt>Placa</dt><dd className="mono">{p.placa ?? "—"}</dd>
                <dt>Pet</dt><dd>{p.pet_tem ? `${p.pet_nome} · ${p.pet_especie}, porte ${p.pet_porte} · termo aceito` : "Sem pet"}</dd>
                <dt>Regras e cancelamento</dt><dd>Aceitos</dd>
                <dt>Ofertas</dt><dd>{titular?.consentimento_marketing_em ? "Aceitou receber" : "Não aceitou"}</dd>
              </dl>
            </div>
            <div className="field"><span className="label">Hóspedes cadastrados</span>
              <div className="people">
                {atual.hospedes_reserva.map((x, i) => (
                  <div className="person" key={i}><span>{x.hospedes?.nome}</span><span className="mono muted">{x.hospedes?.cpf ? `CPF ${cpfMascarado(x.hospedes.cpf)}` : "Passaporte"}</span></div>
                ))}
              </div>
            </div>
            <div className="field"><span className="label">Ficha FNRH</span>
              {atual.fnrh_status === "enviado" ? (
                <>
                  <p>Ficha registrada no governo{atual.checkin_em ? ` · check-in em ${quando(atual.checkin_em)}` : ""}{atual.checkout_em ? ` · check-out em ${quando(atual.checkout_em)}` : ""}.</p>
                  {atual.fnrh_erro && <p className={atual.fnrh_erro.startsWith("Aviso:") ? "muted small" : "err"}>{atual.fnrh_erro}</p>}
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {!atual.checkin_em && <form action={registrarChegada}><input type="hidden" name="id" value={atual.id} /><BotaoAcao className="btn primary" aguardando="Registrando no governo…">Hóspede chegou</BotaoAcao></form>}
                    {!atual.checkin_em && <form action={cancelarFicha}><input type="hidden" name="id" value={atual.id} /><BotaoAcao className="btn ghost" aguardando="Cancelando…">Cancelar ficha</BotaoAcao></form>}
                    {atual.checkin_em && !atual.checkout_em && <form action={registrarSaida}><input type="hidden" name="id" value={atual.id} /><BotaoAcao aguardando="Registrando no governo…">Hóspede saiu</BotaoAcao></form>}
                  </div>
                  {!atual.checkin_em && <p className="muted small">Ao clicar, o check-in é registrado na FNRH com o horário de agora.</p>}
                </>
              ) : atual.fnrh_status === "erro" || atual.fnrh_status === "enviando" ? (
                <>
                  <p className="err">{atual.fnrh_status === "enviando" ? "O envio anterior foi interrompido antes de o governo responder." : `O governo recusou ou não respondeu: ${atual.fnrh_erro ?? "erro desconhecido"}`}</p>
                  <form action={reenviarFnrh}><input type="hidden" name="id" value={atual.id} /><BotaoAcao className="btn primary" aguardando="Enviando ao governo… (até 30s)">Tentar de novo</BotaoAcao></form>
                </>
              ) : atual.fnrh_concluida && !atual.fnrh_erro ? (
                <p>Fichas confirmadas no gov.br.</p>
              ) : integracao ? (
                <>
                  <p className="muted small">{atual.fnrh_erro ?? "A ficha ainda não foi enviada ao governo."}</p>
                  <form action={reenviarFnrh}><input type="hidden" name="id" value={atual.id} /><BotaoAcao aguardando="Enviando ao governo… (até 30s)">Enviar ficha agora</BotaoAcao></form>
                </>
              ) : (
                <>
                  <p className="muted small">Quando as fichas aparecerem no módulo da pousada na FNRH, marque aqui.</p>
                  <form action={marcarFnrh}><input type="hidden" name="id" value={atual.id} /><BotaoAcao>Marcar FNRH concluída</BotaoAcao></form>
                </>
              )}
            </div>
          </>
        ) : (
          <p className="empty">O hóspede ainda não fez a pré-chegada. Envie o link pelo WhatsApp; se precisar, reenvie na véspera.</p>
        )}
        {!p && atual.fnrh_erro && <p className="err">{atual.fnrh_erro}</p>}
        {!atual.checkin_em && (
          <details className="cancelar">
            <summary>Cancelar esta reserva</summary>
            <p className="muted small">
              O card sai da lista e o link do hóspede para de funcionar.
              {atual.fnrh_status === "enviado" ? " A ficha que já foi ao governo também é cancelada." : ""}
              {p ? " O cadastro dos hóspedes continua guardado." : ""}
            </p>
            <form action={cancelarCard}><input type="hidden" name="id" value={atual.id} /><BotaoAcao className="btn perigo" aguardando="Cancelando…">Sim, cancelar a reserva</BotaoAcao></form>
          </details>
        )}
      </section>
    );
  };
  return (
    <main className="wrap">
      <Cabecalho s={sessao} atual="reservas" />

      <section className="kpis" aria-label="Resumo">
        <div className="kpi"><span className="label">Próximas estadias</span><strong>{reservas.length}</strong></div>
        <div className="kpi"><span className="label">Pré-chegada feita</span><strong>{feitas} de {reservas.length}</strong></div>
        <div className="kpi"><span className="label">Fichas FNRH prontas</span><strong>{prontas} de {reservas.length}</strong></div>
      </section>

      <div className="desk unica">
        <section className="panel" aria-label="Chegadas">
          <div className="panel-head"><h2>Próximas chegadas</h2><div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>{podeConfigurar(sessao) && <a className="btn ghost" href="/painel/exportar" download>Baixar hóspedes (Excel)</a>}<ImportarReservas /><NovaReserva unidades={unidades ?? []} /></div></div>
          {reservas.length === 0 ? (
            <p className="empty">Nenhuma reserva ainda. Use “Importar reservas” para subir a planilha com as próximas reservas, ou “+ Nova reserva” para criar uma.</p>
          ) : (
            <div className="list">
              {reservas.map((x) => {
                const st = status(x);
                const dt = partesData(x.check_in);
                const aberta = atual?.id === x.id;
                return (
                  <div key={x.id} id={`r-${x.id}`} className={aberta ? "item aberto" : "item"}>
                    <Link href={aberta ? "/painel" : `/painel?r=${x.id}#r-${x.id}`} className="row" aria-current={aberta} aria-expanded={aberta}>
                      <span className="date"><b>{dt.dia}</b><span>{dt.mes}</span></span>
                      <span className="who"><b>{x.titular}</b><span>{x.unidades?.nome ?? "—"} · {noites(x.check_in, x.check_out)} noites · {x.adultos + x.criancas} hósp.</span></span>
                      <span className={`pill ${st.cls}`}>{st.txt}</span>
                    </Link>
                    {aberta && detalhe(x)}
                  </div>
                );
              })}
            </div>
          )}
        </section>


      </div>
    </main>
  );
}
