-- A Chegada · migração 0012 — vínculo entre ficha e reserva do sistema
-- Só acrescenta colunas; nenhum dado existente é alterado.
alter table public.reservas add column if not exists descartada_em timestamptz; -- ficha marcada como teste/descartada (some da lista e do relatório)
alter table public.reservas add column if not exists vinculada_em timestamptz;  -- quando a ficha foi ligada à reserva do sistema
notify pgrst, 'reload schema';
