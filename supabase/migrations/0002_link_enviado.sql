-- A Chegada · migração 0002
-- Registra quando a recepção enviou o link ao hóspede (status "Aguardando hóspede").
-- Rode uma vez no Supabase: SQL Editor → New query → colar → Run.
alter table public.reservas add column if not exists link_enviado_em timestamptz;
