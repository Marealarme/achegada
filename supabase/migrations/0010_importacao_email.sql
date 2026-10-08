-- Importação de reservas por e-mail: cada pousada ganha um endereço próprio
-- (ex.: luachales-k7p2@mail.innexperts.com.br). Quem manda a planilha para esse
-- endereço tem as reservas importadas sozinhas.
alter table public.pousadas add column if not exists email_importacao text unique;
-- resultado do último e-mail recebido, para mostrar no painel
alter table public.pousadas add column if not exists ultima_importacao_email jsonb;
