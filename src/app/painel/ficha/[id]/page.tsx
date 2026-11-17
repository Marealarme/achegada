import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { sessaoEquipe } from "@/lib/sessao";
import { cpfFormatar, dataCurta, mensagemWhatsApp, noites } from "@/lib/util";
import Cabecalho from "../../Cabecalho";
import { BotoesMensagem, EditarWhatsApp } from "../../Componentes";
import CompletarTomador from "./CompletarTomador";

export const metadata: Metadata = { title: "Ficha do hóspede" };
export const dynamic = "force-dynamic";

type Hosp = {
  nome: string | null; cpf: string | null; passaporte: string | null; data_nascimento: string | null; telefone: string | null; email: string | null;
  cep: string | null; logradouro: string | null; numero: string | null; complemento: string | null; bairro: string | null; cidade: string | null; uf: string | null; pais_residencia: string | null;
};
type Ficha = {
  id: string; token: string; titular: string; check_in: string; check_out: string; adultos: number; criancas: number; origem: string | null;
  referencia_externa: string | null; ota_referencia: string | null; telefone: string | null; cancelada_em: string | null; descartada_em: string | null;
  checkin_em: string | null; checkout_em: string | null; fnrh_status: string | null; fnrh_erro: string | null; link_enviado_em: string | null;
  unidades: { nome: string } | null;
  hospedes_reserva: { papel: string; hospedes: Hosp | null }[];
  pre_chegadas: { created_at: string; motivo_viagem?: string | null; meio_transporte?: string | null; pet_tem?: boolean | null; pet_nome?: string | null }[];
};

const HOSP = "nome, cpf, passaporte, data_nascimento, telefone, email, cep, logradouro, numero, complemento, bairro, cidade, uf, pais_residencia";
const fone = (t: string | null) => {
  const d = (t ?? "").replace(/\D/g, "").replace(/^55(?=\d{10,11}$)/, "");
  return d.length === 10 || d.length === 11 ? `(${d.slice(0, 2)}) ${d.slice(2, -4)}-${d.slice(-4)}` : t ?? "";
};
const dataHora = (iso: string | null) => (iso ? new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }) : "");
const nasc = (iso: string | null) => (iso ? iso.split("-").reverse().join("/") : "");

