-- Valor da reserva (vem da planilha importada). Só a equipe vê: usado no relatório para nota fiscal.
alter table public.reservas add column if not exists valor_total numeric(12,2);
alter table public.reservas add column if not exists valor_pago numeric(12,2);
