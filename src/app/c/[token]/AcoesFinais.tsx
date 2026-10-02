/** Botões da tela final do hóspede: voltar ao WhatsApp da pousada e abrir o caminho no mapa. */
export function linkWhatsApp(numero: string | null | undefined, texto?: string) {
  let n = String(numero ?? "").replace(/\D/g, "");
  if (!n) return null;
  if (n.length <= 11) n = "55" + n;
  return `https://wa.me/${n}${texto ? `?text=${encodeURIComponent(texto)}` : ""}`;
}

export default function AcoesFinais({ pousada, whatsapp }: { pousada: string; whatsapp: string | null }) {
  const mapa = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(pousada)}`;
  const wa = linkWhatsApp(whatsapp);
  return (
    <div className="acoes">
      <a className="btn primary block" href={mapa} target="_blank" rel="noopener noreferrer">Como chegar</a>
      {wa && <a className="btn block" href={wa} target="_blank" rel="noopener noreferrer">Voltar para a conversa no WhatsApp</a>}
    </div>
  );
}