export default async function FichaHospede({ params }: { params: Promise<{ id: string }> }) {
  const s = await sessaoEquipe({ exigirAssinatura: true });
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const campos = (pre: string) => `id, token, titular, check_in, check_out, adultos, criancas, origem, referencia_externa, ota_referencia, telefone, cancelada_em, descartada_em, checkin_em, checkout_em, fnrh_status, fnrh_erro, link_enviado_em, unidades(nome), hospedes_reserva(papel, hospedes(${HOSP})), pre_chegadas(${pre})`;
  const primeira = await s.db.from("reservas").select(campos("created_at, motivo_viagem, meio_transporte, pet_tem, pet_nome")).eq("id", id).maybeSingle();
  // bancos sem as colunas novas
  const data = primeira.error ? (await s.db.from("reservas").select(campos("created_at")).eq("id", id).maybeSingle()).data : primeira.data;
  const r = data as unknown as Ficha | null;
  if (!r) notFound();

  const h = await headers();
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? `https://${h.get("host")}`;
  const link = `${base}/c/${r.token}`;
  const mensagem = mensagemWhatsApp({ titular: r.titular, unidade: r.unidades?.nome ?? "seu chalé", check_in: r.check_in, check_out: r.check_out, link }, s.pousada.nome);
  const pessoas = r.hospedes_reserva.filter((x) => x.hospedes).sort((a, b) => (a.papel === "titular" ? -1 : b.papel === "titular" ? 1 : 0));
  const pre = r.pre_chegadas?.[0] ?? null;
  const total = r.adultos + r.criancas;
  const numero = r.referencia_externa && !r.referencia_externa.startsWith("PL-") ? r.referencia_externa : "";

  return (
    <main className="wrap">
      <Cabecalho s={s} atual="historico" />
      <div className="desk unica">
        <section className="panel">
          <div className="panel-head">
            <h2>{r.titular}</h2>
            <Link className="btn ghost" href="/painel/historico">← Histórico</Link>
          </div>
          <p className="muted">
            {dataCurta(r.check_in)} → {dataCurta(r.check_out)} · {noites(r.check_in, r.check_out)} noite(s){r.unidades?.nome ? ` · ${r.unidades.nome}` : ""} · {total} hósp.{r.origem ? ` · ${r.origem}` : ""}
          </p>
          {(r.cancelada_em || r.descartada_em) && <p className="aviso">{r.descartada_em ? "Marcada como teste." : "Reserva cancelada."}</p>}

          <dl className="kv">
            {numero && <><dt>Nº da reserva</dt><dd className="mono">{numero}</dd></>}
            {r.ota_referencia && <><dt>Código no canal</dt><dd className="mono">{r.ota_referencia}</dd></>}
            <dt>WhatsApp</dt><dd><EditarWhatsApp reservaId={r.id} telefone={r.telefone} /></dd>
            <dt>Link enviado</dt><dd>{r.link_enviado_em ? dataHora(r.link_enviado_em) : "Não"}</dd>
            <dt>Ficha preenchida</dt><dd>{pre ? dataHora(pre.created_at) : "Ainda não"}</dd>
            <dt>Chegada / saída</dt><dd>{r.checkin_em ? dataHora(r.checkin_em) : "—"} / {r.checkout_em ? dataHora(r.checkout_em) : "—"}</dd>
            <dt>FNRH (governo)</dt><dd>{r.fnrh_status === "enviado" ? "Registrada" : r.fnrh_status === "erro" ? "Com erro" : pre ? "Pronta, aguardando a chegada" : "Não enviada"}</dd>
            {pre?.motivo_viagem && <><dt>Motivo / transporte</dt><dd>{pre.motivo_viagem}{pre.meio_transporte ? ` · ${pre.meio_transporte}` : ""}</dd></>}
            {pre?.pet_tem && <><dt>Pet</dt><dd>{pre.pet_nome || "Sim"}</dd></>}
          </dl>
          {r.fnrh_erro && <p className="muted small">{r.fnrh_erro}</p>}

          <h3>Hóspedes ({pessoas.length} de {total})</h3>
          {pessoas.length === 0 && <p className="muted">O hóspede ainda não preencheu a ficha. Envie o link abaixo ou abra o link aqui e preencha com ele.</p>}
          {pessoas.length > 0 && pessoas.length < total && <p className="aviso small">A reserva é de {total} pessoa(s), mas a ficha tem {pessoas.length}. Confira quem faltou.</p>}
          <ul className="historico-pessoas">
            {pessoas.map((x, i) => {
              const p = x.hospedes!;
              const end = [p.logradouro && `${p.logradouro}${p.numero ? `, ${p.numero}` : ""}${p.complemento ? ` (${p.complemento})` : ""}`, p.bairro, p.cidade && `${p.cidade}${p.uf ? `/${p.uf}` : ""}`, p.cep && `CEP ${p.cep}`]
                .filter(Boolean).join(" · ");
              return (
                <li key={i} style={{ marginBottom: 10 }}>
                  <b>{p.nome}</b>{x.papel === "titular" ? <span className="pill pre" style={{ marginLeft: 6 }}>titular</span> : null}
                  <div className="small">
                    {p.cpf ? `CPF ${cpfFormatar(p.cpf)}` : p.passaporte ? `Passaporte ${p.passaporte}` : "Sem documento"}
                    {p.data_nascimento ? ` · nasc. ${nasc(p.data_nascimento)}` : ""}
                    {p.telefone ? ` · ${fone(p.telefone)}` : ""}{p.email ? ` · ${p.email}` : ""}
                  </div>
                  {(end || (p.pais_residencia && p.pais_residencia !== "BR")) && <div className="muted small">{end || `País: ${p.pais_residencia}`}</div>}
                </li>
              );
            })}
          </ul>

          {(() => {
            const t = pessoas.find((x) => x.papel === "titular")?.hospedes ?? null;
            const falta = !t || !t.cpf || !t.cep || !t.logradouro;
            return (
              <>
                <h3>Dados para a nota fiscal</h3>
                {falta && <p className="aviso small">Falta {!t || !t.cpf ? "CPF" : ""}{(!t || !t.cpf) && (!t?.cep || !t?.logradouro) ? " e " : ""}{!t?.cep || !t?.logradouro ? "endereço" : ""} do titular para emitir a nota.</p>}
                <CompletarTomador reservaId={r.id} aberto={falta} inicial={{ nome: t?.nome ?? r.titular, cpf: t?.cpf, cep: t?.cep, logradouro: t?.logradouro, numero: t?.numero, complemento: t?.complemento, bairro: t?.bairro, cidade: t?.cidade, uf: t?.uf, email: t?.email }} />
              </>
            );
          })()}

          <h3>Link de check-in</h3>
          <p className="small"><a href={link} target="_blank" rel="noopener noreferrer">Abrir a ficha do hóspede</a> (para preencher junto com ele na recepção)</p>
          <BotoesMensagem reservaId={r.id} mensagem={mensagem} telefone={r.telefone} />
        </section>
      </div>
    </main>
  );
}
