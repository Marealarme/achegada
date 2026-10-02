-- A Chegada · migração 0007 — cancelar reserva (card) no painel
-- Rode uma vez no Supabase (projeto Achegada): SQL Editor → New query → colar → Run.
-- O card cancelado some da lista, mas o cadastro dos hóspedes que já fizeram check-in continua guardado.

alter table public.reservas add column if not exists cancelada_em timestamptz;
alter table public.reservas add column if not exists cancelada_por uuid references auth.users (id) on delete set null;

notify pgrst, 'reload schema';
