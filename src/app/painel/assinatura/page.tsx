import type { Metadata } from "next";
import { sessaoEquipe } from "@/lib/sessao";
import { DIAS_TESTE, PLANOS, planoPorUnidades, reais, stripeLigado, type Plano } from "@/lib/assinatura";
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

export default async function Assinatura({ searchParams }: { searchParams: Promise<{ ok?: string; bemvindo?: string; erro?: string }> }) {
  const q = await searchParams;
  const s = await sessaoEquipe();
  const st = s.pousada.assinatura_status;
  const sugerido: Plano = (s.pousada.plano as Plano) || planoPorUnidades(s.pousada.qtd_unidades);
  const temAssinatura = ["trialing", "active", "past_due", "unpaid", "paused"].includes(st);

  return (
    <main className="wrap">
      <Cabecalho s={s} atual="assinatura" />
      <section className="panel" style={{ maxWidth: 860, margin: "0 auto" }}>
        {q.bemvindo && <p className="aviso">Conta criada! Último passo: escolha o plano e cadastre o cartão. Nada é cobrado nos primeiros {DIAS_TESTE} dias.</p>}
        {q.erro && <p className="aviso erro" role="alert">Não conseguimos abrir a página de pagamento. Tente de novo em instantes; se continuar, fale com o suporte pelo WhatsApp (19) 99759-4522. <span className="small">Motivo: {q.erro}</span></p>}
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
          <form action={gerenciar}><BotaoAcao className="btn primary" aguardando="Abrindo…">Trocar cartão, ver faturas ou cancelar</BotaoAcao></form>
        ) : (
          <>
            <div className="planos">
              {(Object.keys(PLANOS) as Plano[]).map((k) => (
                <form key={k} action={assinar} className={k === sugerido ? "plano seu" : "plano"}>
                  <input type="hidden" name="plano" value={k} />
                  <span className="label">{PLANOS[k].nome}{k === sugerido ? " · indicado" : ""}</span>
                  <strong>{reais(PLANOS[k].valor)}<span className="muted small">/mês</span></strong>
                  <span className="muted small">{PLANOS[k].descricao}</span>
                  <BotaoAcao className={k === sugerido ? "btn primary" : "btn"} aguardando="Abrindo pagamento…">Começar {DIAS_TESTE} dias grátis</BotaoAcao>
                </form>
              ))}
            </div>
            <p className="muted small">O cartão é cadastrado na página segura do Stripe; a pousada não vê nem guarda o número. Cancele quando quiser, sem multa.</p>
          </>
        )}
      </section>
    </main>
  );
}
