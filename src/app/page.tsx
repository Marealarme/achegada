import type { Metadata } from "next";
import Link from "next/link";
import { PLANOS, reais, type Plano } from "@/lib/assinatura";

export const metadata: Metadata = {
  title: { absolute: "A Chegada · check-in online e FNRH automática para pousadas" },
  description: "O hóspede faz o check-in pelo WhatsApp e a ficha do governo (FNRH) é enviada sozinha. 30 dias grátis.",
  openGraph: {
    title: "A Chegada · check-in online e FNRH automática",
    description: "O hóspede faz o check-in pelo WhatsApp e a ficha do governo sai sozinha. Feito por quem tem pousada.",
    locale: "pt_BR", type: "website",
  },
};

const PASSOS = [
  { t: "Importe as reservas", d: "Suba a lista exportada do seu sistema (ex.: Hotel Link) ou crie a reserva em 30 segundos." },
  { t: "Envie o link no WhatsApp", d: "Um clique abre o WhatsApp com a mensagem pronta e o link do check-in daquele hóspede." },
  { t: "O hóspede faz o check-in", d: "No celular, em 4 minutos: quem vem, documento, endereço por CEP, horário, placa, pet e aceite das regras." },
  { t: "A ficha vai para o governo", d: "A FNRH de cada pessoa é registrada sozinha no Ministério do Turismo. Na chegada e na saída, um botão avisa o governo." },
];

const FAQ = [
  { q: "A FNRH digital é obrigatória?", r: "Sim. Desde 20 de abril de 2026 todo meio de hospedagem precisa registrar os hóspedes na ficha digital do Ministério do Turismo." },
  { q: "O hóspede precisa ter conta gov.br?", r: "Não. Ele preenche só o check-in da pousada; o A Chegada envia a ficha pela integração oficial da FNRH." },
  { q: "Preciso trocar o meu sistema de reservas?", r: "Não. O A Chegada trabalha ao lado do seu sistema: você importa a lista de reservas e segue usando o que já usa." },
  { q: "E a LGPD?", r: "Os dados ficam em servidores no Brasil, isolados por pousada. Cor/raça e deficiência vão só para o governo e não ficam guardados. Senhas e chaves são criptografadas." },
  { q: "Tem fidelidade?", r: "Não. São 30 dias grátis e depois mensalidade no cartão. Cancele quando quiser, pelo próprio painel." },
];

export default function Inicio() {
  return (
    <main className="lp">
      <header className="lp-top">
        <div className="brand">
          <svg width="34" height="34" viewBox="0 0 34 34" aria-hidden="true"><circle cx="17" cy="17" r="17" fill="var(--ink)" /><circle cx="20" cy="15" r="9" fill="var(--moon)" /><circle cx="16" cy="12" r="8.5" fill="var(--ink)" /></svg>
          <b>A Chegada</b>
        </div>
        <nav><Link href="/entrar" className="btn ghost">Entrar</Link><Link href="/cadastrar" className="btn primary">Testar 30 dias grátis</Link></nav>
      </header>

      <section className="lp-hero">
        <span className="label">Para pousadas e chalés · FNRH digital</span>
        <h1>O hóspede faz o check-in pelo WhatsApp. A ficha do governo sai sozinha.</h1>
        <p>Chega de digitar ficha na recepção. O A Chegada manda o link, recebe os dados do hóspede e registra a FNRH no Ministério do Turismo, tudo automático.</p>
        <div className="lp-cta"><Link href="/cadastrar" className="btn primary">Começar 30 dias grátis</Link><span className="muted small">Sem fidelidade. Cancele quando quiser.</span></div>
      </section>

      <section className="lp-sec">
        <h2>Como funciona</h2>
        <ol className="lp-passos">
          {PASSOS.map((p) => <li key={p.t}><b>{p.t}</b><span>{p.d}</span></li>)}
        </ol>
      </section>

      <section className="lp-sec lp-origem">
        <h2>Feito dentro de uma pousada</h2>
        <p>O A Chegada nasceu na Lua Chalés, em Maresias, para resolver o problema real da recepção: fila no check-in, dados espalhados no WhatsApp e a ficha do governo para preencher. Hoje roda lá todos os dias.</p>
      </section>

      <section className="lp-sec" id="planos">
        <h2>Planos</h2>
        <div className="planos">
          {(Object.keys(PLANOS) as Plano[]).map((k) => (
            <div key={k} className={k === "ate10" ? "plano seu" : "plano"}>
              <span className="label">{PLANOS[k].nome}</span>
              <strong>{reais(PLANOS[k].valor)}<span className="muted small">/mês</span></strong>
              <span className="muted small">{PLANOS[k].descricao}</span>
            </div>
          ))}
        </div>
        <p className="muted small">Todos os planos incluem check-in online ilimitado, FNRH automática, importação de reservas, logo da pousada e equipe com vários acessos. 30 dias grátis.</p>
      </section>

      <section className="lp-sec">
        <h2>Perguntas frequentes</h2>
        <div className="lp-faq">
          {FAQ.map((f) => <details key={f.q}><summary>{f.q}</summary><p>{f.r}</p></details>)}
        </div>
      </section>

      <section className="lp-final">
        <h2>Teste na sua pousada por 30 dias</h2>
        <Link href="/cadastrar" className="btn primary">Criar minha conta</Link>
      </section>

      <footer className="lp-rodape muted small"><span>A Chegada</span><Link href="/termos">Termos e privacidade</Link></footer>
    </main>
  );
}
