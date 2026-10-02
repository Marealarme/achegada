-- A Chegada · migração inicial (Fase 1)
-- Rode este arquivo uma vez no Supabase: SQL Editor → New query → colar → Run.
-- Regras: toda tabela tem pousada_id; a equipe só enxerga a própria pousada (RLS).
-- O hóspede NUNCA acessa o banco direto: a página dele fala com o servidor, que usa a chave de serviço.

-- ---------- Tabelas ----------
create table if not exists public.pousadas (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  slug text not null unique,
  whatsapp text,
  regras_da_casa text,
  termo_pet text,
  created_at timestamptz not null default now()
);

create table if not exists public.perfis (
  user_id uuid primary key references auth.users (id) on delete cascade,
  pousada_id uuid not null references public.pousadas (id) on delete cascade,
  nome text not null,
  papel text not null default 'recepcao' check (papel in ('dono', 'gerente', 'recepcao')),
  created_at timestamptz not null default now()
);

create table if not exists public.unidades (
  id uuid primary key default gen_random_uuid(),
  pousada_id uuid not null references public.pousadas (id) on delete cascade,
  nome text not null,
  categoria text,
  ordem int not null default 0,
  unique (pousada_id, nome)
);

create table if not exists public.reservas (
  id uuid primary key default gen_random_uuid(),
  pousada_id uuid not null references public.pousadas (id) on delete cascade,
  unidade_id uuid references public.unidades (id) on delete set null,
  titular text not null,
  telefone text,
  check_in date not null,
  check_out date not null,
  adultos int not null default 2 check (adultos between 1 and 12),
  criancas int not null default 0 check (criancas between 0 and 12),
  token text not null unique,
  fnrh_concluida boolean not null default false,
  criado_por uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  check (check_out > check_in)
);
create index if not exists reservas_pousada_checkin on public.reservas (pousada_id, check_in);

create table if not exists public.pre_chegadas (
  id uuid primary key default gen_random_uuid(),
  reserva_id uuid not null unique references public.reservas (id) on delete cascade,
  pousada_id uuid not null references public.pousadas (id) on delete cascade,
  horario_chegada time,
  placa text,
  pet_tem boolean not null default false,
  pet_nome text,
  pet_especie text,
  pet_porte text,
  late_checkout boolean not null default false,
  aceite_regras_em timestamptz not null,
  aceite_pet_em timestamptz,
  ip text,
  created_at timestamptz not null default now()
);

-- Cadastro permanente de hóspedes (um registro por pessoa, reaproveitado nas próximas estadias)
create table if not exists public.hospedes (
  id uuid primary key default gen_random_uuid(),
  pousada_id uuid not null references public.pousadas (id) on delete cascade,
  nome text not null,
  cpf text not null check (cpf ~ '^[0-9]{11}$'),
  data_nascimento date,
  telefone text,
  consentimento_marketing_em timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (pousada_id, cpf)
);

create table if not exists public.hospedes_reserva (
  hospede_id uuid not null references public.hospedes (id) on delete cascade,
  reserva_id uuid not null references public.reservas (id) on delete cascade,
  pousada_id uuid not null references public.pousadas (id) on delete cascade,
  papel text not null check (papel in ('titular', 'acompanhante')),
  status_fnrh text not null default 'pendente' check (status_fnrh in ('pendente', 'concluido', 'erro')),
  primary key (hospede_id, reserva_id)
);

-- ---------- Segurança (RLS) ----------
create or replace function public.minha_pousada()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select pousada_id from public.perfis where user_id = auth.uid()
$$;

alter table public.pousadas enable row level security;
alter table public.perfis enable row level security;
alter table public.unidades enable row level security;
alter table public.reservas enable row level security;
alter table public.pre_chegadas enable row level security;
alter table public.hospedes enable row level security;
alter table public.hospedes_reserva enable row level security;

drop policy if exists "equipe ve a pousada" on public.pousadas;
create policy "equipe ve a pousada" on public.pousadas
  for select to authenticated using (id = public.minha_pousada());

drop policy if exists "equipe ve o proprio perfil" on public.perfis;
create policy "equipe ve o proprio perfil" on public.perfis
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "equipe le unidades" on public.unidades;
create policy "equipe le unidades" on public.unidades
  for select to authenticated using (pousada_id = public.minha_pousada());

drop policy if exists "equipe le reservas" on public.reservas;
create policy "equipe le reservas" on public.reservas
  for select to authenticated using (pousada_id = public.minha_pousada());
drop policy if exists "equipe cria reservas" on public.reservas;
create policy "equipe cria reservas" on public.reservas
  for insert to authenticated with check (pousada_id = public.minha_pousada());
drop policy if exists "equipe altera reservas" on public.reservas;
create policy "equipe altera reservas" on public.reservas
  for update to authenticated using (pousada_id = public.minha_pousada()) with check (pousada_id = public.minha_pousada());

drop policy if exists "equipe le pre-chegadas" on public.pre_chegadas;
create policy "equipe le pre-chegadas" on public.pre_chegadas
  for select to authenticated using (pousada_id = public.minha_pousada());

drop policy if exists "equipe le hospedes" on public.hospedes;
create policy "equipe le hospedes" on public.hospedes
  for select to authenticated using (pousada_id = public.minha_pousada());

drop policy if exists "equipe le hospedes da reserva" on public.hospedes_reserva;
create policy "equipe le hospedes da reserva" on public.hospedes_reserva
  for select to authenticated using (pousada_id = public.minha_pousada());
drop policy if exists "equipe altera status fnrh" on public.hospedes_reserva;
create policy "equipe altera status fnrh" on public.hospedes_reserva
  for update to authenticated using (pousada_id = public.minha_pousada()) with check (pousada_id = public.minha_pousada());

-- ---------- Dados iniciais: Lua Chalés ----------
insert into public.pousadas (nome, slug, regras_da_casa, termo_pet)
values (
  'Lua Chalés', 'lua',
  E'Silêncio das 23h às 8h na área da piscina e dos chalés.\nChurrasqueira de uso exclusivo do chalé, com limpeza ao final.\nVisitantes somente com autorização da recepção.',
  E'Pets são super bem-vindos!\nO pet deve permanecer sob responsabilidade e supervisão do tutor.'
)
on conflict (slug) do nothing;

insert into public.unidades (pousada_id, nome, categoria, ordem)
select p.id, u.nome, u.categoria, u.ordem
from public.pousadas p
cross join (values
  ('Mezanino 1', 'Mezanino', 1), ('Mezanino 2', 'Mezanino', 2), ('Mezanino 3', 'Mezanino', 3),
  ('Mezanino 4', 'Mezanino', 4), ('Mezanino 5', 'Mezanino', 5), ('Mezanino 6', 'Mezanino', 6),
  ('Suíte 1', 'Suíte', 7), ('Suíte 2', 'Suíte', 8), ('Suíte 3', 'Suíte', 9), ('Suíte 4', 'Suíte', 10),
  ('Villa 1', 'Villa', 11), ('Villa 2', 'Villa', 12), ('Villa 3', 'Villa', 13)
) as u (nome, categoria, ordem)
where p.slug = 'lua'
on conflict (pousada_id, nome) do nothing;

-- ---------- Depois de criar seu usuário (Authentication → Users → Add user) ----------
-- Troque o e-mail abaixo pelo seu e rode só este bloco:
-- insert into public.perfis (user_id, pousada_id, nome, papel)
-- select u.id, p.id, 'Marcello', 'dono'
-- from auth.users u, public.pousadas p
-- where u.email = 'contato@luachales.com.br' and p.slug = 'lua';
