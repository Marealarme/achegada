"use client";

import { useState, useTransition } from "react";
import { cpfFormatar, cpfValido, dataCurta, FNRH_HOSPEDE_URL, somenteDigitos } from "@/lib/util";
import { enviarCheckin } from "./actions";

type Pessoa = { nome: string; cpf: string; nascimento: string };
type Props = {
  token: string; titular: string; unidade: string; checkIn: string; checkOut: string; noites: number;
  adultos: number; criancas: number; regras: string[]; termoPet: string[];
};

const PASSOS = ["Boas-vindas", "Quem vem", "Chegada", "Extras", "Regras", "Ficha do governo", "Pronto"];

export default function CheckinFlow(p: Props) {
  const total = p.adultos + p.criancas;
  const [passo, setPasso] = useState(0);
  const [erro, setErro] = useState("");
  const [enviando, iniciar] = useTransition();
  const [pessoas, setPessoas] = useState<Pessoa[]>(() =>
    Array.from({ length: total }, (_, i) => ({ nome: i === 0 && !p.titular.startsWith("Família") ? p.titular : "", cpf: "", nascimento: "" }))
  );
  const [horario, setHorario] = useState("");
  const [placa, setPlaca] = useState("");
  const [pet, setPet] = useState({ tem: false, nome: "", especie: "Cachorro", porte: "Pequeno" });
  const [late, setLate] = useState(false);
  const [aceiteRegras, setAceiteRegras] = useState(false);
  const [aceitePet, setAceitePet] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const [fnrhOk, setFnrhOk] = useState(false);

  const mudarPessoa = (i: number, campo: keyof Pessoa, valor: string) =>
    setPessoas((lista) => lista.map((x, j) => (j === i ? { ...x, [campo]: campo === "cpf" ? cpfFormatar(valor) : valor } : x)));

  function validar(): string {
    if (passo === 1) {
      const vistos = new Set<string>();
      for (const [i, x] of pessoas.entries()) {
        const quem = i === 0 ? "do titular" : `do acompanhante ${i}`;
        if (x.nome.trim().split(/\s+/).length < 2) return `Informe o nome completo ${quem}.`;
        if (!cpfValido(x.cpf)) return `O CPF ${quem} não é válido. Confira os números.`;
        if (vistos.has(somenteDigitos(x.cpf))) return "O mesmo CPF foi informado duas vezes.";
        vistos.add(somenteDigitos(x.cpf));
        if (!x.nascimento) return `Informe a data de nascimento ${quem}.`;
      }
    }
    if (passo === 2 && pet.tem && !pet.nome.trim()) return "Informe o nome do pet.";
    if (passo === 4) {
      if (!aceiteRegras) return "Para seguir, aceite as regras da casa.";
      if (pet.tem && !aceitePet) return "Para hospedar o pet, aceite o termo pet.";
    }
    return "";
  }

  function avancar() {
    const e = validar();
    setErro(e);
    if (e) return;
    if (passo === 5) {
      iniciar(async () => {
        const res = await enviarCheckin({ token: p.token, pessoas, horario, placa, pet, lateCheckout: late, aceiteRegras, aceitePet, marketing });
        if (res.ok) setPasso(6);
        else setErro(res.erro);
      });
      return;
    }
    setPasso((s) => s + 1);
    window.scrollTo(0, 0);
  }

  return (
    <>
      <div className="steps" aria-hidden="true">
        {PASSOS.map((_, i) => <i key={i} className={i <= passo ? "on" : ""} />)}
      </div>
      <p className="stepname">Passo {passo + 1} de 7 · {PASSOS[passo]}</p>

      <div className="body" key={passo}>
        {passo === 0 && (
          <>
            <p>Olá! Faça seu check-in agora e chegue direto para o descanso, sem fila na recepção.</p>
            <dl className="kv">
              <dt>Chalé</dt><dd>{p.unidade}</dd>
              <dt>Datas</dt><dd>{dataCurta(p.checkIn)} a {dataCurta(p.checkOut)} · {p.noites} noites</dd>
              <dt>Hóspedes</dt><dd>{total}</dd>
            </dl>
            <p className="muted small">Leva cerca de 3 minutos. Tenha à mão o CPF de cada pessoa.</p>
          </>
        )}

        {passo === 1 && (
          <>
            {pessoas.map((x, i) => (
              <div className="card-g" key={i}>
                <h3>{i === 0 ? "Titular" : `Acompanhante ${i}`}</h3>
                <div className="field">
                  <label htmlFor={`nome-${i}`}>Nome completo</label>
                  <input id={`nome-${i}`} type="text" autoComplete={i === 0 ? "name" : "off"} value={x.nome} onChange={(ev) => mudarPessoa(i, "nome", ev.target.value)} />
                </div>
                <div className="grid2">
                  <div className="field">
                    <label htmlFor={`cpf-${i}`}>CPF</label>
                    <input id={`cpf-${i}`} type="text" inputMode="numeric" className="mono" placeholder="000.000.000-00" value={x.cpf} onChange={(ev) => mudarPessoa(i, "cpf", ev.target.value)} />
                  </div>
                  <div className="field">
                    <label htmlFor={`nasc-${i}`}>Nascimento</label>
                    <input id={`nasc-${i}`} type="date" value={x.nascimento} onChange={(ev) => mudarPessoa(i, "nascimento", ev.target.value)} />
                  </div>
                </div>
              </div>
            ))}
            {p.criancas > 0 && <p className="muted small">Para crianças e adolescentes, a ficha do governo também pede dados do responsável.</p>}
          </>
        )}

        {passo === 2 && (
          <>
            <div className="grid2">
              <div className="field">
                <label htmlFor="horario">Horário previsto de chegada</label>
                <input id="horario" type="time" value={horario} onChange={(ev) => setHorario(ev.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="placa">Placa do carro</label>
                <input id="placa" type="text" className="mono" placeholder="ABC1D23" maxLength={8} value={placa} onChange={(ev) => setPlaca(ev.target.value.toUpperCase())} />
                <span className="hint">Para liberar o estacionamento</span>
              </div>
            </div>
            <label className="check">
              <input id="pet-tem" type="checkbox" checked={pet.tem} onChange={(ev) => setPet({ ...pet, tem: ev.target.checked })} />
              <span><b>Vou levar meu pet</b><br /><span className="muted">A pousada é pet friendly.</span></span>
            </label>
            {pet.tem && (
              <div className="card-g">
                <div className="field">
                  <label htmlFor="pet-nome">Nome do pet</label>
                  <input id="pet-nome" type="text" value={pet.nome} onChange={(ev) => setPet({ ...pet, nome: ev.target.value })} />
                </div>
                <div className="grid2">
                  <div className="field">
                    <label htmlFor="pet-especie">Espécie</label>
                    <select id="pet-especie" value={pet.especie} onChange={(ev) => setPet({ ...pet, especie: ev.target.value })}>
                      {["Cachorro", "Gato", "Outro"].map((o) => <option key={o}>{o}</option>)}
                    </select>
                  </div>
                  <div className="field">
                    <label htmlFor="pet-porte">Porte</label>
                    <select id="pet-porte" value={pet.porte} onChange={(ev) => setPet({ ...pet, porte: ev.target.value })}>
                      {["Pequeno", "Médio", "Grande"].map((o) => <option key={o}>{o}</option>)}
                    </select>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {passo === 3 && (
          <>
            <div className="note"><b>Café da manhã incluso</b><span className="muted">Já faz parte da sua reserva e é entregue na porta do chalé.</span></div>
            <label className="extra" htmlFor="late">
              <input id="late" type="checkbox" checked={late} onChange={(ev) => setLate(ev.target.checked)} />
              <span><b>Quero pedir late check-out</b><br /><span className="muted small">Sujeito à disponibilidade; a recepção confirma o valor</span></span>
            </label>
          </>
        )}

        {passo === 4 && (
          <>
            <div className="note">
              <b>Regras da casa</b>
              <ul>{p.regras.map((r) => <li key={r}>{r}</li>)}</ul>
            </div>
            <label className="check"><input id="aceite-regras" type="checkbox" checked={aceiteRegras} onChange={(ev) => setAceiteRegras(ev.target.checked)} /><span>Li e aceito as regras da casa.</span></label>
            {pet.tem && (
              <>
                <div className="note"><b>Termo pet</b><ul>{p.termoPet.map((r) => <li key={r}>{r}</li>)}</ul></div>
                <label className="check"><input id="aceite-pet" type="checkbox" checked={aceitePet} onChange={(ev) => setAceitePet(ev.target.checked)} /><span>Li e aceito o termo de hospedagem pet.</span></label>
              </>
            )}
            <label className="check"><input id="marketing" type="checkbox" checked={marketing} onChange={(ev) => setMarketing(ev.target.checked)} /><span>Quero receber ofertas e datas especiais pelo WhatsApp. <span className="muted">(opcional)</span></span></label>
          </>
        )}

        {passo === 5 && (
          <>
            <p>A lei exige a Ficha Nacional de Registro de Hóspedes (FNRH). Toque abaixo para preencher no site oficial do governo; quem tem conta gov.br já encontra boa parte dos dados preenchida.</p>
            <a className="btn primary block" href={FNRH_HOSPEDE_URL} target="_blank" rel="noopener noreferrer" onClick={() => setFnrhOk(true)}>Abrir a ficha oficial (gov.br)</a>
            <label className="check"><input id="fnrh-ok" type="checkbox" checked={fnrhOk} onChange={(ev) => setFnrhOk(ev.target.checked)} /><span>Já preenchi a ficha (ou vou preencher antes de chegar).</span></label>
          </>
        )}

        {passo === 6 && (
          <div className="done">
            <div className="badge-ok" aria-hidden="true">✓</div>
            <h2>Check-in online concluído</h2>
            <p className="muted">Obrigado! Agora é só chegar.</p>
          </div>
        )}

        {erro && <p className="err" role="alert">{erro}</p>}
      </div>

      {passo < 6 && (
        <div className="nav">
          {passo > 0 && <button className="btn" type="button" onClick={() => { setErro(""); setPasso((s) => s - 1); }} disabled={enviando}>Voltar</button>}
          <button className="btn primary" type="button" onClick={avancar} disabled={enviando}>
            {passo === 0 ? "Começar" : passo === 5 ? (enviando ? "Enviando…" : "Concluir check-in") : "Continuar"}
          </button>
        </div>
      )}
    </>
  );
}
