-- A Chegada · migração 0009 — estado (UF) da pousada, ao lado da cidade
-- Rode uma vez no Supabase (projeto Achegada): SQL Editor → New query → colar → Run.

alter table public.pousadas add column if not exists uf text;

notify pgrst, 'reload schema';
