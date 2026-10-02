-- A Chegada · migração 0006 — várias pousadas, configurações e assinatura
-- Rode uma vez no Supabase (projeto Achegada): SQL Editor → New query → colar → Run.

-- ---------- Marca e configuração de cada pousada ----------
alter table public.pousadas add column if not exists cidade text;
alter table public.pousadas add column if not exists logo_url text;
alter table public.pousadas add column if not exists endereco_mapa text;      -- texto buscado no "Como chegar"
alter table public.pousadas add column if not exists qtd_unidades int;
alter table public.pousadas add column if not exists cafe_incluso boolean not null default true;
alter table public.pousadas add column if not exists aviso_early_late text;

-- ---------- Assinatura (Stripe) ----------
alter table public.pousadas add column if not exists plano text;               -- ate10 | ate25 | ate40
alter table public.pousadas add column if not exists assinatura_status text not null default 'sem_assinatura';
  -- sem_assinatura | trialing | active | past_due | canceled | unpaid | incomplete | isenta
alter table public.pousadas add column if not exists teste_ate timestamptz;
alter table public.pousadas add column if not exists stripe_customer_id text;
alter table public.pousadas add column if not exists stripe_subscription_id text;
alter table public.pousadas add column if not exists created_at timestamptz not null default now();

-- A Lua Chalés é a pousada-piloto: não paga.
update public.pousadas
set assinatura_status = 'isenta', cidade = coalesce(cidade, 'Maresias'), logo_url = coalesce(logo_url, '/logo-lua.png'),
    endereco_mapa = coalesce(endereco_mapa, 'Lua Chalés Maresias'), qtd_unidades = coalesce(qtd_unidades, 13),
    aviso_early_late = coalesce(aviso_early_late, 'Dependem de disponibilidade e devem ser solicitados diretamente à nossa gerente, pelo WhatsApp da pousada.')
where slug = 'lua';

-- ---------- Segredos por pousada (chave da API FNRH, criptografada pelo servidor) ----------
create table if not exists public.pousada_segredos (
  pousada_id uuid primary key references public.pousadas (id) on delete cascade,
  fnrh_usuario text,
  fnrh_senha_cripto text,
  fnrh_cpf_cripto text,
  fnrh_ambiente text not null default 'producao' check (fnrh_ambiente in ('producao', 'homologacao')),
  updated_at timestamptz not null default now()
);
alter table public.pousada_segredos enable row level security;
-- sem políticas: só o servidor (chave de serviço) acessa

-- ---------- Quem pode editar o quê ----------
create or replace function public.meu_papel()
returns text language sql stable security definer set search_path = public as $$
  select papel from public.perfis where user_id = auth.uid()
$$;

drop policy if exists "dono altera a pousada" on public.pousadas;
create policy "dono altera a pousada" on public.pousadas
  for update to authenticated
  using (id = public.minha_pousada() and public.meu_papel() in ('dono', 'gerente'))
  with check (id = public.minha_pousada());

drop policy if exists "equipe ve colegas" on public.perfis;
create policy "equipe ve colegas" on public.perfis
  for select to authenticated using (pousada_id = public.minha_pousada());

drop policy if exists "gerencia altera unidades" on public.unidades;
create policy "gerencia altera unidades" on public.unidades
  for all to authenticated
  using (pousada_id = public.minha_pousada() and public.meu_papel() in ('dono', 'gerente'))
  with check (pousada_id = public.minha_pousada());

drop policy if exists "equipe exclui reservas" on public.reservas;
create policy "equipe exclui reservas" on public.reservas
  for delete to authenticated using (pousada_id = public.minha_pousada());

-- ---------- Logos (arquivos públicos) ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('logos', 'logos', true, 2097152, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;

notify pgrst, 'reload schema';
