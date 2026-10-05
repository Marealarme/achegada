"use client";

import { useActionState } from "react";
import { enviarSemApagar } from "@/lib/enviarSemApagar";
import Link from "next/link";
import { cadastrar } from "./actions";
import CampoCidade from "../CampoCidade";

export default function FormCadastro({ logado }: { logado: boolean }) {
  const [erro, acao, pendente] = useActionState(cadastrar, "");
  return (
    <form onSubmit={enviarSemApagar(acao)} className="secao">
      <div className="field"><label htmlFor="pousada">Nome da pousada</label><input id="pousada" name="pousada" type="text" required /></div>
      <CampoCidade obrigatorio />
      <div className="field"><label htmlFor="unidades">Chalés / quartos</label><input id="unidades" name="unidades" type="number" min={1} max={40} required /></div>
      <div className="field"><label htmlFor="whatsapp">WhatsApp da pousada</label><input id="whatsapp" name="whatsapp" type="tel" placeholder="(12) 99999-9999" required /></div>
      <div className="field"><label htmlFor="nome">Seu nome completo</label><input id="nome" name="nome" type="text" autoComplete="name" required /></div>
      {!logado && (
        <div className="grid2">
          <div className="field"><label htmlFor="email">E-mail</label><input id="email" name="email" type="email" autoComplete="email" required /></div>
          <div className="field"><label htmlFor="senha">Senha</label><input id="senha" name="senha" type="password" autoComplete="new-password" minLength={8} required /><span className="hint">Mínimo de 8 caracteres</span></div>
        </div>
      )}
      <input name="zq_hp_7" type="text" tabIndex={-1} autoComplete="nope" data-lpignore="true" data-1p-ignore="" aria-hidden="true" style={{ position: "absolute", left: "-9999px" }} />
      <label className="check"><input id="aceite" name="aceite" type="checkbox" /><span>Li e aceito os <Link href="/termos" target="_blank">termos de uso e a política de privacidade</Link>.</span></label>
      {erro && <p className="err" role="alert">{erro}</p>}
      <button className="btn primary block" type="submit" disabled={pendente}>{pendente ? "Criando…" : "Criar conta e continuar"}</button>
      <p className="muted small">No próximo passo você cadastra o cartão. Nada é cobrado nos primeiros 30 dias.</p>
    </form>
  );
}
