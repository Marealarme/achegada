-- A Chegada · migração 0005 — importação de reservas do Hotel Link
-- Rode uma vez no Supabase (projeto Achegada): SQL Editor → New query → colar → Run.

alter table public.reservas add column if not exists referencia_externa text;  -- "Referência #" do Hotel Link
alter table public.reservas add column if not exists origem text;              -- Booking.com, Airbnb, Widget de Reserva…
alter table public.reservas add column if not exists ota_referencia text;      -- "OTA Referência"
create unique index if not exists reservas_pousada_referencia_key
  on public.reservas (pousada_id, referencia_externa) where referencia_externa is not null;

-- Os chalés passam a ter os nomes reais do Hotel Link (criados na importação).
-- Remove os nomes genéricos ("Mezanino 1"…) que não estão em nenhuma reserva.
delete from public.unidades u
where u.nome ~ '^(Mezanino|Suíte|Villa) [0-9]+$'
  and not exists (select 1 from public.reservas r where r.unidade_id = u.id);

notify pgrst, 'reload schema';
