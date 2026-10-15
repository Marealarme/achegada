import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { podeConfigurar, sessaoEquipe } from "@/lib/sessao";
import { supabaseServico } from "@/lib/supabase";
import { digisanLigada, type NfseConfig } from "@/lib/notas/digisan";
import { notasNoPeriodo, periodoPlano } from "@/lib/notas/emissao";
import { linhasNotas } from "@/lib/notas/linhas";
import Cabecalho from "../Cabecalho";
import TabelaNotas, { type LinhaTela } from "./TabelaNotas";
import { ativarAvisos } from "./actions";
import BotaoAcao from "../BotaoAcao";

export const metadata: Metadata = { title: "Notas fiscais" };
export const dynamic = "force-dynamic";

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

export default async function Notas({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  const s = await sessaoEquipe({ exigirAssinatura: true });
  if (!podeConfigurar(s)) redirect("/painel");
  const hojeMes = new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 7);
  const { mes: mesParam } = await searchParams;
  const mes = /^\d{4}-\d{2}$/.test(mesParam ?? "") ? mesParam! : hojeMes;
  const [ano, m] = mes.split("-").map(Number);
  const ultimoDia = new Date(Date.UTC(ano, m, 0)).toISOString().slice(0, 10);
  const anterior = new Date(Date.UTC(ano, m - 2, 1)).toISOString().slice(0, 7);
  const proximo = new Date(Date.UTC(ano, m, 1)).toISOString().slice(0, 7);

  const db = supabaseServico(); // leitura filtrada pela pousada da sessão
  const [linhas, { data: pous }] = await Promise.all([
    linhasNotas(db, s.pousada.id, `${mes}-01`, ultimoDia),
    db.from("pousadas").select("nfse_config").eq("id", s.pousada.id).maybeSingle(),
  ]);
  const cfg = (pous?.nfse_config ?? null) as (NfseConfig & { liberada?: boolean; webhookId?: string }) | null;
  const { data: notas, error: semTabela } = await db.from("notas_fiscais").select("id, reserva_id, status, numero, mensagem, criada_em")
    .eq("pousada_id", s.pousada.id).in("reserva_id", linhas.length ? linhas.map((l) => l.reservaId) : ["00000000-0000-0000-0000-000000000000"])
    .order("criada_em", { ascending: false });
  const ultima = new Map<string, LinhaTela["nota"]>();
  for (const n of (notas ?? []) as { id: string; reserva_id: string; status: string; numero: string | null; mensagem: string | null }[])
    if (!ultima.has(n.reserva_id)) ultima.set(n.reserva_id, { id: n.id, status: n.status, numero: n.numero, mensagem: n.mensagem });

  const tela: LinhaTela[] = linhas.map((l) => ({
    reservaId: l.reservaId, numeroReserva: l.numeroReserva, titular: l.titular, checkIn: l.checkIn, checkOut: l.checkOut,
    chale: l.chale, canal: l.canal, total: l.total, pendencias: l.pendencias, nota: ultima.get(l.reservaId) ?? null,
  }));
  const emitidasMes = await notasNoPeriodo(db, s.pousada.id, cfg?.cicloDia);
  const periodo = periodoPlano(cfg?.cicloDia);
  const configurada = digisanLigada() && !!cfg?.prestadorCnpj && !!cfg?.servico && !semTabela;
  const limite = cfg?.limiteMensal ?? 160;

  return (
    <main className="wrap">
      <Cabecalho s={s} atual="notas" />
      <div className="desk unica">
        <section className="panel">
          <div className="panel-head">
            <h2>Notas fiscais · {MESES[m - 1]} de {ano}</h2>
            <div style={{ display: "flex", gap: 8 }}>
              <Link className="btn ghost" href={`/painel/notas?mes=${anterior}`}>← {MESES[(m + 10) % 12]}</Link>
              <Link className="btn ghost" href={`/painel/notas?mes=${proximo}`}>{MESES[m % 12]} →</Link>
            </div>
          </div>
          <p className="muted small">Reservas com <b>check-out</b> neste mês. Só as com Pendência <b>OK</b> podem ser emitidas. Cada nota é real (a Digisan não tem ambiente de teste para NFS-e).</p>

          <div className={`nf-contador${emitidasMes >= limite ? " cheio" : emitidasMes >= 140 ? " alerta" : ""}`}>
            <b>{emitidasMes} de {limite}</b> notas emitidas no período do plano ({periodo.rotulo})
            {emitidasMes >= limite ? " · limite do plano atingido" : emitidasMes >= 140 ? " · atenção: perto do limite do plano" : ""}
          </div>

          {!configurada && (
            <p className="aviso">
              A emissão ainda não está ligada: {!digisanLigada() ? "falta cadastrar a chave da Digisan no servidor" : semTabela ? "falta a atualização do banco (0013)" : "falta configurar o serviço e o CNPJ"}.
              Os botões de emitir ficam desligados até lá.
            </p>
          )}
          {configurada && !cfg?.webhookId && s.perfil.papel === "dono" && (
            <form action={ativarAvisos} className="aviso">
              Ative os avisos automáticos para o status das notas (autorizada, rejeitada, cancelada) atualizar sozinho.{" "}
              <BotaoAcao className="btn mini primary" aguardando="Ativando…">Ativar avisos da Digisan</BotaoAcao>
            </form>
          )}
          {configurada && !cfg?.liberada && (
            <p className="aviso">Fase de teste: emita <b>uma</b> nota e confira o PDF. A emissão das demais é liberada depois da conferência.</p>
          )}

          <TabelaNotas linhas={tela} podeEmitir={configurada && emitidasMes < limite} faseTeste={!cfg?.liberada} />
        </section>
      </div>
    </main>
  );
}
