import Link from "next/link";
import Marca from "../Marca";
import { sair } from "../entrar/actions";
import type { Sessao } from "@/lib/sessao";

const STATUS: Record<string, string> = {
  trialing: "Teste grátis", active: "Assinatura ativa", past_due: "Pagamento pendente", isenta: "",
};

export default function Cabecalho({ s, atual }: { s: Sessao; atual: "reservas" | "config" | "assinatura" | "converter" }) {
  const gestor = s.perfil.papel === "dono" || s.perfil.papel === "gerente";
  const diasTeste = s.pousada.assinatura_status === "trialing" && s.pousada.teste_ate
    ? Math.max(0, Math.ceil((Date.parse(s.pousada.teste_ate) - Date.now()) / 864e5)) : null;
  return (
    <>
      <header className="top">
        <div className="brand">
          {s.pousada.logo_url
            ? <img src={s.pousada.logo_url} alt={`Logo ${s.pousada.nome}`} width={44} height={44} className="logo-pousada" />
            : <Marca />}
          <div><h1>{s.pousada.nome}</h1><small>A Chegada · {s.perfil.nome}</small></div>
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <Link href="/nova-senha" className="btn ghost">Trocar senha</Link>
          <form action={sair}><button className="btn" type="submit">Sair</button></form>
        </div>
      </header>
      <nav className="abas" aria-label="Seções do painel">
        <Link href="/painel" aria-current={atual === "reservas" ? "page" : undefined}>Reservas</Link>
        <Link href="/painel/converter" aria-current={atual === "converter" ? "page" : undefined}>Converter planilha</Link>
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
