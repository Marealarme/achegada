import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { supabaseEquipe } from "@/lib/supabase";

// Destino do link do e-mail (recuperar senha). Troca o código por uma sessão e segue para a tela de nova senha.
export async function GET(req: NextRequest) {
  const url = req.nextUrl;
  const proximo = url.searchParams.get("proximo") ?? "/nova-senha";
  const destino = proximo.startsWith("/") && !proximo.startsWith("//") ? proximo : "/nova-senha";
  const db = await supabaseEquipe();

  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const tipo = url.searchParams.get("type") as EmailOtpType | null;
  const { error } = code
    ? await db.auth.exchangeCodeForSession(code)
    : tokenHash && tipo
      ? await db.auth.verifyOtp({ token_hash: tokenHash, type: tipo })
      : { error: new Error("sem código") };

  const ir = req.nextUrl.clone();
  ir.search = "";
  if (error) { ir.pathname = "/entrar/esqueci"; ir.searchParams.set("expirado", "1"); }
  else ir.pathname = destino;
  return NextResponse.redirect(ir);
}
