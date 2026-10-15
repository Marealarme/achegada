-- A Chegada · migração 0015 — adicional pago "Notas fiscais automáticas" (R$ 49/mês) na assinatura.
-- Só cria uma coluna nova (padrão: desligado). O webhook do Stripe liga/desliga conforme a assinatura.
-- Pousadas isentas (como a piloto) têm acesso sem o adicional.
alter table public.pousadas add column if not exists adicional_notas boolean not null default false;
