import type { Metadata } from "next";
import Link from "next/link";
import { PLANOS, reais, type Plano } from "@/lib/assinatura";
import SeloInn from "./SeloInn";
import Marca from "./Marca";

const EMPRESA = "Inn Experts Assessoria em Hospitalidade";
const FONE = "(19) 99759-4522";
const WHATS = "https://wa.me/5519997594522?text=" + encodeURIComponent("Olá! Quero saber mais sobre o A Chegada (check-in online e FNRH automática).");

export const metadata: Metadata = {
  title: { absolute: "A Chegada · check-in online e FNRH automática para pousadas" },
  description: "O hóspede faz o check-in pelo WhatsApp e a ficha do governo (FNRH) é enviada sozinha. Uma solução Inn Experts Assessoria em Hospitalidade. 30 dias grátis.",
  openGraph: {
    title: "A Chegada · check-in online e FNRH automática",
    description: "O hóspede faz o check-in pelo WhatsApp e a ficha do governo sai sozinha. Uma solução Inn Experts Assessoria em Hospitalidade.",
    locale: "pt_BR", type: "website",
  },
};

const DORES = [
  { t: "FNRH digital obrigatória", d: "Desde 20/04/2026, toda hospedagem precisa registrar cada hóspede no sistema do Ministério do Turismo." },
  { t: "Ficha digitada à mão", d: "CPF, endereço e nascimento de cada pessoa, um por um, com erro de digitação no meio." },
  { t: "Dados no WhatsApp", d: "Foto de documento, placa do carro e horário de chegada espalhados em conversas." },
  { t: "Fila no check-in", d: "Sexta à noite todo mundo chega junto e a recepção trava." },
];

const PASSOS = [
  { t: "Importe as reservas", d: "Suba a lista exportada do seu sistema (ex.: Hotel Link) e os cards aparecem sozinhos. Ou crie a reserva em 30 segundos." },
  { t: "Envie o link no WhatsApp", d: "Um clique abre o WhatsApp com a mensagem pronta e o link do check-in daquele hóspede." },
  { t: "O hóspede faz o check-in", d: "No celular, antes de chegar: ele e os acompanhantes, endereço pelo CEP, horário, placa, pet e aceite das regras." },
  { t: "A ficha vai para o governo", d: "A FNRH é registrada sozinha pela integração oficial. Na chegada e na saída, um botão avisa o governo." },
];

const ETAPAS_HOSPEDE = ["Quem vem com você", "Endereço (pelo CEP)", "Chegada, carro e placa", "Pet e estadia", "Regras e cancelamento"];

const STATUS: { t: string; c: string }[] = [
  { t: "Link a enviar", c: "" }, { t: "Aguardando hóspede", c: "" }, { t: "Pré-chegada feita", c: "amarelo" },
  { t: "Ficha enviada", c: "claro" }, { t: "Hospedado", c: "forte" }, { t: "Saiu", c: "escuro" },
];

const ANTES_DEPOIS = [
  ["Recepção digita a ficha de cada pessoa", "O hóspede preenche, a ficha vai sozinha"],
  ["Documento chega por foto no WhatsApp", "Dados validados (CPF, CEP) antes de chegar"],
  ["Entrada e saída lançadas no site do governo", "Um botão no painel avisa o governo"],
  ["Erro descoberto depois, sem saber o motivo", "O painel mostra o erro e tenta de novo"],
];

const SEGURANCA = [
  { t: "Servidores no Brasil", d: "Banco de dados e aplicação hospedados em São Paulo." },
  { t: "Cada pousada isolada", d: "Uma pousada nunca vê o cadastro de outra. A regra está no próprio banco." },
  { t: "Chaves criptografadas", d: "Senha da FNRH e CPF do responsável guardados cifrados." },
  { t: "Só o necessário", d: "Cor/raça e deficiência vão só para o governo e não ficam guardadas." },
];

const FAQ = [
  { q: "A FNRH digital é obrigatória?", r: "Sim. Desde 20 de abril de 2026 todo meio de hospedagem precisa registrar os hóspedes na ficha digital do Ministério do Turismo." },
  { q: "O hóspede precisa ter conta gov.br?", r: "Não. Ele preenche só o check-in da pousada; o A Chegada envia a ficha pela integração oficial da FNRH." },
  { q: "Preciso trocar o meu sistema de reservas?", r: "Não. O A Chegada trabalha ao lado do seu sistema: você importa a lista de reservas e segue usando o que já usa." },
  { q: "E a LGPD?", r: "A pousada é a controladora dos dados e o A Chegada é o operador. Os dados ficam em servidores no Brasil, isolados por pousada, e senhas e chaves são criptografadas." },
  { q: "Tem fidelidade?", r: "Não. São 30 dias grátis e depois mensalidade no cartão. Cancele quando quiser, pelo próprio painel." },
  { q: "Tenho mais de 40 unidades. Atende?", r: `Sim. Fale com a ${EMPRESA} pelo WhatsApp ${FONE} para um plano sob medida.` },
];


