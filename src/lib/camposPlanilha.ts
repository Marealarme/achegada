// Campos que o A Chegada lê de qualquer planilha de reservas (usado no servidor e na tela de ligar colunas).

export const CAMPOS = [
  { id: "titular", rotulo: "Nome do hóspede (titular)", obrigatorio: true, sinonimos: ["Nome do titular", "Titular", "Nome do hóspede", "Hóspede", "Nome", "Cliente", "Guest name", "Guest", "Huésped", "Nome completo"] },
  { id: "checkIn", rotulo: "Data de check-in", obrigatorio: true, sinonimos: ["Check-in", "Checkin", "Data de entrada", "Data de chegada", "Entrada", "Chegada", "Arrival", "Llegada", "In"] },
  { id: "checkOut", rotulo: "Data de check-out", obrigatorio: true, sinonimos: ["Check-out", "Checkout", "Data de saída", "Saída", "Partida", "Departure", "Salida", "Out"] },
  { id: "referencia", rotulo: "Código da reserva", obrigatorio: false, sinonimos: ["Código da reserva", "Nº da reserva", "Número da reserva", "Reserva", "Localizador", "Referência", "Booking ID", "Reservation ID", "Confirmation", "Código", "ID", "Nº", "N°", "No", "Num"] },
  { id: "telefone", rotulo: "WhatsApp / telefone", obrigatorio: false, sinonimos: ["WhatsApp", "Celular", "Telefone", "Fone", "Phone", "Mobile", "Contato"] },
  { id: "adultos", rotulo: "Adultos (ou total de hóspedes)", obrigatorio: false, sinonimos: ["Adultos", "Adults", "Nº de adultos", "Pax", "Hóspedes", "Pessoas", "Guests", "Ocupação"] },
  { id: "criancas", rotulo: "Crianças", obrigatorio: false, sinonimos: ["Crianças", "Children", "Kids", "Niños", "CHD"] },
  { id: "quarto", rotulo: "Chalé ou quarto", obrigatorio: false, sinonimos: ["Chalé ou quarto", "Chalé", "Quarto", "Acomodação", "Unidade", "Apartamento", "UH", "Room", "Habitación", "Tipo de quarto"] },
  { id: "canal", rotulo: "Canal / origem", obrigatorio: false, sinonimos: ["Canal", "Origem", "Source", "Channel", "OTA", "Agência", "Origen"] },
  { id: "codCanal", rotulo: "Código no canal (Booking, Airbnb…)", obrigatorio: false, sinonimos: ["Código no canal", "Código OTA", "Localizador OTA", "OTA reference", "Channel reference"] },
  { id: "situacao", rotulo: "Situação (confirmada/cancelada)", obrigatorio: false, sinonimos: ["Situação", "Status", "Estado"] },
] as const;
export type Campo = (typeof CAMPOS)[number]["id"];
