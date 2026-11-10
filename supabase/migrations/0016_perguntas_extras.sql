-- Perguntas da pousada: perguntas extras que cada pousada configura para o check-in online
-- (ex.: "Onde nos encontrou?", "Composição do grupo", "Agendamento da churrasqueira").
-- Só acrescenta colunas; nenhum dado existente muda.
alter table public.pousadas add column if not exists perguntas_extras jsonb not null default '[]'::jsonb;
-- respostas do hóspede: lista [{ id, pergunta, resposta }] com o texto da pergunta no momento da resposta
alter table public.pre_chegadas add column if not exists respostas_extras jsonb;
