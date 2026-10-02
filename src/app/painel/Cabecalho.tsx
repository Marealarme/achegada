import Link from "next/link";
import { sair } from "../entrar/actions";
import type { Sessao } from "@/lib/sessao";

const STATUS: Record<string, string> = {
  trialing: "Teste grátis", active: "Assinatura ativa", past_due: "Pagamento pendente", isenta: "",
};

export default function Cabecalho({ s, atual }: { s: Sessao; atual: "reservas" | "config" | "assinatura" }) {
  const gestor = s.perfil.papel === "dono" || s.perfil.papel === "gerente";
  const diasTeste = s.pousada.assinatura_status === "trialing" && s.pousada.teste_ate
    ? Math.max(0, Math.ceil((Date.parse(s.pousada.teste_ate) - Date.now()) / 864e5)) : null;
  return (
    <>
      <header className="top">
        <div className="brand">
          <svg width="34" height="34" viewBox="0 0 34 34" aria-hidden="true"><circle cx="17" cy="17" r="17" fill="var(--ink)" /><circle cx="20" cy="15" r="9" fill="var(--moon)" /><circle cx="16" cy="12" r="8.5" fill="var(--ink)" /></svg>
          <div><h1>A Chegada</h1><small>{s.pousada.nome} · {s.perfil.nome}</small></div>
        </div>
        <form action={sair}><button className="btn" type="submit">Sair</button></form>
      </header>
      <nav className="abas" aria-label="Seções do painel">
        <Link href="/painel" aria-current={atual === "reservas" ? "page" : undefined}>Reservas</Link>
        {gestor && <Link href="/painel/config" aria-current={atual === "config" ? "page" : undefined}>Configurações</Link>}
        {s.perfil.papel === "dono" && s.pousada.assinatura_status !== "isenta" && (
          <Link href="/painel/assinatura" aria-current={atual === "assinatura" ? "page" : undefined}>
            Assinatura{STATUS[s.pousada.assinatura_status] ? ` · ${STATUS[s.pousada.assinatura_status]}` : ""}
          </Link>
        )}
      </nav>
      {diasTeste !== null && diasTeste <= 7 && atual !== "assinatura" && (
        <p className="aviso">Seu teste grátis termina em {diasTeste} dia(s). A primeira mensalidade é cobrada automaticamente no cartão cadastrado.</p>
      )}
      {s.pousada.assinatura_status === "past_due" && (
        <p className="aviso erro">Não conseguimos cobrar a mensalidade. <Link href="/painel/assinatura">Atualize o cartão</Link> para não perder o acesso.</p>
      )}
    </>
  );
}
