"use client";

import { useState, useTransition } from "react";
import { cpfFormatar, cpfValido, dataCurta, FNRH_HOSPEDE_URL, somenteDigitos } from "@/lib/util";
import { DEFICIENCIA, GENEROS, MEIOS_TRANSPORTE, MOTIVOS_VIAGEM, PAISES, RACAS, TIPOS_DEFICIENCIA } from "@/lib/fnrh/dominios";
import { enviarCheckin } from "./actions";
import AcoesFinais, { linkWhatsApp } from "./AcoesFinais";

export type Pessoa = {
  nome: string; nacionalidade: string; documento: string; nascimento: string;
  genero: string; generoDescricao: string; raca: string; deficiencia: string; tipoDeficiencia: string;
};
export type Endereco = {
  email: string; telefone: string; paisResidencia: string;
  cep: string; logradouro: string; numero: string; complemento: string; bairro: string; cidade: string; cidadeIbge: number | null; uf: string;
};
type Props = {
  token: string; titular: string; telefone: string | null; unidade: string; checkIn: string; checkOut: string; noites: number;
  adultos: number; criancas: number; regras: string[]; termoPet: string[]; cancelamento: string[];
  pousada: string; whatsapp: string | null; fnrhAutomatica: boolean;
};

type Passo = "inicio" | "pessoas" | "endereco" | "chegada" | "estadia" | "regras" | "ficha" | "pronto";
const NOMES: Record<Passo, string> = {
  inicio: "Boas-vindas", pessoas: "Quem vem", endereco: "Contato e endereço", chegada: "Chegada",
  estadia: "Sua estadia", regras: "Regras", ficha: "Ficha do governo", pronto: "Pronto",
};

const novaPessoa = (nome = ""): Pessoa => ({
  nome, nacionalidade: "BR", documento: "", nascimento: "", genero: "", generoDescricao: "", raca: "", deficiencia: "NAO", tipoDeficiencia: "",
});
const emailValido = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s.trim());
const passaporteValido = (s: string) => /^[A-Za-z0-9]{5,15}$/.test(s.trim());