export default function Inicio() {
  return (
    <main className="lp">
      <header className="lp-top">
        <div className="brand"><Marca /><b>A Chegada</b><SeloInn largura={110} /></div>
        <nav><Link href="/entrar" className="btn ghost">Entrar</Link><Link href="/cadastrar" className="btn primary">Testar 30 dias grátis</Link></nav>
      </header>

      <section className="lp-hero">
        <span className="label">Check-in online para pousadas · FNRH digital</span>
        <h1>O hóspede faz o check-in pelo WhatsApp. A ficha do governo sai sozinha.</h1>
        <p>Menos fila na recepção, nenhuma ficha digitada à mão e a FNRH digital em dia.</p>
        <div className="lp-cta">
          <Link href="/cadastrar" className="btn primary">Começar 30 dias grátis</Link>
          <a href={WHATS} className="btn ghost" target="_blank" rel="noopener">Falar no WhatsApp</a>
        </div>
      </section>

      <section className="lp-sec">
        <span className="label">O problema</span>
        <h2>A recepção virou cartório, justo na hora em que o hóspede chega cansado.</h2>
        <div className="lp-cards">
          {DORES.map((d) => <div key={d.t}><b>{d.t}</b><span>{d.d}</span></div>)}
        </div>
      </section>

      <section className="lp-sec">
        <span className="label">Como funciona</span>
        <h2>Quatro passos. Dois são automáticos.</h2>
        <ol className="lp-passos">
          {PASSOS.map((p, i) => <li key={p.t} className={i >= 2 ? "auto" : ""}><b>{p.t}</b><span>{p.d}</span></li>)}
        </ol>
      </section>

      <section className="lp-sec lp-duas">
        <div className="lp-col">
          <span className="label">O que o hóspede vê</span>
          <h2>Uns 4 minutos no celular, com a cara da sua pousada.</h2>
          <p className="muted">Logo da pousada, endereço pelo CEP, aceite das regras e do termo pet. No fim, o botão “Como chegar” e a volta para a conversa no WhatsApp.</p>
        </div>
        <div className="lp-celular" aria-hidden="true">
          <div>
            <b>Check-in online</b>
            {ETAPAS_HOSPEDE.map((e, i) => <span key={e}>{i + 1} · {e}</span>)}
            <span className="feito">Check-in concluído</span>
          </div>
        </div>
      </section>

      <section className="lp-sec">
        <span className="label">O que a recepção vê</span>
        <h2>Cada reserva mostra em que pé está. Ninguém precisa perguntar.</h2>
        <div className="lp-pills">
          {STATUS.map((s, i) => <span key={s.t}>{i > 0 && <i aria-hidden="true">→</i>}<em className={s.c}>{s.t}</em></span>)}
        </div>
        <p className="muted">Clicou no card, os dados do hóspede abrem ali mesmo. A equipe pode ter vários acessos, cada um com sua senha.</p>
      </section>

      <section className="lp-sec">
        <span className="label">A ficha do governo</span>
        <h2>Antes e depois do A Chegada</h2>
        <div className="lp-tabela" role="table">
          <div role="row" className="cab"><span role="columnheader">Antes</span><span role="columnheader">Com o A Chegada</span></div>
          {ANTES_DEPOIS.map(([a, d]) => <div role="row" key={a}><span role="cell" className="muted">{a}</span><span role="cell">{d}</span></div>)}
        </div>
      </section>

      <section className="lp-sec lp-origem">
        <span className="label">Dados protegidos</span>
        <h2>LGPD levada a sério desde o primeiro dia.</h2>
        <div className="lp-cards escuro">
          {SEGURANCA.map((s) => <div key={s.t}><b>{s.t}</b><span>{s.d}</span></div>)}
        </div>
      </section>

      <section className="lp-sec lp-quem">
        <img src="/logo-innexperts.png" alt="Inn Experts — Assessoria em Hospitalidade" width={430} height={140} className="lp-logo-inn" />
        <span className="label">Quem está por trás</span>
        <h2>Criado por quem vive a rotina da hotelaria.</h2>
        <p>O A Chegada é uma solução da <b>{EMPRESA}</b>, especializada em assessoria para meios de hospedagem. Nasceu da operação real de pousada, para resolver o que trava a recepção: fila no check-in, dados espalhados no WhatsApp e a ficha do governo para preencher.</p>
      </section>

      <section className="lp-sec" id="planos">
        <span className="label">Planos</span>
        <h2>Preço pelo tamanho da pousada. 30 dias grátis.</h2>
        <div className="planos">
          {(Object.keys(PLANOS) as Plano[]).map((k) => (
            <div key={k} className={k === "ate10" ? "plano seu" : "plano"}>
              <span className="label">{PLANOS[k].nome}</span>
              <strong>{reais(PLANOS[k].valor)}<span className="muted small">/mês</span></strong>
              <span className="muted small">{PLANOS[k].descricao}</span>
            </div>
          ))}
        </div>
        <p className="muted small">Todos incluem check-in ilimitado, FNRH automática, importação de reservas, logo da pousada e vários acessos da equipe. Sem fidelidade: cancela pelo próprio painel. Acima de 40 unidades, fale com a gente.</p>
      </section>

      <section className="lp-sec">
        <h2>Perguntas frequentes</h2>
        <div className="lp-faq">
          {FAQ.map((f) => <details key={f.q}><summary>{f.q}</summary><p>{f.r}</p></details>)}
        </div>
      </section>

      <section className="lp-final">
        <h2>Teste na sua pousada por 30 dias</h2>
        <div className="lp-cta">
          <Link href="/cadastrar" className="btn primary">Criar minha conta</Link>
          <a href={WHATS} className="btn ghost" target="_blank" rel="noopener">WhatsApp {FONE}</a>
        </div>
      </section>

      <footer className="lp-rodape muted small">
        <span className="lp-assina"><img src="/logo-innexperts.png" alt="Inn Experts" width={172} height={56} /><span>A Chegada · uma solução {EMPRESA} · {FONE}</span></span>
        <Link href="/termos">Termos e privacidade</Link>
      </footer>
    </main>
  );
}
