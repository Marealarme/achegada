"use server";

import { redirect } from "next/navigation";
import { supabaseEquipe, supabaseServico } from "@/lib/supabase";

const txt = (f: FormData, k: string, max = 120) => String(f.get(k) ?? "").trim().slice(0, max);

function slugDe(nome: string) {
  return nome.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "pousada";
}

/** Cria a conta do dono e a pousada. Depois leva para a assinatura (cartão + 30 dias grátis). */
export async function cadastrar(_: string, f: FormData): Promise<string> {
  if (txt(f, "site")) return "Não foi possível concluir."; // armadilha para robôs (campo escondido)
  const pousada = txt(f, "pousada");
  const cidade = txt(f, "cidade", 80);
  const unidades = Number(f.get("unidades"));
  const whatsapp = txt(f, "whatsapp", 20).replace(/\D/g, "");
  const nome = txt(f, "nome", 80);
  const email = txt(f, "email").toLowerCase();
  const senha = String(f.get("senha") ?? "");
  const aceite = f.get("aceite") === "on";

  if (pousada.length < 3) return "Informe o nome da pousada.";
  if (!cidade) return "Informe a cidade.";
  if (!(unidades >= 1 && unidades <= 40)) return "Informe quantos chalés/quartos a pousada tem (até 40).";
  if (whatsapp.length < 10) return "Informe o WhatsApp da pousada com DDD.";
  if (nome.split(/\s+/).length < 2) return "Informe seu nome completo.";

  const equipe = await supabaseEquipe();
  const { data: atual } = await equipe.auth.getUser();
  const logado = atual.user;
  if (!logado) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return "Informe um e-mail válido.";
    if (senha.length < 8) return "A senha precisa ter pelo menos 8 caracteres.";
  }
  if (!aceite) return "Para continuar, aceite os termos de uso e a política de privacidade.";

  const db = supabaseServico();
  let userId = logado?.id;
  if (!userId) {
    const { data, error } = await db.auth.admin.createUser({ email, password: senha, email_confirm: true, user_metadata: { nome } });
    if (error || !data.user) return /already|registered|exists/i.test(error?.message ?? "") ? "Este e-mail já tem conta. Use “Entrar”." : "Não foi possível criar a conta agora. Tente de novo.";
    userId = data.user.id;
  } else {
    const { data: jaTem } = await db.from("perfis").select("user_id").eq("user_id", userId).maybeSingle();
    if (jaTem) redirect("/painel");
  }

  // slug único
  let slug = slugDe(pousada);
  for (let i = 2; ; i++) {
    const { data } = await db.from("pousadas").select("id").eq("slug", slug).maybeSingle();
    if (!data) break;
    slug = `${slugDe(pousada)}-${i}`;
  }
  const { data: nova, error: errP } = await db.from("pousadas").insert({
    nome: pousada, slug, cidade, whatsapp, qtd_unidades: unidades, endereco_mapa: `${pousada} ${cidade}`,
    assinatura_status: "sem_assinatura",
    regras_da_casa: "Silêncio após as 22h.\nVisitantes somente com autorização da recepção.",
    termo_pet: "", politica_cancelamento: "",
  }).select("id").single();
  if (errP || !nova) return "Não foi possível criar a pousada. Tente de novo.";

  const { error: errPerfil } = await db.from("perfis").insert({ user_id: userId, pousada_id: nova.id, nome, papel: "dono" });
  if (errPerfil) return "Não foi possível vincular sua conta à pousada. Tente de novo.";

  if (!logado) {
    const { error } = await equipe.auth.signInWithPassword({ email, password: senha });
    if (error) redirect("/entrar");
  }
  redirect("/painel/assinatura?bemvindo=1");
}
