-- A Chegada · migração 0004 — Fase 2: envio automático da ficha à FNRH
-- Rode uma vez no Supabase (projeto Achegada): SQL Editor → New query → colar → Run.

-- Dados da ficha que ficam no cadastro permanente (não sensíveis)
alter table public.hospedes add column if not exists email text;
alter table public.hospedes add column if not exists genero text;
alter table public.hospedes add column if not exists nacionalidade text default 'BR';
alter table public.hospedes add column if not exists pais_residencia text default 'BR';
alter table public.hospedes add column if not exists cep text;
alter table public.hospedes add column if not exists logradouro text;
alter table public.hospedes add column if not exists numero text;
alter table public.hospedes add column if not exists complemento text;
alter table public.hospedes add column if not exists bairro text;
alter table public.hospedes add column if not exists cidade text;
alter table public.hospedes add column if not exists cidade_ibge int;
alter table public.hospedes add column if not exists uf text;

-- Estrangeiros: passaporte no lugar do CPF
alter table public.hospedes alter column cpf drop not null;
alter table public.hospedes drop constraint if exists hospedes_cpf_check;
alter table public.hospedes add column if not exists passaporte text;
do $$ begin
  alter table public.hospedes add constraint hospedes_documento_check
    check ((cpf is not null and cpf ~ '^[0-9]{11}$') or (cpf is null and passaporte is not null));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.hospedes add constraint hospedes_pousada_passaporte_key unique (pousada_id, passaporte);
exception when duplicate_object or duplicate_table then null; end $$;

-- Dados da viagem
alter table public.pre_chegadas add column if not exists motivo_viagem text;
alter table public.pre_chegadas add column if not exists meio_transporte text;

-- Situação da ficha no governo, por reserva
alter table public.reservas add column if not exists fnrh_reserva_id text;
alter table public.reservas add column if not exists fnrh_status text not null default 'nao_enviado'
  check (fnrh_status in ('nao_enviado', 'enviando', 'enviado', 'erro'));
alter table public.reservas add column if not exists fnrh_erro text;
alter table public.reservas add column if not exists fnrh_enviado_em timestamptz;
alter table public.reservas add column if not exists checkin_em timestamptz;
alter table public.reservas add column if not exists checkout_em timestamptz;

-- Fila de envio: guarda o pacote da ficha só até o governo confirmar.
-- Raça/cor e deficiência (dados sensíveis) existem SOMENTE aqui e são apagados após o envio.
create table if not exists public.fnrh_envios (
  reserva_id uuid primary key references public.reservas (id) on delete cascade,
  pousada_id uuid not null references public.pousadas (id) on delete cascade,
  payload jsonb,
  tentativas int not null default 0,
  ultimo_erro text,
  created_at timestamptz not null default now(),
  enviado_em timestamptz
);
alter table public.fnrh_envios enable row level security;
-- sem políticas: só o servidor (chave de serviço) acessa esta tabela

notify pgrst, 'reload schema';
