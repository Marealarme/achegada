"use server";

import { revalidatePath } from "next/cache";
import { sessaoEquipe, podeConfigurar } from "@/lib/sessao";
import { supabaseServico } from "@/lib/supabase";
import { cifrar, criptoDisponivel } from "@/lib/cripto";
import { cpfValido } from "@/lib/util";
import { cidadeOficial } from "@/lib/municipios";

const txt = (f: FormData, k: string, max = 2000) => String(f.get(k) ?? "").trim().slice(0, max);
const SEM_PERMISSAO = "Só o dono ou a gerência podem alterar as configurações.";

export async function salvarDados(_: string, f: FormData): Promise<string> {
  const s = await sessaoEquipe();
  if (!podeConfigurar(s)) return SEM_PERMISSAO;
  const nome = txt(f, "nome", 120);
  const qtd = Number(f.get("qtd_unidades"));
  if (nome.length < 3) return "Informe o nome da pousada.";
  const uf = txt(f, "uf", 2).toUpperCase();
  const cidadeDigitada = txt(f, "cidade", 80);
  const cidade = uf ? cidadeOficial(uf, cidadeDigitada) : null;
  if (uf && cidadeDigitada && !cidade) return "Escolha a cidade na lista do estado selecionado.";
  const dados = {
    nome,
    cidade: cidade ?? (cidadeDigitada || null),
    whatsapp: txt(f, "whatsapp", 20).replace(/\D/g, "") || null,
    endereco_mapa: txt(f, "endereco_mapa", 200) || null,
    qtd_unidades: qtd >= 1 && qtd <= 200 ? qtd : null,
    cafe_incluso: f.get("cafe_incluso") === "on",
    aviso_early_late: txt(f, "aviso_early_late", 400) || null,
    regras_da_casa: txt(f, "regras_da_casa") || null,
    termo_pet: txt(f, "termo_pet") || null,
    politica_cancelamento: txt(f, "politica_cancelamento") || null,
  };
  let { error } = await s.db.from("pousadas").update({ ...dados, uf: uf || null }).eq("id", s.pousada.id);
  if (error && /uf/.test(error.message)) ({ error } = await s.db.from("pousadas").update(dados).eq("id", s.pousada.id)); // sem a migração 0009
  if (error) return "Não foi possível salvar. Tente de novo.";
  revalidatePath("/painel", "layout");
  return "Salvo.";
}

export async function enviarLogo(_: string, f: FormData): Promise<string> {
  const s = await sessaoEquipe();
  if (!podeConfigurar(s)) return SEM_PERMISSAO;
  const arq = f.get("logo");
  if (!(arq instanceof File) || arq.size === 0) return "Escolha uma imagem.";
  if (arq.size > 2_000_000) return "A imagem precisa ter até 2 MB.";
  const tipos: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };
  const ext = tipos[arq.type];
  if (!ext) return "Use uma imagem PNG, JPG ou WEBP.";
  const db = supabaseServico();
  const caminho = `${s.pousada.id}/logo-${Date.now()}.${ext}`;
  const { error } = await db.storage.from("logos").upload(caminho, new Uint8Array(await arq.arrayBuffer()), { contentType: arq.type, upsert: true });
  if (error) return "Não foi possível enviar a imagem. Confira se a migração 0006 foi rodada.";
  const url = db.storage.from("logos").getPublicUrl(caminho).data.publicUrl;
  await db.from("pousadas").update({ logo_url: url }).eq("id", s.pousada.id);
  revalidatePath("/painel", "layout");
  return "Logo atualizado.";
}

export async function adicionarChale(_: string, f: FormData): Promise<string> {
  const s = await sessaoEquipe();
  if (!podeConfigurar(s)) return SEM_PERMISSAO;
  const nomes = txt(f, "nomes", 4000).split(/\n|;/).map((n) => n.trim()).filter(Boolean).slice(0, 100);
  if (!nomes.length) return "Escreva o nome do chalé/quarto (um por linha).";
  const { error } = await s.db.from("unidades").upsert(nomes.map((nome, i) => ({ pousada_id: s.pousada.id, nome, ordem: i })), { onConflict: "pousada_id,nome", ignoreDuplicates: true });
  if (error) return "Não foi possível salvar.";
  revalidatePath("/painel", "layout");
  return `${nomes.length} salvo(s).`;
}

