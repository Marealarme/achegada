-- Café da manhã por reserva: com ou sem café em cada reserva.
-- Vazio (null) = segue a configuração da pousada (pousadas.cafe_incluso). Só acrescenta a coluna; nada existente muda.
alter table public.reservas add column if not exists cafe_incluso boolean;