function Opcoes({ lista, vazio }: { lista: readonly { id: string; label: string }[]; vazio?: string }) {
  return (
    <>
      {vazio !== undefined && <option value="">{vazio}</option>}
      {lista.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
    </>
  );
}

export default function CheckinFlow(p: Props) {
  const passos: Passo[] = ["inicio", "pessoas", "endereco", "chegada", "estadia", "regras", ...(p.fnrhAutomatica ? [] : (["ficha"] as Passo[])), "pronto"];
  const [indice, setIndice] = useState(0);
  const passo = passos[indice];
  const [erro, setErro] = useState("");
  const [enviando, iniciar] = useTransition();

  const [pessoas, setPessoas] = useState<Pessoa[]>(() =>
    Array.from({ length: p.adultos + p.criancas }, (_, i) => novaPessoa(i === 0 && !p.titular.startsWith("Família") ? p.titular : ""))
  );
  const [end, setEnd] = useState<Endereco>({
    email: "", telefone: p.telefone ?? "", paisResidencia: "BR",
    cep: "", logradouro: "", numero: "", complemento: "", bairro: "", cidade: "", cidadeIbge: null, uf: "",
  });
  const [buscandoCep, setBuscandoCep] = useState(false);
  const [horario, setHorario] = useState("");
  const [placa, setPlaca] = useState("");
  const [transporte, setTransporte] = useState("AUTOMOVEL");
  const [motivo, setMotivo] = useState("LAZER_FERIAS");
  const [pet, setPet] = useState({ tem: false, nome: "", especie: "Cachorro", porte: "Pequeno" });
  const [aceiteRegras, setAceiteRegras] = useState(false);
  const [aceitePet, setAceitePet] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const [fnrhOk, setFnrhOk] = useState(false);
  const [fichaEnviada, setFichaEnviada] = useState(false);

  const mudar = (i: number, campo: keyof Pessoa, valor: string) =>
    setPessoas((l) => l.map((x, j) => {
      if (j !== i) return x;
      const novo = { ...x, [campo]: valor };
      if (campo === "documento" && x.nacionalidade === "BR") novo.documento = cpfFormatar(valor);
      if (campo === "nacionalidade") novo.documento = "";
      return novo;
    }));
  const mudarEnd = (campo: keyof Endereco, valor: string) => setEnd((e) => ({ ...e, [campo]: valor }));

  async function buscarCep(valor: string) {
    const cep = valor.replace(/\D/g, "").slice(0, 8);
    setEnd((e) => ({ ...e, cep: cep.length > 5 ? `${cep.slice(0, 5)}-${cep.slice(5)}` : cep }));
    if (cep.length !== 8) return;
    setBuscandoCep(true);
    try {
      const r = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
      const j = await r.json();
      if (j && !j.erro) {
        setEnd((e) => ({ ...e, logradouro: j.logradouro || e.logradouro, bairro: j.bairro || e.bairro, cidade: j.localidade || "", uf: j.uf || "", cidadeIbge: Number(j.ibge) || null }));
      } else {
        setEnd((e) => ({ ...e, cidade: "", uf: "", cidadeIbge: null }));
      }
    } catch {
      /* sem internet ou serviço fora: o hóspede preenche à mão e a recepção corrige */
    } finally {
      setBuscandoCep(false);
    }
  }

  function validar(): string {
    if (passo === "pessoas") {
      const vistos = new Set<string>();
      for (const [i, x] of pessoas.entries()) {
        const quem = i === 0 ? "do titular" : `do acompanhante ${i}`;
        if (x.nome.trim().split(/\s+/).length < 2) return `Informe o nome completo ${quem}.`;
        if (x.nacionalidade === "BR" ? !cpfValido(x.documento) : !passaporteValido(x.documento))
          return x.nacionalidade === "BR" ? `O CPF ${quem} não é válido. Confira os números.` : `Confira o número do passaporte ${quem}.`;
        const doc = x.documento.replace(/[^0-9A-Za-z]/g, "").toUpperCase();
        if (vistos.has(doc)) return "O mesmo documento foi informado duas vezes.";
        vistos.add(doc);
        if (!x.nascimento) return `Informe a data de nascimento ${quem}.`;
        if (!x.genero) return `Escolha o gênero ${quem}.`;
        if (x.genero === "OUTRO" && !x.generoDescricao.trim()) return `Descreva o gênero ${quem}.`;
        if (!x.raca) return `Escolha a cor/raça ${quem} (pode ser "Prefiro não informar").`;
        if (x.deficiencia === "SIM" && !x.tipoDeficiencia) return `Informe o tipo de deficiência ${quem}.`;
      }
    }
    if (passo === "endereco") {
      if (!emailValido(end.email)) return "Informe um e-mail válido.";
      if (somenteDigitos(end.telefone).length < 10) return "Informe um telefone com DDD.";
      if (end.paisResidencia === "BR") {
        if (somenteDigitos(end.cep).length !== 8) return "Informe o CEP com 8 números.";
        if (!end.cidadeIbge) return "Não encontramos esse CEP. Confira os números.";
        if (!end.logradouro.trim() || !end.numero.trim() || !end.bairro.trim()) return "Complete rua, número e bairro.";
      }
    }
    if (passo === "chegada" && pet.tem && !pet.nome.trim()) return "Informe o nome do pet.";
    if (passo === "regras") {
      if (!aceiteRegras) return p.cancelamento.length > 0 ? "Para seguir, aceite as regras da casa e a política de cancelamento." : "Para seguir, aceite as regras da casa.";
      if (pet.tem && !aceitePet) return "Para hospedar o pet, aceite o termo pet.";
    }
    return "";
  }

  const ultimoAntesDoFim = passos[passos.length - 2];

  function avancar() {
    const e = validar();
    setErro(e);
    if (e) return;
    if (passo === ultimoAntesDoFim) {
      iniciar(async () => {
        const res = await enviarCheckin({ token: p.token, pessoas, endereco: end, horario, placa, transporte, motivo, pet, aceiteRegras, aceitePet, marketing });
        if (res.ok) { setFichaEnviada(res.fichaEnviada); setIndice(passos.length - 1); }
        else setErro(res.erro);
      });
      return;
    }
    setIndice((s) => s + 1);
    window.scrollTo(0, 0);
  }

  return (
    <>
      <div className="steps" aria-hidden="true">
        {passos.map((_, i) => <i key={i} className={i <= indice ? "on" : ""} />)}
      </div>
      <p className="stepname">Passo {indice + 1} de {passos.length} · {NOMES[passo]}</p>

      <div className="body" key={passo}>
        {passo === "inicio" && (
          <>
            <p>Olá! Faça seu check-in agora e chegue direto para o descanso, sem fila na recepção.</p>
            <dl className="kv">
              <dt>Chalé</dt><dd>{p.unidade}</dd>
              <dt>Datas</dt><dd>{dataCurta(p.checkIn)} a {dataCurta(p.checkOut)} · {p.noites} noites</dd>
              <dt>Hóspedes</dt><dd>{p.adultos + p.criancas}</dd>
            </dl>
            <p className="muted small">
              Leva cerca de 4 minutos. Tenha à mão o CPF (ou passaporte) de cada pessoa.
              {p.fnrhAutomatica && " Com isso, sua ficha de hospedagem exigida pelo governo já fica pronta."}
            </p>
          </>
        )}

        {passo === "pessoas" && (
          <>
            {pessoas.map((x, i) => (
              <div className="card-g" key={i}>
                <div className="card-g-head">
                  <h3>{i === 0 ? "Titular" : `Acompanhante ${i}`}</h3>
                  {i > 0 && <button className="btn ghost" type="button" onClick={() => setPessoas((l) => l.filter((_, j) => j !== i))}>Remover</button>}
                </div>
                <div className="field">
                  <label htmlFor={`nome-${i}`}>Nome completo</label>
                  <input id={`nome-${i}`} type="text" autoComplete={i === 0 ? "name" : "off"} value={x.nome} onChange={(ev) => mudar(i, "nome", ev.target.value)} />
                </div>
                <div className="grid2">
                  <div className="field">
                    <label htmlFor={`nac-${i}`}>Nacionalidade</label>
                    <select id={`nac-${i}`} value={x.nacionalidade} onChange={(ev) => mudar(i, "nacionalidade", ev.target.value)}><Opcoes lista={PAISES} /></select>
                  </div>
                  <div className="field">
                    <label htmlFor={`doc-${i}`}>{x.nacionalidade === "BR" ? "CPF" : "Passaporte"}</label>
                    <input id={`doc-${i}`} type="text" inputMode={x.nacionalidade === "BR" ? "numeric" : "text"} className="mono"
                      placeholder={x.nacionalidade === "BR" ? "000.000.000-00" : "Número"} value={x.documento} onChange={(ev) => mudar(i, "documento", ev.target.value)} />
                  </div>
                </div>
                <div className="grid2">
                  <div className="field">
                    <label htmlFor={`nasc-${i}`}>Nascimento</label>
                    <input id={`nasc-${i}`} type="date" value={x.nascimento} onChange={(ev) => mudar(i, "nascimento", ev.target.value)} />
                  </div>
                  <div className="field">
                    <label htmlFor={`gen-${i}`}>Gênero</label>
                    <select id={`gen-${i}`} value={x.genero} onChange={(ev) => mudar(i, "genero", ev.target.value)}><Opcoes lista={GENEROS} vazio="Escolha" /></select>
                  </div>
                </div>
                {x.genero === "OUTRO" && (
                  <div className="field">
                    <label htmlFor={`gend-${i}`}>Como você se identifica</label>
                    <input id={`gend-${i}`} type="text" value={x.generoDescricao} onChange={(ev) => mudar(i, "generoDescricao", ev.target.value)} />
                  </div>
                )}
                <div className="grid2">
                  <div className="field">
                    <label htmlFor={`raca-${i}`}>Cor / raça</label>
                    <select id={`raca-${i}`} value={x.raca} onChange={(ev) => mudar(i, "raca", ev.target.value)}><Opcoes lista={RACAS} vazio="Escolha" /></select>
                  </div>
                  <div className="field">
                    <label htmlFor={`def-${i}`}>Pessoa com deficiência?</label>
                    <select id={`def-${i}`} value={x.deficiencia} onChange={(ev) => mudar(i, "deficiencia", ev.target.value)}><Opcoes lista={DEFICIENCIA} /></select>
                  </div>
                </div>
                {x.deficiencia === "SIM" && (
                  <div className="field">
                    <label htmlFor={`tdef-${i}`}>Tipo de deficiência</label>
                    <select id={`tdef-${i}`} value={x.tipoDeficiencia} onChange={(ev) => mudar(i, "tipoDeficiencia", ev.target.value)}><Opcoes lista={TIPOS_DEFICIENCIA} vazio="Escolha" /></select>
                  </div>
                )}
              </div>
            ))}
            {pessoas.length < 12 && <button className="btn" type="button" onClick={() => setPessoas((l) => [...l, novaPessoa()])}>+ Adicionar acompanhante</button>}
            <p className="muted small">Vai sozinho ou com outra quantidade de pessoas? Remova ou adicione acompanhantes aqui.</p>
            <p className="muted small">Cor/raça e deficiência são perguntas da ficha oficial do Ministério do Turismo. Você pode responder “Prefiro não informar”.</p>
          </>
        )}

        {passo === "endereco" && (
          <>
            <div className="grid2">
              <div className="field">
                <label htmlFor="email">E-mail</label>
                <input id="email" type="email" autoComplete="email" value={end.email} onChange={(ev) => mudarEnd("email", ev.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="tel">Celular com DDD</label>
                <input id="tel" type="tel" autoComplete="tel" value={end.telefone} onChange={(ev) => mudarEnd("telefone", ev.target.value)} />
              </div>
            </div>
            <div className="field">
              <label htmlFor="pais">Onde você mora</label>
              <select id="pais" value={end.paisResidencia} onChange={(ev) => mudarEnd("paisResidencia", ev.target.value)}><Opcoes lista={PAISES} /></select>
            </div>
            {end.paisResidencia === "BR" && (
              <>
                <div className="grid2">
                  <div className="field">
                    <label htmlFor="cep">CEP</label>
                    <input id="cep" type="text" inputMode="numeric" autoComplete="postal-code" className="mono" placeholder="00000-000" value={end.cep} onChange={(ev) => buscarCep(ev.target.value)} />
                    <span className="hint">{buscandoCep ? "Buscando endereço…" : end.cidade ? `${end.cidade} / ${end.uf}` : "O endereço é preenchido sozinho"}</span>
                  </div>
                  <div className="field">
                    <label htmlFor="numero">Número</label>
                    <input id="numero" type="text" value={end.numero} onChange={(ev) => mudarEnd("numero", ev.target.value)} />
                  </div>
                </div>
                <div className="field">
                  <label htmlFor="rua">Rua</label>
                  <input id="rua" type="text" autoComplete="address-line1" value={end.logradouro} onChange={(ev) => mudarEnd("logradouro", ev.target.value)} />
                </div>
                <div className="grid2">
                  <div className="field">
                    <label htmlFor="bairro">Bairro</label>
                    <input id="bairro" type="text" value={end.bairro} onChange={(ev) => mudarEnd("bairro", ev.target.value)} />
                  </div>
                  <div className="field">
                    <label htmlFor="compl">Complemento</label>
                    <input id="compl" type="text" placeholder="Opcional" value={end.complemento} onChange={(ev) => mudarEnd("complemento", ev.target.value)} />
                  </div>
                </div>
              </>
            )}
            {pessoas.length > 1 && <p className="muted small">Os acompanhantes usam o mesmo contato e endereço do titular.</p>}
          </>
        )}

        {passo === "chegada" && (
          <>
            <div className="grid2">
              <div className="field">
                <label htmlFor="horario">Horário previsto de chegada</label>
                <input id="horario" type="time" value={horario} onChange={(ev) => setHorario(ev.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="transporte">Como vem</label>
                <select id="transporte" value={transporte} onChange={(ev) => setTransporte(ev.target.value)}><Opcoes lista={MEIOS_TRANSPORTE} /></select>
              </div>
            </div>
            {(transporte === "AUTOMOVEL" || transporte === "MOTO") && (
              <div className="field">
                <label htmlFor="placa">Placa do veículo</label>
                <input id="placa" type="text" className="mono" placeholder="ABC1D23" maxLength={8} value={placa} onChange={(ev) => setPlaca(ev.target.value.toUpperCase())} />
                <span className="hint">Para liberar o estacionamento</span>
              </div>
            )}
            <div className="field">
              <label htmlFor="motivo">Motivo da viagem</label>
              <select id="motivo" value={motivo} onChange={(ev) => setMotivo(ev.target.value)}><Opcoes lista={MOTIVOS_VIAGEM} /></select>
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

        {passo === "estadia" && (
          <>
            <div className="note"><b>Café da manhã incluso</b><span className="muted">Já faz parte da sua reserva e é entregue na porta do chalé.</span></div>
            <div className="note"><b>Early check-in e late check-out</b><span className="muted">Dependem de disponibilidade e devem ser solicitados diretamente à nossa gerente, pelo WhatsApp da pousada.</span>
              {linkWhatsApp(p.whatsapp) && <a href={linkWhatsApp(p.whatsapp, "Olá! Gostaria de solicitar early check-in / late check-out.") ?? undefined} target="_blank" rel="noopener noreferrer">Falar com a gerente no WhatsApp</a>}
            </div>
          </>
        )}

        {passo === "regras" && (
          <>
            <div className="note"><b>Regras da casa</b><ul>{p.regras.map((r) => <li key={r}>{r}</li>)}</ul></div>
            {p.cancelamento.length > 0 && <div className="note"><b>Política de cancelamento</b><ul>{p.cancelamento.map((r) => <li key={r}>{r}</li>)}</ul></div>}
            <label className="check"><input id="aceite-regras" type="checkbox" checked={aceiteRegras} onChange={(ev) => setAceiteRegras(ev.target.checked)} /><span>{p.cancelamento.length > 0 ? "Li e aceito as regras da casa e a política de cancelamento." : "Li e aceito as regras da casa."}</span></label>
            {pet.tem && (
              <>
                <div className="note"><b>Termo pet</b><ul>{p.termoPet.map((r) => <li key={r}>{r}</li>)}</ul></div>
                <label className="check"><input id="aceite-pet" type="checkbox" checked={aceitePet} onChange={(ev) => setAceitePet(ev.target.checked)} /><span>Li e aceito o termo de hospedagem pet.</span></label>
              </>
            )}
            <label className="check"><input id="marketing" type="checkbox" checked={marketing} onChange={(ev) => setMarketing(ev.target.checked)} /><span>Quero receber ofertas e datas especiais pelo WhatsApp. <span className="muted">(opcional)</span></span></label>
          </>
        )}

        {passo === "ficha" && (
          <>
            <p>A lei exige a Ficha Nacional de Registro de Hóspedes (FNRH). Toque abaixo para preencher no site oficial do governo; quem tem conta gov.br já encontra boa parte dos dados preenchida.</p>
            <a className="btn primary block" href={FNRH_HOSPEDE_URL} target="_blank" rel="noopener noreferrer" onClick={() => setFnrhOk(true)}>Abrir a ficha oficial (gov.br)</a>
            <label className="check"><input id="fnrh-ok" type="checkbox" checked={fnrhOk} onChange={(ev) => setFnrhOk(ev.target.checked)} /><span>Já preenchi a ficha (ou vou preencher antes de chegar).</span></label>
          </>
        )}

        {passo === "pronto" && (
          <div className="done">
            <div className="badge-ok" aria-hidden="true">✓</div>
            <h2>Check-in online concluído</h2>
            <p className="muted">{fichaEnviada ? "Obrigado! Sua ficha de hospedagem já foi registrada. Agora é só chegar." : "Obrigado! Agora é só chegar."}</p>
            <AcoesFinais pousada={p.pousada} whatsapp={p.whatsapp} />
          </div>
        )}

        {erro && <p className="err" role="alert">{erro}</p>}
      </div>

      {passo !== "pronto" && (
        <div className="nav">
          {indice > 0 && <button className="btn" type="button" onClick={() => { setErro(""); setIndice((s) => s - 1); }} disabled={enviando}>Voltar</button>}
          <button className="btn primary" type="button" onClick={avancar} disabled={enviando}>
            {passo === "inicio" ? "Começar" : passo === ultimoAntesDoFim ? (enviando ? "Enviando…" : "Concluir check-in") : "Continuar"}
          </button>
        </div>
      )}
    </>
  );
}
