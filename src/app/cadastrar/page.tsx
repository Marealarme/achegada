import type { Metadata } from "next";
import Link from "next/link";
import { supabaseEquipe } from "@/lib/supabase";
import FormCadastro from "./FormCadastro";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Criar conta" };

export default async function Cadastrar() {
  const { data } = await (await supabaseEquipe()).auth.getUser();
  return (
    <main className="wrap">
      <div className="panel login" style={{ maxWidth: 480 }}>
        <div>
          <span className="label">A Chegada · 30 dias grátis</span>
          <h1>Crie a conta da sua pousada</h1>
          <p className="muted small">Check-in online pelo WhatsApp e ficha do governo (FNRH) enviada sozinha. Sem fidelidade: cancele quando quiser.</p>
        </div>
        <FormCadastro logado={!!data.user} />
        {!data.user && <p className="muted small">Já tem conta? <Link href="/entrar">Entrar</Link></p>}
      </div>
    </main>
  );
}
