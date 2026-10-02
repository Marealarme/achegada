"use client";

import { useFormStatus } from "react-dom";

/** Botão de formulário que mostra "Aguarde…" enquanto o servidor (e o governo) respondem. */
export default function BotaoAcao({ children, className = "btn", aguardando = "Aguarde…" }: { children: React.ReactNode; className?: string; aguardando?: string }) {
  const { pending } = useFormStatus();
  return (
    <button className={className} type="submit" disabled={pending} aria-busy={pending}>
      {pending ? aguardando : children}
    </button>
  );
}
