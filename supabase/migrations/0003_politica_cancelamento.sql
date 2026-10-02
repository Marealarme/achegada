-- A Chegada · migração 0003
-- Política de cancelamento por pousada (mostrada e aceita no check-in do hóspede).
-- Rode uma vez no Supabase: SQL Editor → New query → colar → Run.
alter table public.pousadas add column if not exists politica_cancelamento text;

update public.pousadas
set politica_cancelamento = E'Seguimos o Código de Defesa do Consumidor, conforme orientação do Procon.\nCancelamentos solicitados em até 7 dias da data da compra têm reembolso integral.\nApós esse prazo, não há reembolso.'
where slug = 'lua';
