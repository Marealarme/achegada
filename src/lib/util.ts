export const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

export const somenteDigitos = (s: string | null | undefined) => String(s ?? "").replace(/\D/g, "");

export function cpfValido(valor: string): boolean {
  const n = somenteDigitos(valor);
  if (n.length !== 11 || /^(\d)\1{10}$/.test(n)) return false;
  for (let t = 9; t < 11; t++) {
    let soma = 0;
    for (let i = 0; i < t; i++) soma += Number(n[i]) * (t + 1 - i);
    if (((soma * 10) % 11) % 10 !== Number(n[t])) return false;
  }
  return true;
}

export function cpfFormatar(valor: string): string {
  const n = somenteDigitos(valor).slice(0, 11);
  return n
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/(\d{3})\.(\d{3})\.(\d{3})(\d)/, "$1.$2.$3-$4");
}

/** Mostra só o miolo do CPF no painel: ***.456.789-** */
export function cpfMascarado(valor: string): string {
  const n = somenteDigitos(valor);
  return n.length === 11 ? `***.${n.slice(3, 6)}.${n.slice(6, 9)}-**` : "—";
}

/** "2026-10-09" → "9 out" (sem fuso horário, para não voltar um dia) */
export function dataCurta(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${Number(d)} ${MESES[Number(m) - 1]}`;
}

export function partesData(iso: string) {
  const [, m, d] = iso.split("-");
  return { dia: Number(d), mes: MESES[Number(m) - 1] };
}

export function noites(checkIn: string, checkOut: string): number {
  return Math.max(1, Math.round((Date.parse(checkOut) - Date.parse(checkIn)) / 864e5));
}

export function primeiroNome(titular: string): string {
  return titular.startsWith("Família") ? titular : titular.split(" ")[0];
}

export function mensagemWhatsApp(r: { titular: string; unidade: string; check_in: string; check_out: string; link: string }, pousada: string) {
  return `Olá, ${primeiroNome(r.titular)}! Sua reserva na ${pousada} está confirmada: ${r.unidade}, de ${dataCurta(r.check_in)} a ${dataCurta(r.check_out)}.

Para chegar sem fila, faça seu check-in online (leva uns 3 minutos):
${r.link}

Salve este número nos seus contatos para receber nossas informações da estadia. Qualquer dúvida, é só responder por aqui.`;
}

export const FNRH_HOSPEDE_URL = "https://fnrh.turismo.serpro.gov.br/FNRH_Hospede";
