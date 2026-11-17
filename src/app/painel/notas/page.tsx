import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { podeConfigurar, sessaoEquipe, temNotas } from "@/lib/sessao";
import { supabaseServico } from "@/lib/supabase";
import type { NfseConfig } from "@/lib/notas/digisan";
import { chaveDigisan } from "@/lib/notas/chave";
import { liberarEmissao } from "./configurar/actions";
import { notasNoPeriodo, periodoPlano } from "@/lib/notas/emissao";
import { linhasNotas } from "@/lib/notas/linhas";
import { NOTAS_INCLUSAS } from "@/lib/assinatura";
import { PDFS_POR_PARTE, STATUS_PACOTE } from "@/lib/notas/status";
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
  if (!temNotas(s)) redirect("/painel/assinatura");
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
  // a nota que vale para a reserva: a autorizada ou em andamento, se houver (uma tentativa rejeitada depois NÃO pode escondê-la);
  // senão, a tentativa mais recente
  const ATIVAS = ["autorizada", "enviando", "processando", "verificar", "cancelando"];
  for (const n of (notas ?? []) as { id: string; reserva_id: string; status: string; numero: string | null; mensagem: string | null; criada_em: string }[]) {
    const atual = ultima.get(n.reserva_id);
    const ativa = ATIVAS.includes(n.status);
    if (!atual || (ativa && !ATIVAS.includes(atual.status)) || (ativa && n.status === "autorizada" && atual.status !== "autorizada"))
      ultima.set(n.reserva_id, { id: n.id, status: n.status, numero: n.numero, mensagem: n.mensagem, criadaEm: n.criada_em });
  }

  const tela: LinhaTela[] = linhas.map((l) => ({
    reservaId: l.reservaId, numeroReserva: l.numeroReserva, titular: l.titular, checkIn: l.checkIn, checkOut: l.checkOut,
    chale: l.chale, canal: l.canal, total: l.total, pendencias: l.pendencias, nota: ultima.get(l.reservaId) ?? null,
  }));
  const [emitidasMes, { count: noPacote }] = await Promise.all([
    notasNoPeriodo(db, s.pousada.id, cfg?.cicloDia),
    db.from("notas_fiscais").select("id", { count: "exact", head: true }).eq("pousada_id", s.pousada.id)
      .in("status", STATUS_PACOTE).gte("competencia", `${mes}-01`).lte("competencia", ultimoDia),
  ]);
  const partes = Math.ceil((noPacote ?? 0) / PDFS_POR_PARTE);
  const periodo = periodoPlano(cfg?.cicloDia);
  const chave = await chaveDigisan(db, s.pousada.id);
  const temChave = !!chave;
  const configurada = temChave && !!cfg?.prestadorCnpj && !!cfg?.servico && !semTabela;
  const dono = s.perfil.papel === "dono";
  const testeDesde = (cfg as { testeDesde?: string } | null)?.testeDesde;
  const temAutorizada = (notas ?? []).some((n) => {
    const x = n as { status: string; criada_em: string };
    return x.status === "autorizada" && (!testeDesde || x.criada_em >= testeDesde);
  });
  // Gateway: 50 notas incluídas no plano; chave própria: o limite do plano do cliente na Digisan
  const limite = chave?.origem === "gateway" ? NOTAS_INCLUSAS : cfg?.limiteMensal ?? 160;

  return (
    <main className="wrap">
      <Cabecalho s={s} atual="notas" />
      <div className="desk unica">
        <section className="panel">
          <div className="panel-head">
            <h2>Notas fiscais · {MESES[m - 1]} de {ano}</h2>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {dono && <Link className="btn ghost" href="/painel/notas/configurar">Configurar</Link>}
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
              A emissão ainda não está ligada: {semTabela ? "falta a atualização do banco (0013)" : !temChave ? "falta cadastrar a chave da Digisan" : "falta configurar o serviço e o CNPJ"}.
              Os botões de emitir ficam desligados até lá.{" "}
              {dono ? <Link href="/painel/notas/configurar">Configurar a emissão</Link> : "Peça ao dono da pousada para configurar."}
            </p>
          )}
          {configurada && !cfg?.webhookId && s.perfil.papel === "dono" && (
            <form action={ativarAvisos} className="aviso">
              Ative os avisos automáticos para o status das notas (autorizada, rejeitada, cancelada) atualizar sozinho.{" "}
              <BotaoAcao className="btn mini primary" aguardando="Ativando…">Ativar avisos da Digisan</BotaoAcao>
            </form>
          )}
          {configurada && !cfg?.liberada && (
            <div className="aviso">
              Fase de teste: emita <b>uma</b> nota e confira o PDF. A emissão das demais é liberada depois da conferência.
              {dono && temAutorizada && (
                <form action={liberarEmissao} style={{ marginTop: 8 }}>
                  <BotaoAcao className="btn mini primary" aguardando="Liberando…">Conferi o PDF: liberar a emissão das outras notas</BotaoAcao>
                </form>
              )}
            </div>
          )}

          {(noPacote ?? 0) > 0 && (
            <div className="nf-pacote">
              <div>
                <b>Pacote para a contabilidade</b> · {noPacote} nota(s) de {MESES[m - 1]}
                <div className="muted small">Arquivo .zip com a planilha do mês (resumo, notas, reservas sem nota) e os PDFs. O XML completo fica no Emissor Nacional da NFS-e (gov.br/nfse).</div>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {partes <= 1
                  ? <a className="btn" href={`/painel/notas/pacote?mes=${mes}`}>Baixar pacote do mês</a>
                  : Array.from({ length: partes }, (_, i) => <a key={i} className="btn" href={`/painel/notas/pacote?mes=${mes}&parte=${i + 1}`}>Baixar parte {i + 1} de {partes}</a>)}
              </div>
            </div>
          )}

          <TabelaNotas linhas={tela} podeEmitir={configurada && emitidasMes < limite} faseTeste={!cfg?.liberada} />
        </section>
      </div>
    </main>
  );
}
