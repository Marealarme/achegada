"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { supabaseEquipe } from "@/lib/supabase";

export async function entrar(_: string, form: FormData): Promise<string> {
  const email = String(form.get("email") ?? "").trim();
  const senha = String(form.get("senha") ?? "");
  if (!email || !senha) return "Informe e-mail e senha.";
  const db = await supabaseEquipe();
  const { error } = await db.auth.signInWithPassword({ email, password: senha });
  if (error) return "E-mail ou senha incorretos.";
  redirect("/painel");
}

export async function sair() {
  const db = await supabaseEquipe();
  await db.auth.signOut();
  redirect("/entrar");
}

/** "Esqueci minha senha": manda o link por e-mail. Responde igual exista ou não a conta (não revela e-mails cadastrados). */
export async function pedirNovaSenha(_: string, form: FormData): Promise<string> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "erro:Informe um e-mail válido.";
  const h = await headers();
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? `https://${h.get("host")}`;
  const db = await supabaseEquipe();
  const { error } = await db.auth.resetPasswordForEmail(email, { redirectTo: `${base}/auth/confirmar?proximo=/nova-senha` });
  if (error && /rate|limit|seconds/i.test(error.message)) return "erro:Muitos pedidos seguidos. Espere alguns minutos e tente de novo.";
  if (error) {
    console.error("[senha] falha ao enviar e-mail de recuperação:", error.message);
    return "erro:Não conseguimos enviar o e-mail agora. Tente de novo em alguns minutos.";
  }
  return "ok";
}

/** Grava a nova senha de quem está logado (vindo do link do e-mail ou do botão "Trocar senha"). */
export async function salvarNovaSenha(_: string, form: FormData): Promise<string> {
  const senha = String(form.get("senha") ?? "");
  const confirma = String(form.get("confirma") ?? "");
  if (senha.length < 8) return "A senha precisa ter pelo menos 8 caracteres.";
  if (senha !== confirma) return "As duas senhas não são iguais.";
  const db = await supabaseEquipe();
  const { data } = await db.auth.getUser();
  if (!data.user) return "O link expirou. Peça um novo em “Esqueci minha senha”.";
  const { error } = await db.auth.updateUser({ password: senha });
  if (error) return /different|same/i.test(error.message) ? "Escolha uma senha diferente da atual." : "Não foi possível salvar a senha. Tente de novo.";
  redirect("/painel?senha=ok");
}
