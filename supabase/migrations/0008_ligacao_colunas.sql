-- A Chegada · migração 0008 — guardar a "ligação de colunas" da planilha de reservas de cada pousada
-- Rode uma vez no Supabase (projeto Achegada): SQL Editor → New query → colar → Run.
-- Guarda só os nomes das colunas (ex.: "nome do hóspede está na coluna Cliente"). Nenhum dado de hóspede.

alter table public.pousadas add column if not exists mapas_planilha jsonb not null default '[]'::jsonb;

notify pgrst, 'reload schema';
