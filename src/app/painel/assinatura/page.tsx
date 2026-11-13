import type { Metadata } from "next";
import { sessaoEquipe } from "@/lib/sessao";
import { DIAS_TESTE, NOTAS_INCLUSAS, PLANOS, VAGAS_FUNDADOR, planoDisponivel, reais, stripeLigado, vagasFundador } from "@/lib/assinatura";
import Cabecalho from "../Cabecalho";
import BotaoAcao from "../BotaoAcao";
import { assinar, gerenciar } from "./actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Assinatura" };

const TEXTO: Record<string, string> = {
  sem_assinatura: "Cadastre o cartão para liberar o painel. Os primeiros 30 dias são grátis.",
  incomplete: "O cadastro do cartão não foi concluído. Tente de novo.",
  incomplete_expired: "O cadastro do cartão expirou. Tente de novo.",
  trialing: "Você está no período de teste grátis.",
  active: "Assinatura ativa. Obrigado!",
  past_due: "Não conseguimos cobrar a última mensalidade. Atualize o cartão.",
  unpaid: "Mensalidade em aberto. Atualize o cartão para voltar a usar.",
  canceled: "Assinatura cancelada. Assine de novo para voltar a usar.",
  paused: "Assinatura pausada.",
  isenta: "Esta pousada não paga assinatura.",
};

const dataBR = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });

export default async function Assinatura({ searchParams }: { searchParams: Promise<{ ok?: string; bemvindo?: string; erro?: string; notas?: string }> }) {
  const q = await searchParams;
  const s = await sessaoEquipe();
  const st = s.pousada.assinatura_status;
  const [plano, vagas] = await Promise.all([planoDisponivel(), vagasFundador()]);
  const temAssinatura = ["trialing", "active", "past_due", "unpaid", "paused"].includes(st);

  return (
    <main className="wrap">
      <Cabecalho s={s} atual="assinatura" />
      <section className="panel" style={{ maxWidth: 860, margin: "0 auto" }}>
        {q.bemvindo && <p className="aviso">Conta criada! Último passo: escolha o plano e cadastre o cartão. Nada é cobrado nos primeiros {DIAS_TESTE} dias.</p>}
        {q.erro && <p className="aviso erro" role="alert">Não conseguimos abrir a página de pagamento. Tente de novo em instantes; se continuar, fale com o suporte pelo WhatsApp (19) 99759-4522. <span className="small">Motivo: {q.erro}</span></p>}
        {q.notas === "on" && <p className="aviso">Notas fiscais automáticas ativadas. A aba <b>Notas fiscais</b> já aparece no menu: comece por <b>Configurar</b>.</p>}
        {q.notas === "off" && <p className="aviso">Notas fiscais automáticas desativadas. O valor sai da próxima mensalidade.</p>}
        {q.ok && !temAssinatura && <p className="aviso">Recebemos o cadastro. A confirmação do Stripe leva alguns segundos: recarregue a página.</p>}
        <div>
          <span className="label">Assinatura</span>
          <h2>{s.pousada.nome}</h2>
          <p className={st === "past_due" || st === "unpaid" ? "err" : "muted"}>{TEXTO[st] ?? st}</p>
          {st === "trialing" && s.pousada.teste_ate && <p>O teste vai até <b>{dataBR(s.pousada.teste_ate)}</b>. Depois, a mensalidade é cobrada automaticamente no cartão.</p>}
        </div>

        {!stripeLigado() ? (
          <p className="empty">A cobrança ainda não foi ativada neste servidor.</p>
        ) : s.perfil.papel !== "dono" ? (
          <p className="empty">Só o dono da conta pode gerenciar a assinatura.</p>
        ) : temAssinatura ? (
          <>
            <div className="nf-pacote">
              <div>
                <b>Notas fiscais automáticas</b> · até {NOTAS_INCLUSAS} por mês incluídas no plano <span className="pill ok">sem contratar emissor</span>
                <div className="muted small">Emite as notas fiscais (NFS-e) das reservas direto do painel, no CNPJ da sua pousada. Basta cadastrar o certificado digital A1 em Notas fiscais → Configurar.</div>
              </div>
            </div>
            <form action={gerenciar}><BotaoAcao className="btn primary" aguardando="Abrindo…">Trocar cartão, ver faturas ou cancelar</BotaoAcao></form>
          </>
        ) : (
          <>
            <div className="planos">
              <form action={assinar} className="plano seu">
                <span className="label">{PLANOS[plano].nome}{plano === "fundador" ? ` · restam ${vagas} de ${VAGAS_FUNDADOR} vagas` : ""}</span>
                <strong>{reais(PLANOS[plano].valor)}<span className="muted small">/mês</span></strong>
                <span className="muted small">{PLANOS[plano].descricao}</span>
                <BotaoAcao className="btn primary" aguardando="Abrindo pagamento…">Começar {DIAS_TESTE} dias grátis</BotaoAcao>
              </form>
            </div>
            <p className="muted small">O cartão é cadastrado na página segura do Stripe; a pousada não vê nem guarda o número. Cancele quando quiser, sem multa.</p>
          </>
        )}
      </section>
    </main>
  );
}