export async function removerChale(f: FormData) {
  const s = await sessaoEquipe();
  if (!podeConfigurar(s)) return;
  await s.db.from("unidades").delete().eq("id", String(f.get("id") ?? "")).eq("pousada_id", s.pousada.id);
  revalidatePath("/painel", "layout");
}

export async function salvarFnrh(_: string, f: FormData): Promise<string> {
  const s = await sessaoEquipe();
  if (!podeConfigurar(s)) return SEM_PERMISSAO;
  if (!criptoDisponivel()) return "O servidor ainda não tem a chave de criptografia (CRIPTO_CHAVE). Fale com o suporte.";
  const usuario = txt(f, "usuario", 200);
  const senha = String(f.get("senha") ?? "").trim();
  const cpf = txt(f, "cpf", 20).replace(/\D/g, "");
  const ambiente = f.get("ambiente") === "homologacao" ? "homologacao" : "producao";
  if (!usuario || !senha) return "Informe o usuário e a chave da “Chave das API's” da FNRH.";
  if (!cpfValido(cpf)) return "Informe o CPF do responsável pela FNRH (o mesmo cadastrado no Cadastur).";
  const { error } = await supabaseServico().from("pousada_segredos").upsert({
    pousada_id: s.pousada.id, fnrh_usuario: usuario, fnrh_senha_cripto: cifrar(senha), fnrh_cpf_cripto: cifrar(cpf),
    fnrh_ambiente: ambiente, updated_at: new Date().toISOString(),
  });
  if (error) return "Não foi possível salvar. Confira se a migração 0006 foi rodada.";
  revalidatePath("/painel", "layout");
  return "Chave da FNRH salva. As próximas fichas serão enviadas automaticamente.";
}

export async function adicionarMembro(_: string, f: FormData): Promise<string> {
  const s = await sessaoEquipe();
  if (s.perfil.papel !== "dono") return "Só o dono pode cadastrar a equipe.";
  const nome = txt(f, "nome", 80);
  const email = txt(f, "email", 120).toLowerCase();
  const senha = String(f.get("senha") ?? "");
  const papel = f.get("papel") === "gerente" ? "gerente" : "recepcao";
  if (nome.length < 2) return "Informe o nome.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return "Informe um e-mail válido.";
  if (senha.length < 8) return "A senha provisória precisa ter pelo menos 8 caracteres.";
  const db = supabaseServico();
  const { data, error } = await db.auth.admin.createUser({ email, password: senha, email_confirm: true, user_metadata: { nome } });
  if (error || !data.user) return /already|registered|exists/i.test(error?.message ?? "") ? "Este e-mail já tem conta no A Chegada." : "Não foi possível criar o acesso.";
  const { error: e2 } = await db.from("perfis").insert({ user_id: data.user.id, pousada_id: s.pousada.id, nome, papel });
  if (e2) { await db.auth.admin.deleteUser(data.user.id); return "Não foi possível vincular à pousada."; }
  revalidatePath("/painel/config");
  return `Acesso criado. Passe para ${nome}: e-mail ${email} e a senha provisória que você definiu.`;
}

export async function removerMembro(f: FormData) {
  const s = await sessaoEquipe();
  const id = String(f.get("id") ?? "");
  if (s.perfil.papel !== "dono" || id === s.userId) return;
  const db = supabaseServico();
  const { data: alvo } = await db.from("perfis").select("user_id").eq("user_id", id).eq("pousada_id", s.pousada.id).maybeSingle();
  if (!alvo) return;
  await db.auth.admin.deleteUser(id); // apaga o perfil junto (on delete cascade)
  revalidatePath("/painel/config");
}
