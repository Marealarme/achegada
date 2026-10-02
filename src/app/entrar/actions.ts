"use server";

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
