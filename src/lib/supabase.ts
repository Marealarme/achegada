import { createServerClient } from "@supabase/ssr";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

function env(nome: string): string {
  const v = process.env[nome];
  if (!v) throw new Error(`Variável de ambiente ausente: ${nome}`);
  return v;
}

/** Cliente com o login da equipe (respeita as regras de segurança por pousada). */
export async function supabaseEquipe() {
  const store = await cookies();
  return createServerClient(env("NEXT_PUBLIC_SUPABASE_URL"), env("NEXT_PUBLIC_SUPABASE_ANON_KEY"), {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (lista) => {
        try {
          lista.forEach(({ name, value, options }) => store.set(name, value, options));
        } catch {
          // chamado de um Server Component: o middleware renova a sessão
        }
      },
    },
  });
}

/**
 * Cliente de serviço: ignora as regras de segurança.
 * Usar SOMENTE no servidor e SOMENTE depois de validar o token da reserva.
 */
export function supabaseServico() {
  return createSupabaseClient(env("NEXT_PUBLIC_SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
