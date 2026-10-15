-- A Chegada · migração 0013 — notas fiscais de serviço (NFS-e) emitidas pela Digisan
-- Só cria coisas novas; nenhum dado existente é alterado.

-- Configuração da emissão por pousada (CNPJ do prestador e os dados do serviço cadastrado na Digisan).
-- A chave da API NÃO fica aqui: fica só na variável de ambiente DIGISAN_API_KEY do servidor.
alter table public.pousadas add column if not exists nfse_config jsonb;

create table if not exists public.notas_fiscais (
  id uuid primary key default gen_random_uuid(),
  pousada_id uuid not null references public.pousadas (id) on delete cascade,
  reserva_id uuid not null references public.reservas (id) on delete restrict,
  id_externo text not null,                 -- nº da reserva (o mesmo enviado à Digisan)
  digisan_id text,                          -- id da nota na Digisan
  status text not null default 'enviando',  -- enviando | processando | verificar | autorizada | rejeitada | cancelando | cancelada
  numero text,
  serie text,
  codigo_verificacao text,
  mensagem text,                            -- motivo da rejeição / avisos
  valor numeric(12,2),
  competencia date,
  criada_por uuid references auth.users (id) on delete set null,
  criada_em timestamptz not null default now(),
  atualizada_em timestamptz not null default now(),
  autorizada_em timestamptz,
  cancelada_em timestamptz,
  cancelamento_motivo text
);

-- Nunca emitir duas vezes: só pode existir UMA nota ativa (em envio, processando, autorizada…) por reserva.
-- Rejeitada ou cancelada libera para emitir de novo.
create unique index if not exists notas_fiscais_uma_ativa
  on public.notas_fiscais (pousada_id, id_externo)
  where status in ('enviando', 'processando', 'verificar', 'autorizada', 'cancelando');
create index if not exists notas_fiscais_digisan on public.notas_fiscais (digisan_id);
create index if not exists notas_fiscais_reserva on public.notas_fiscais (reserva_id);

-- A equipe só LÊ as notas da própria pousada; quem grava é o servidor (chave de serviço).
alter table public.notas_fiscais enable row level security;
drop policy if exists "equipe ve notas" on public.notas_fiscais;
create policy "equipe ve notas" on public.notas_fiscais
  for select to authenticated using (pousada_id = public.minha_pousada());

notify pgrst, 'reload schema';
