"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { sessaoEquipe } from "@/lib/sessao";
import { vincular } from "@/lib/vinculo";

/** Liga a ficha (card sem nº) à reserva importada escolhida na tela "Fichas sem reserva". */
export async function vincularFicha(form: FormData) {
  const s = await sessaoEquipe();
  const erro = await vincular(s.db, s.pousada.id, String(form.get("ficha") ?? ""), String(form.get("reserva") ?? ""), s.userId);
  revalidatePath("/painel/sem-reserva");
  revalidatePath("/painel");
  redirect(erro ? `/painel/sem-reserva?erro=${encodeURIComponent(erro)}` : "/painel/sem-reserva?ok=vinculada");
}

/** Marca a ficha como teste/descartada: sai desta tela, da lista de reservas e do relatório de notas. Nada é apagado. */
export async function descartarFicha(form: FormData) {
  const s = await sessaoEquipe();
  const id = String(form.get("ficha") ?? "");
  await s.db.from("reservas").update({ descartada_em: new Date().toISOString() }).eq("id", id).eq("pousada_id", s.pousada.id).is("referencia_externa", null);
  revalidatePath("/painel/sem-reserva");
  revalidatePath("/painel");
}

/** Desfaz o "teste/descartar". */
export async function restaurarFicha(form: FormData) {
  const s = await sessaoEquipe();
  await s.db.from("reservas").update({ descartada_em: null }).eq("id", String(form.get("ficha") ?? "")).eq("pousada_id", s.pousada.id);
  revalidatePath("/painel/sem-reserva");
  revalidatePath("/painel");
}
