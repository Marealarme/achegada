"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { completarTomador, type EstadoTomador } from "./actions";

type Inicial = { nome?: string | null; cpf?: string | null; cep?: string | null; logradouro?: string | null; numero?: string | null; complemento?: string | null; bairro?: string | null; cidade?: string | null; uf?: string | null; email?: string | null };

/** Formulário da equipe para completar CPF e endereço do titular (para emitir a nota). */
export default function CompletarTomador({ reservaId, inicial, aberto, rotulo = "Editar CPF e endereço do titular" }: { reservaId: string; inicial: Inicial; aberto: boolean; rotulo?: string }) {
  const [estado, enviar, pendente] = useActionState<EstadoTomador, FormData>(completarTomador, {});
  const [mostrar, setMostrar] = useState(aberto);
  const [v, setV] = useState({
    nome: inicial.nome ?? "", cpf: inicial.cpf ?? "", cep: inicial.cep ?? "", logradouro: inicial.logradouro ?? "", numero: inicial.numero ?? "",
    complemento: inicial.complemento ?? "", bairro: inicial.bairro ?? "", cidade: inicial.cidade ?? "", uf: inicial.uf ?? "", cidade_ibge: "", email: inicial.email ?? "",
  });
  const form = useRef<HTMLFormElement>(null);
  const muda = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement>) => setV((x) => ({ ...x, [k]: e.target.value }));

  useEffect(() => {
    if (estado.campo) form.current?.querySelector<HTMLInputElement>(`[name="${estado.campo}"]`)?.focus();
  }, [estado]);

  async function buscarCep(valor: string) {
    setV((x) => ({ ...x, cep: valor }));
    const cep = valor.replace(/\D/g, "");
    if (cep.length !== 8) return;
    try {
      const r = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
      const d = await r.json();
      if (d && !d.erro) setV((x) => ({ ...x, logradouro: d.logradouro || x.logradouro, bairro: d.bairro || x.bairro, cidade: d.localidade || x.cidade, uf: d.uf || x.uf, cidade_ibge: d.ibge || "" }));
    } catch { /* sem internet: a pessoa digita */ }
  }

  if (!mostrar) return <button type="button" className="btn ghost" onClick={() => setMostrar(true)}>{rotulo}</button>;

  const erro = (k: string) => (estado.campo === k ? <span className="err small" role="alert">{estado.erro}</span> : null);
  return (
    <form ref={form} action={enviar} className="card" style={{ marginTop: 8 }} noValidate>
      <input type="hidden" name="reserva_id" value={reservaId} />
      <input type="hidden" name="cidade_ibge" value={v.cidade_ibge} />
      <p className="muted small" style={{ marginTop: 0 }}>Para emitir a nota fiscal quando o hóspede não fez o check-in online. Os dados ficam no titular da reserva.</p>
      <div className="field"><label htmlFor="t_nome">Nome completo</label><input id="t_nome" name="nome" value={v.nome} onChange={muda("nome")} autoComplete="off" />{erro("nome")}</div>
      <div className="grid2">
        <div className="field"><label htmlFor="t_cpf">CPF</label><input id="t_cpf" name="cpf" className="mono" inputMode="numeric" value={v.cpf} onChange={muda("cpf")} placeholder="000.000.000-00" />{erro("cpf")}</div>
        <div className="field"><label htmlFor="t_email">E-mail (opcional)</label><input id="t_email" name="email" type="email" value={v.email} onChange={muda("email")} />{erro("email")}</div>
        <div className="field"><label htmlFor="t_cep">CEP</label><input id="t_cep" name="cep" className="mono" inputMode="numeric" value={v.cep} onChange={(e) => buscarCep(e.target.value)} placeholder="00000-000" />{erro("cep")}</div>
        <div className="field"><label htmlFor="t_num">Número</label><input id="t_num" name="numero" value={v.numero} onChange={muda("numero")} />{erro("numero")}</div>
      </div>
      <div className="field"><label htmlFor="t_log">Rua</label><input id="t_log" name="logradouro" value={v.logradouro} onChange={muda("logradouro")} />{erro("logradouro")}</div>
      <div className="grid2">
        <div className="field"><label htmlFor="t_comp">Complemento</label><input id="t_comp" name="complemento" value={v.complemento} onChange={muda("complemento")} /></div>
        <div className="field"><label htmlFor="t_bairro">Bairro</label><input id="t_bairro" name="bairro" value={v.bairro} onChange={muda("bairro")} />{erro("bairro")}</div>
        <div className="field"><label htmlFor="t_cid">Cidade</label><input id="t_cid" name="cidade" value={v.cidade} onChange={muda("cidade")} />{erro("cidade")}</div>
        <div className="field"><label htmlFor="t_uf">UF</label><input id="t_uf" name="uf" maxLength={2} value={v.uf} onChange={muda("uf")} /></div>
      </div>
      <button className="btn primary" type="submit" disabled={pendente}>{pendente ? "Salvando…" : "Salvar dados do titular"}</button>
      {estado.erro && !estado.campo && <p className="err small" role="alert">{estado.erro}</p>}
      {estado.ok && <p className="ok small" role="status">Salvo! A reserva já pode ter nota emitida.</p>}
    </form>
  );
}
